

const crypto = require("crypto");
const http = require("http");
const https = require("https");
const zlib = require("zlib");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const MAX_FILE_BYTES = 64 * 1024 * 1024;
const os = require("os");
const { execSync } = require("child_process");

const DEFAULT_API_URL = "https://nightauth.org/api/v1";
const DEFAULT_SIGNING_PUBLIC_KEY = "cdb2285db481666ce40003aadb874c8751dbeb9a0672a37f740dfe881ecdc742";
const DEFAULT_SEALED_BOX_PUBLIC_KEY = "b773fc4f6cf1a0938e78e714c3d84cb386584bea24728923008471a6cd203213";
const HKDF_INFO = Buffer.from("nightauth-v1-e2e");
const SEAL_INFO = Buffer.from("nightauth-v1-init-seal");

class CryptographicException extends Error {
  constructor(message) {
    super(message);
    this.name = "CryptographicException";
  }
}

class NightAuthStreamException extends Error {
  constructor(statusCode, error, message) {
    super(message || error || "Stream exception");
    this.name = "NightAuthStreamException";
    this.statusCode = statusCode;
    this.error = error;
  }
}

class SseParser {
  static MAX_EVENT_CHARS = 65536;
  constructor(onFrame) {
    this._onFrame = onFrame;
    this._buffer = "";
    this._data = [];
    this._dataChars = 0;
    this._id = null;
    this._skipLf = false;
  }
  push(text) {
    let input = this._buffer + text;
    this._buffer = "";
    if (this._skipLf && input[0] === "\n") input = input.slice(1);
    this._skipLf = false;
    let start = 0;
    for (let i = 0; i < input.length; i++) {
      const c = input[i];
      if (c !== "\n" && c !== "\r") continue;
      this._line(input.slice(start, i));
      if (c === "\r") {
        if (input[i + 1] === "\n") i++;
        else if (i + 1 >= input.length) this._skipLf = true;
      }
      start = i + 1;
    }
    this._buffer = input.slice(start);
    if (this._buffer.length + this._dataChars > SseParser.MAX_EVENT_CHARS) throw new Error("Event exceeds size limit.");
  }
  _line(line) {
    if (line === "") {
      const id = this._id;
      this._id = null;
      if (this._data.length === 0) return;
      const data = this._data.join("\n");
      this._data = [];
      this._dataChars = 0;
      this._onFrame(data, id);
      return;
    }
    if (line[0] === ":") return;
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? "" : line.slice(colon + 1);
    if (value[0] === " ") value = value.slice(1);
    if (field === "data") { this._data.push(value); this._dataChars += value.length + 1; }
    else if (field === "id" && /^\d{1,15}$/.test(value)) this._id = value;
  }
}

class SecurityProtections {
  static _cachedHwid = null;

  static BLACKLISTED_PROCESSES = [
    "fiddler", "wireshark", "httpdebugger", "httpdebuggerui", "x64dbg", "x32dbg",
    "ida", "ida64", "charles", "dnspy", "de4dot", "scylla", "processhacker",
    "cheatengine", "ollydbg"
  ];

  static runSecurityChecks() {
    if (process.env.NIGHTAUTH_IGNORE_SECURITY === "1") return;
    this.checkSystemProxy();
    this.checkBlacklistedProcesses();
  }

  static checkSystemProxy() {
    if (process.env.NIGHTAUTH_IGNORE_SECURITY === "1") return;
    try {
      const p = process.env.http_proxy || process.env.https_proxy || process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
      if (p) {
        throw new Error("System proxy detected. Disable proxies or debuggers to run.");
      }
    } catch (e) {
      if (e.message.includes("proxy detected")) throw e;
    }
  }

  static checkBlacklistedProcesses() {
    if (process.env.NIGHTAUTH_IGNORE_SECURITY === "1") return;
    try {
      if (process.platform === "win32") {
        const out = execSync("tasklist /FO CSV /NH", { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).toLowerCase();
        for (const bad of this.BLACKLISTED_PROCESSES) {
          if (out.includes(bad)) {
            throw new Error(`Blacklisted process detected: ${bad}`);
          }
        }
      }
    } catch (e) {
      if (e.message.includes("Blacklisted process")) throw e;
    }
  }

  static getHardwareId() {
    if (this._cachedHwid) return this._cachedHwid;
    try {
      const hostname = (process.env.COMPUTERNAME || process.env.HOSTNAME || os.hostname() || "unknown_host").trim().toUpperCase();
      const username = (process.env.USERNAME || process.env.USER || os.userInfo().username || "unknown_user").trim().toLowerCase();
      const raw = `${hostname}-${username}-nightauth-hwid`;
      this._cachedHwid = crypto.createHash("sha256").update(raw, "utf8").digest("hex").toLowerCase();
      return this._cachedHwid;
    } catch {
      this._cachedHwid = crypto.createHash("sha256").update(os.hostname(), "utf8").digest("hex").toLowerCase();
      return this._cachedHwid;
    }
  }
}

class Api {

  static SERVER_SIGNING_PUBLIC_KEY = "cdb2285db481666ce40003aadb874c8751dbeb9a0672a37f740dfe881ecdc742";
  static SERVER_SEALED_BOX_PUBLIC_KEY = "b773fc4f6cf1a0938e78e714c3d84cb386584bea24728923008471a6cd203213";
  static HKDF_INFO = Buffer.from("nightauth-v1-e2e");
  static SEAL_INFO = Buffer.from("nightauth-v1-init-seal");

  static isInsecureLoopbackUrl(urlString, allowInsecureLoopback) {
    if (!allowInsecureLoopback) return false;
    let parsed;
    try {
      parsed = new URL(urlString);
    } catch {
      return false;
    }
    if (parsed.protocol !== "http:") return false;
    const host = parsed.hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  }

  static validateApiUrl(value, allowInsecureLoopback = false) {
    const url = new URL(value);
    if (url.username || url.password || url.hash ||
        (url.protocol !== "https:" && !Api.isInsecureLoopbackUrl(value, allowInsecureLoopback))) {
      throw new Error("HTTPS is required; HTTP loopback requires explicit opt-in");
    }
  }

  constructor(name, apiKey, version = "1.0", token = null, apiUrl = null, securityCheck = null, allowInsecureLoopback = false) {
    if (!name) throw new Error("name is required");
    if (!apiKey) throw new Error("apiKey is required");

    this.name = name;
    this.apiKey = apiKey;
    this.version = version || "1.0";
    this.token = token;
    this.apiUrl = (apiUrl || DEFAULT_API_URL).replace(/\/+$/, "");

    this._allowInsecureLoopback = !!allowInsecureLoopback;
    Api.validateApiUrl(this.apiUrl, this._allowInsecureLoopback);

    this.response = { success: false, message: "", error: null };
    this.user = {
      username: "",
      email: "",
      hwid: "",
      ip: "",
      status: "",
      createdAt: "",
      lastLoginAt: "",
      subscriptions: []
    };
    this.app = {
      totalUsers: 0,
      onlineUsers: 0,
      totalKeys: 0,
      version: ""
    };
    this.pendingDownloadUrl = "";
    this.requiredVersion = "";

    this.onSessionInvalidated = null;
    this.onAppBanned = null;
    this.onAppStatusChanged = null;
    this.onVersionUpdated = null;
    this.onChatMessageReceived = null;

    this.onResyncRequired = null;

    this.lastEventId = null;

    this._sessionKey = null;
    this._sharedKey = null;
    this._isInitialized = false;
    this._securityCheck = securityCheck || (() => SecurityProtections.runSecurityChecks());
    this._sseReq = null;
    this._disposed = false;
    this.signingPin = null;
    this._gate = Promise.resolve();
    this.requestTimeoutMs = 30000;

    this._securityCheck();
  }

  async init() {
    this._securityCheck();

    const clientKeyPair = crypto.generateKeyPairSync("x25519");
    const clientJwk = clientKeyPair.publicKey.export({ format: "jwk" });
    const clientPubBytes = Buffer.from(clientJwk.x, "base64url");
    const k1Hex = clientPubBytes.toString("hex").toLowerCase();

    this._sessionKey = null;
    this._sharedKey = null;
    this._isInitialized = false;
    const newSessionKey = crypto.randomBytes(16).toString("hex");

    const payload = {
      apikey: this.apiKey,
      name: this.name,
      version: this.version,
      id: newSessionKey,
      k1: k1Hex
    };

    const sealedPayloadB64 = Api.cryptoBoxSeal(JSON.stringify(payload), Api.SERVER_SEALED_BOX_PUBLIC_KEY);
    const requestBody = JSON.stringify({ p: sealedPayloadB64 });

    let status, respContent;
    try {
      const res = await this._postRaw("/init", requestBody);
      status = res.status;
      respContent = res.body;
    } catch (e) {
      if (e && e.code === "response_too_large") {
        this._setError("Initialization failed: the server reply exceeds the size limit.", "response_too_large");
        return;
      }

      const code = e && e.message === "Request timed out" ? "timeout" : "network_error";
      this.response = { success: false, error: code, message: e && e.message ? e.message : String(e) };
      return;
    }

    if (status !== 200) {

      let refusal = null;
      try { refusal = JSON.parse(respContent); } catch { refusal = null; }
      if (refusal && typeof refusal === "object") {
        if (refusal.downloadUrl) this.pendingDownloadUrl = String(refusal.downloadUrl);
        if (refusal.requiredVersion) this.requiredVersion = String(refusal.requiredVersion);
      }
      if (refusal && typeof refusal === "object" && typeof refusal.error === "string" && refusal.error) {
        this._setError(refusal.message || `Initialization failed: HTTP ${status}`, refusal.error);
      } else if (!refusal || typeof refusal !== "object" || Array.isArray(refusal)) {

        this._setError(`Initialization failed: HTTP ${status}`, "invalid_response");
      } else {
        this._setError(`Initialization failed: HTTP ${status}`, "init_http_error");
      }
      return;
    }

    let respJson;
    try {
      respJson = JSON.parse(respContent);
    } catch {
      respJson = null;
    }
    if (!respJson || typeof respJson !== "object" || Array.isArray(respJson)) {
      this._setError("Failed to parse handshake response", "invalid_response");
      return;
    }

    if (!respJson.success) {
      this._setError(respJson.message || respJson.error || "Failed to initialize handshake", respJson.error);
      return;
    }

    const k2Hex = respJson.k2 || "";
    const ts = respJson.ts || 0;
    const sigB64 = respJson.sig || "";
    const now = Date.now();

    const trustedSigningKey = this.signingPin || Api.SERVER_SIGNING_PUBLIC_KEY;
    if (
      k2Hex.length !== 64 ||
      !Api.verifyServerSignature(k2Hex, trustedSigningKey, ts, sigB64) ||
      ts < now - 90000 ||
      ts > now + 90000
    ) {
      this._setError("Security integrity breach: Invalid server signature.");
      throw new CryptographicException("Untrusted or stale initialization response.");
    }

    const serverPub = crypto.createPublicKey({
      key: { kty: "OKP", crv: "X25519", x: Buffer.from(k2Hex, "hex").toString("base64url") },
      format: "jwk"
    });
    const secret = crypto.diffieHellman({
      privateKey: clientKeyPair.privateKey,
      publicKey: serverPub
    });

    this._sharedKey = Api.hkdfExtractAndExpand(secret, Api.HKDF_INFO, 32);
    this._sessionKey = newSessionKey;
    this._isInitialized = true;

    this._setSuccess("Initialized successfully.");
  }

  async login(username, password, totpCode = null) {
    this._securityCheck();

    const body = this._createBasePayload();
    body.version = this.version;
    body.username = username;
    body.password = password;
    body.hwid = SecurityProtections.getHardwareId();
    if (totpCode) body.totpCode = totpCode;

    const resp = await this._sendEncrypted("/login", body);
    if (!resp || !resp.success) {
      this._setError(resp?.message || "Login failed", resp?.error || "login_failed");
      return false;
    }

    this._populateUserData(resp);
    this.startRealtimeEventListener();
    this._setSuccess("Logged in successfully.");
    return true;
  }

  async register(username, password, key, email = "") {
    this._securityCheck();

    const body = this._createBasePayload();
    body.version = this.version;
    body.username = username;
    body.password = password;
    body.key = key;
    if (email) {
      body.email = email;
    }
    body.hwid = SecurityProtections.getHardwareId();

    const resp = await this._sendEncrypted("/register", body);
    if (!resp || !resp.success) {
      this._setError(resp?.message || "Registration failed", resp?.error || "registration_failed");
      return false;
    }

    this._populateUserData(resp);
    this.startRealtimeEventListener();
    this._setSuccess("Registered successfully.");
    return true;
  }

  async license(key, totpCode = null) {
    this._securityCheck();

    const body = this._createBasePayload();
    body.version = this.version;
    body.key = key;
    body.hwid = SecurityProtections.getHardwareId();
    if (totpCode) body.totpCode = totpCode;

    const resp = await this._sendEncrypted("/license", body);
    if (!resp || !resp.success) {
      this._setError(resp?.message || "License activation failed", resp?.error || "license_failed");
      return false;
    }

    this._populateUserData(resp);
    this.startRealtimeEventListener();
    this._setSuccess("License verified successfully.");
    return true;
  }

  async upgrade(username, key) {
    const body = this._createBasePayload();

    if (typeof username === "string" && username.trim() !== "") body.username = username;
    body.key = key;

    const resp = await this._sendEncrypted("/upgrade", body);
    if (!resp || !resp.success) {
      this._setError(resp?.message || "Upgrade failed", resp?.error || "upgrade_failed");
      return false;
    }

    this._setSuccess("Subscription upgraded successfully.");
    return true;
  }

  async heartbeat() {
    const body = this._createBasePayload();
    body.version = this.version;

    const resp = await this._sendEncrypted("/heartbeat", body);
    if (!resp || !resp.success) {
      const msg = resp?.message || "Heartbeat rejected";
      const err = resp?.error || "heartbeat_failed";
      this._setError(msg, err);
      if (err === "session_invalid" || err === "session_not_validated" || err === "unauthenticated") {
        this.stopRealtimeEventListener();
        if (this.onSessionInvalidated) {
          this.onSessionInvalidated("Session terminated or invalid (Heartbeat failure)");
        }
      }
      return false;
    }

    this._setSuccess("Session alive.");
    return true;
  }

  async check() {
    const body = this._createBasePayload();
    body.version = this.version;

    const resp = await this._sendEncrypted("/check", body);
    if (!resp || !resp.success) {
      const msg = resp?.message || "Session invalid";
      const err = resp?.error || "check_failed";
      this._setError(msg, err);
      if (["session_invalid", "no_active_subscription", "subscription_paused", "unauthenticated"].includes(err)) {
        this.stopRealtimeEventListener();
        if (this.onSessionInvalidated) {
          this.onSessionInvalidated(`Session check rejected: ${err}`);
        }
      }
      return false;
    }

    this.user.subscriptions = [];
    if (Array.isArray(resp.subscriptions)) {
      for (const item of resp.subscriptions) {
        if (!item || typeof item !== "object") continue;
        const tl = item.timeleft !== undefined ? item.timeleft : (item.timeLeft || 0);
        this.user.subscriptions.push({
          subscription: String(item.subscription || ""),
          key: String(item.key || ""),
          expiry: String(item.expiry || item.expiresAt || ""),
          timeLeft: Number(tl) || 0
        });
      }
    }

    this._setSuccess("Session valid.");
    return true;
  }

  async logout() {
    const body = this._createBasePayload();

    let confirmed = false;
    let sendResult = null;
    try {
      sendResult = await this._sendEncrypted("/logout", body);
      confirmed = sendResult?.success === true;
    } catch (e) {
      if (e instanceof CryptographicException) throw e;
    }

    this.user = {
      username: "",
      email: "",
      hwid: "",
      ip: "",
      status: "",
      createdAt: "",
      lastLoginAt: "",
      subscriptions: []
    };

    this._sessionKey = null;
    if (this._sharedKey) this._sharedKey.fill(0);
    this._sharedKey = null;
    this._isInitialized = false;
    if (confirmed) {
      this._setSuccess("Logged out successfully.");
    } else if (sendResult && (sendResult.error === "network_error" || sendResult.error === "timeout" || sendResult.error === "handshake_required" || sendResult.error === "invalid_response" || sendResult.error === "response_too_large")) {
      this.response = { success: false, error: sendResult.error, message: sendResult.message || "Logout failed" };
    } else {
      this._setError("Local session cleared; server revocation unconfirmed.", "logout_unconfirmed");
    }
    return confirmed;
  }

  async changeUsername(newUsername, password) {
    const body = this._createBasePayload();
    body.newUsername = newUsername;
    body.password = password;

    const resp = await this._sendEncrypted("/change-username", body);
    if (!resp || !resp.success) {
      this._setError(resp?.message || "Failed to change username", resp?.error || "change_username_failed");
      return false;
    }

    this.user.username = newUsername;
    this.stopRealtimeEventListener();
    this._setSuccess("Username changed successfully.");
    return true;
  }

  async resetHwid(username, password, totpCode = null) {
    const body = this._createBasePayload();
    body.username = username;
    body.password = password;
    if (totpCode) body.totpCode = totpCode;

    const resp = await this._sendEncrypted("/hwid-reset", body);
    if (!resp || !resp.success) {
      this._setError(resp?.message || "HWID reset failed", resp?.error || "hwid_reset_failed");
      return false;
    }

    this.stopRealtimeEventListener();
    this._setSuccess(resp.message || "HWID reset successfully.");
    return true;
  }

  async ban(reason = null) {
    const body = this._createBasePayload();
    if (reason) body.reason = reason;

    const resp = await this._sendEncrypted("/ban", body);
    if (!resp || !resp.success) {
      this._setError(resp?.message || "Failed to self-report ban", resp?.error || "ban_failed");
      return false;
    }

    this._setSuccess("Account banned.");
    return true;
  }

  async checkBlacklist(hwid = null) {
    const body = this._createBasePayload();
    body.hwid = hwid || SecurityProtections.getHardwareId();

    const resp = await this._sendEncrypted("/check-blacklist", body);
    if (!resp || !resp.success) {
      this._setError(resp?.message || "Check blacklist failed", resp?.error || "check_blacklist_failed");
    } else {
      this._setSuccess(resp.message || "Blacklist checked.");
    }
    return resp && typeof resp === "object" ? resp : { success: false, error: "invalid_response", message: "Unexpected check-blacklist reply." };
  }

  async verifyFileHash(hash) {
    const body = this._createBasePayload();
    body.hash = hash;

    const resp = await this._sendEncrypted("/verify-hash", body);
    if (!resp || !resp.success) {
      this._setError(resp?.message || "Hash check failed", resp?.error || "verify_hash_failed");
      return false;
    }

    return Boolean(resp.verified === true);
  }

  async forgotPassword(email) {
    const body = this._createBasePayload();
    body.email = email;

    const resp = await this._sendEncrypted("/forgot-password", body);
    if (!resp || !resp.success) {
      this._setError(resp?.message || "Failed to send reset email", resp?.error || "forgot_password_failed");
      return false;
    }
    this._setSuccess("Password reset email sent.");
    return true;
  }

  async resetPassword(token, newPassword) {
    const body = { token, newPassword };
    let res;
    try {
      res = await this._postRaw("/reset-password", JSON.stringify(body));
    } catch (e) {
      if (e && e.code === "response_too_large") {
        this._setError("Failed to reset password: the server reply exceeds the size limit.", "response_too_large");
        return false;
      }
      const code = e && e.message === "Request timed out" ? "timeout" : "network_error";
      this._setError(`Failed to reset password: ${e.message}`, code);
      return false;
    }

    let resp = null;
    try { resp = JSON.parse(res.body); } catch { resp = null; }
    if (!resp || typeof resp !== "object" || Array.isArray(resp)) {
      this._setError("Failed to reset password: the server reply was not valid JSON.", "invalid_response");
      return false;
    }
    if (!resp.success) {
      this._setError(resp.message || resp.error || "Failed to reset password", resp.error || "reset_password_failed");
      return false;
    }
    this._setSuccess("Password has been reset.");
    return true;
  }

  async setup2FA() {
    const body = this._createBasePayload();

    const resp = await this._sendEncrypted("/2fa/setup", body);
    if (!resp || !resp.success) {
      this._setError(resp?.message || "2FA setup failed", resp?.error || "2fa_setup_failed");
      return null;
    }

    return {
      secret: String(resp.secret || ""),
      qrDataUrl: String(resp.qr || ""),
      uri: String(resp.uri || "")
    };
  }

  async confirm2FA(code) {
    const body = this._createBasePayload();
    body.code = code;

    const resp = await this._sendEncrypted("/2fa/confirm", body);
    if (!resp || !resp.success) {
      this._setError(resp?.message || "2FA confirmation failed", resp?.error || "2fa_confirm_failed");
      return null;
    }

    const backupCodes = Array.isArray(resp.backupCodes) ? resp.backupCodes.map(String) : [];
    return { backupCodes };
  }

  async disable2FA(password, code) {
    const body = this._createBasePayload();
    body.password = password;
    body.code = code;

    const resp = await this._sendEncrypted("/2fa/disable", body);
    if (!resp || !resp.success) {
      this._setError(resp?.message || "Failed to disable 2FA", resp?.error || "2fa_disable_failed");
      return false;
    }

    this._setSuccess("2FA disabled.");
    return true;
  }

  async getGlobalVar(key) {
    const body = this._createBasePayload();
    body.varName = key;

    const resp = await this._sendEncrypted("/global-var", body);
    if (!resp || !resp.success) {
      this._setError(resp?.message || "Variable not found", resp?.error || "var_not_found");
      return "";
    }

    return String(resp.value || "");
  }

  async getUserVariables() {
    const body = this._createBasePayload();

    const resp = await this._sendEncrypted("/user-vars/get", body);
    if (!resp || !resp.success) {
      this._setError(resp?.message || "User variables not found", resp?.error || "user_vars_get_failed");
      return null;
    }

    this._setSuccess("User variables retrieved.");
    return Array.isArray(resp.variables) ? resp.variables : [];
  }

  async getUserVar(key) {
    const vars = await this.getUserVariables();
    if (!vars) return "";

    const match = vars.find(v => v && v.key === key);
    if (!match) {
      this._setError("User variable not found", "variable_not_found");
      return "";
    }

    this._setSuccess("User variable retrieved.");
    return String(match.value || "");
  }

  async setUserVar(key, value) {
    const body = this._createBasePayload();
    body.key = key;
    body.value = value;

    const resp = await this._sendEncrypted("/user-vars/set", body);
    if (!resp || !resp.success) {
      this._setError(resp?.message || "Failed to set variable", resp?.error || "set_user_var_failed");
      return false;
    }

    this._setSuccess("User variable saved.");
    return true;
  }

  async downloadFile(fileId) {
    const ticketBody = this._createBasePayload();
    ticketBody.scope = "file";
    ticketBody.resourceId = String(fileId);

    const ticketResp = await this._sendEncrypted("/access-ticket", ticketBody);
    if (!ticketResp || !ticketResp.success || !ticketResp.ticket) {
      this._setError(ticketResp?.message || "File access ticket denied", ticketResp?.error || "ticket_denied");
      return null;
    }

    let res;
    try {
      res = await this._getRaw(`/files/download?ticket=${encodeURIComponent(ticketResp.ticket)}`, MAX_FILE_BYTES);
    } catch (e) {
      this._setError(`Failed to retrieve file content: ${e.message}`, "download_error");
      return null;
    }
    if (res.status >= 300 && res.status < 400) {

      this.response = {
        success: false,
        error: "external_download",
        url: res.location || "",
        message: "File download redirected to an external location; redirects are refused."
      };
      return null;
    }

    let json = null;
    try { json = JSON.parse(res.body.toString("utf8")); } catch { json = null; }
    if (res.status !== 200 || !json || json.success !== true) {
      this._setError(json?.message || `File download failed (HTTP ${res.status})`, json?.error || "download_http_error");
      return null;
    }
    if (typeof json.data !== "string" || json.data === "") {
      this._setError("File response is missing content", "download_missing_field");
      return null;
    }

    try {

      return zlib.gunzipSync(Buffer.from(json.data, "base64"), { maxOutputLength: MAX_FILE_BYTES });
    } catch {
      this._setError("File content could not be decompressed", "download_decode_failed");
      return null;
    }
  }

  async getChatMessages(channel = "general", before = null, markRead = null) {
    const body = this._createBasePayload();
    body.room = channel;
    if (typeof before === "number" || typeof before === "string" || typeof before === "bigint") body.before = Number(before);
    if (typeof markRead === "boolean") body.markRead = markRead;

    const resp = await this._sendEncrypted("/chat/get", body);
    if (!resp || !resp.success) {
      this._setError(resp?.message || "Failed to fetch messages", resp?.error || "chat_fetch_failed");
      return [];
    }

    const list = [];
    if (Array.isArray(resp.messages)) {
      for (const m of resp.messages) {
        if (!m || typeof m !== "object") continue;
        list.push({
          id: String(m.id || ""),
          author: String(m.author || ""),
          message: String(m.content || m.message || ""),
          timestamp: String(m.timestamp || m.createdAt || "")
        });
      }
    }
    return list;
  }

  async sendChatMessage(message, channel = "general") {
    const body = this._createBasePayload();
    body.room = channel;
    body.content = message;

    const resp = await this._sendEncrypted("/chat/send", body);
    if (!resp || !resp.success) {
      this._setError(resp?.message || "Failed to send chat message", resp?.error || "chat_send_failed");
      return false;
    }

    this._setSuccess("Message sent.");
    return true;
  }

  async log(message) {
    const body = this._createBasePayload();
    body.message = message;

    const resp = await this._sendEncrypted("/log", body);
    if (!resp || !resp.success) {
      this._setError(resp?.message || "Failed to log event", resp?.error || "log_failed");
      return false;
    }

    this._setSuccess("Event logged.");
    return true;
  }

  async getStats() {
    const body = this._createBasePayload();

    const resp = await this._sendEncrypted("/stats", body);
    if (!resp || !resp.success) {
      this._setError(resp?.message || "Failed to retrieve stats", resp?.error || "stats_failed");
      return null;
    }

    const u = resp.users || {};
    const l = resp.licenses || {};

    return {
      version: String(resp.version || this.version),
      totalUsers: Number(u.total) || 0,
      activeUsers: Number(u.active) || 0,
      bannedUsers: Number(u.banned) || 0,
      totalLicenses: Number(l.total) || 0,
      usedLicenses: Number(l.used) || 0,
      unusedLicenses: Number(l.notUsed) || 0
    };
  }

  async getOnlineUsers() {
    const body = this._createBasePayload();

    const resp = await this._sendEncrypted("/online-users", body);
    if (!resp || !resp.success) {
      this._setError(resp?.message || "Failed to fetch online users", resp?.error || "online_users_failed");
      return [];
    }

    return Array.isArray(resp.users) ? resp.users.map(String) : [];
  }

  async triggerWebhook(webId, customPayload = null, content = null, params = null, file = null, fileName = null) {
    const body = this._createBasePayload();
    body.webId = webId;
    if (customPayload !== null && customPayload !== undefined) body.payload = customPayload;
    if (content !== null && content !== undefined) body.content = String(content);
    if (params !== null && params !== undefined) body.params = String(params);

    let transport = null;
    if (file !== null && file !== undefined) {
      const fileBytes = Buffer.isBuffer(file) ? file : (file instanceof Uint8Array ? Buffer.from(file) : Buffer.from(String(file), "utf8"));
      const safeName = String(fileName || "file.bin").replace(/"/g, "%22").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
      transport = (envelope) => {
        const boundary = "NightAuthBoundary" + crypto.randomUUID().replace(/-/g, "");
        const header1 = Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="envelope"\r\n\r\n${JSON.stringify(envelope)}\r\n`
        );
        const header2 = Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safeName}"\r\nContent-Type: application/octet-stream\r\n\r\n`
        );
        const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
        const bodyBuf = Buffer.concat([header1, header2, fileBytes, footer]);
        return {
          body: bodyBuf,
          contentType: `multipart/form-data; boundary=${boundary}`
        };
      };
    }

    const resp = await this._sendEncrypted("/webhook", body, transport);
    if (!resp || !resp.success) {
      this._setError(resp?.message || "Webhook trigger failed", resp?.error || "webhook_failed");
      return null;
    }

    // The server returns the remote endpoint body in `data`, not `response`.
    if (resp.data === undefined || resp.data === null) return "";
    return typeof resp.data === "string" ? resp.data : JSON.stringify(resp.data);
  }

  startRealtimeEventListener(options = {}) {
    this.stopRealtimeEventListener();

    const retryDelayMs = options.retryDelayMs ?? 5000;
    const maxAttempts = options.maxAttempts ?? 5;

    let stopped = false;
    this._sseReq = { abort: () => { stopped = true; } };

    // A refusal that means the session or entitlement is gone can never succeed on retry,
    // so the listener stops. Transient failures retry with backoff, up to maxAttempts in a row.
    const FATAL_TICKET_ERRORS = new Set([
      "session_invalid", "session_not_validated", "unauthenticated", "blacklisted",
      "app_paused", "app_disabled", "subscription_paused", "no_active_subscription",
    ]);
    const MAX_ATTEMPTS = maxAttempts;
    let attempts = 0;

    const connect = async () => {
      while (!stopped && !this._disposed && attempts < MAX_ATTEMPTS) {
        attempts += 1;
        try {
          const ticketPayload = this._createBasePayload();
          ticketPayload.scope = "events";

          const ticketJson = await this._sendEncrypted("/access-ticket", ticketPayload);
          // A stop that arrived while the ticket was in flight must win: opening the stream now would leave it with
          // no handle to abort it (it would hold one of the identity stream slots until the process ends).
          if (stopped || this._disposed) break;
          if (!ticketJson || !ticketJson.success || !ticketJson.ticket) {
            if (FATAL_TICKET_ERRORS.has(ticketJson?.error)) {
              this.stopRealtimeEventListener();
              if (this.onSessionInvalidated) {
                this.onSessionInvalidated(`Event stream rejected: ${ticketJson.error}`);
              }
              return;
            }
            await new Promise(r => setTimeout(r, retryDelayMs));
            continue;
          }

          // Keep the listener's own stop hook: aborting the stream must also stop the reconnect loop.
          const previous = this._sseReq;
          const outcome = await this._consumeEventStream(ticketJson.ticket, options.lastEventId ?? this.lastEventId, (req) => {
            const handle = {
              abort: () => { try { previous?.abort?.(); } catch {} req.destroy(); },
              destroy: () => req.destroy(),
            };
            this._sseReq = handle;
            req.on("close", () => { if (this._sseReq === handle) this._sseReq = previous; });
          });
          if (outcome.refused || outcome.protocolError) { stopped = true; this._sseReq = null; return; }
          if (outcome.delivered) attempts = 0; // the stream delivered: the connection is healthy
          if (!stopped && !this._disposed) await new Promise(r => setTimeout(r, Math.min(retryDelayMs, 1000)));
        } catch (err) {
          if (err?.name === "CryptographicException") {
            this.stopRealtimeEventListener();
            throw err;
          }
          if (stopped) break;
          await new Promise(r => setTimeout(r, Math.min(retryDelayMs, 3000)));
        }
      }
    };

    return connect();
  }

  // Opens GET /events?ticket=... with Last-Event-ID when known and passes every frame to
  // _handleRealtimeEvent. Resolves { refused, protocolError, delivered }. `onOpen(req)` receives
  // the request so the caller can abort it.
  _consumeEventStream(ticket, lastEventId = null, onOpen = null) {
    return new Promise((resolve) => {
      const outcome = { refused: false, protocolError: false, delivered: false };
      if (this._disposed) return resolve(outcome);
      const sseUrl = `${this.apiUrl}/events?ticket=${encodeURIComponent(ticket)}`;
      const headers = { "User-Agent": "NightAuth-NodeJS-SDK/1.0" };
      if (lastEventId !== null && lastEventId !== undefined && /^\d{1,15}$/.test(String(lastEventId))) {
        headers["Last-Event-ID"] = String(lastEventId);
      }
      const client = sseUrl.startsWith("https:") ? https : http;
      const req = client.get(sseUrl, { headers, rejectUnauthorized: true }, (res) => {
        if (res.statusCode !== 200) {
          outcome.refused = true;
          let errBody = "";
          res.on("data", (chunk) => { if (errBody.length < 65536) errBody += chunk.toString("utf8"); });
          res.on("end", () => {
            let errCode = null;
            try { errCode = JSON.parse(errBody)?.error; } catch {}
            this.streamException = new NightAuthStreamException(res.statusCode, errCode, errCode || `HTTP ${res.statusCode}`);
            this._setError(errCode || `HTTP ${res.statusCode}`, errCode || "stream_refused");
            resolve(outcome);
          });
          res.on("error", () => {
            this.streamException = new NightAuthStreamException(res.statusCode, null, `HTTP ${res.statusCode}`);
            this._setError(`HTTP ${res.statusCode}`, "stream_refused");
            resolve(outcome);
          });
          return;
        }
        const parser = new SseParser((data, id) => {
          outcome.delivered = true;
          this._handleRealtimeEvent(data, id);
        });
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          try { parser.push(chunk); } catch {
            outcome.protocolError = true;
            this.streamException = new NightAuthStreamException(200, "invalid_response", "Event exceeds size limit.");
            req.destroy();
          }
        });
        res.on("end", () => resolve(outcome));
        res.on("error", () => resolve(outcome));
        res.on("close", () => resolve(outcome));
      });
      req.on("error", (err) => {
        this.streamException = new NightAuthStreamException(0, "network_error", err?.message || "network_error");
        resolve(outcome);
      });
      if (onOpen) onOpen(req);
    });
  }

  stopRealtimeEventListener() {
    if (this._sseReq) {
      try {
        if (typeof this._sseReq.abort === "function") this._sseReq.abort();
        if (typeof this._sseReq.destroy === "function") this._sseReq.destroy();
      } catch {}
      this._sseReq = null;
    }
  }

  _handleRealtimeEvent(jsonString, eventId = null) {
    try {
      const node = JSON.parse(jsonString);
      if (!node || typeof node !== "object") return;
      const type = node.type || "";
      if (type === "session-invalid") {
        this.stopRealtimeEventListener();
        this.user = { username: "", email: "", hwid: "", ip: "", status: "", createdAt: "", lastLoginAt: "", subscriptions: [] };
        if (this.onSessionInvalidated) this.onSessionInvalidated("Your session has been terminated by administrator or system.");
      } else if (type === "app-banned") {
        this.stopRealtimeEventListener();
        this.user = { username: "", email: "", hwid: "", ip: "", status: "", createdAt: "", lastLoginAt: "", subscriptions: [] };
        if (this.onAppBanned) this.onAppBanned(node.reason || "Application has been banned.");
      } else if (type === "resync-required") {
        if (this.onResyncRequired) this.onResyncRequired();
      } else if (type === "app-paused" || type === "app-disabled") {
        this.stopRealtimeEventListener();
        this.user = { username: "", email: "", hwid: "", ip: "", status: "", createdAt: "", lastLoginAt: "", subscriptions: [] };
        if (this.onAppStatusChanged) this.onAppStatusChanged(`Application status changed to: ${type}`);
      } else if (type === "version") {
        if (node.downloadUrl) this.pendingDownloadUrl = String(node.downloadUrl);
        if (node.version) {
          this.app.version = node.version;
          this.requiredVersion = node.version;
          if (this.onVersionUpdated) this.onVersionUpdated(node.version, node.downloadUrl);
        }
      } else if (type === "chat-message") {
        const room = node.room || "general";
        const msg = {
          id: String(node.id || ""),
          author: String(node.author || "unknown"),
          message: String(node.content || ""),
          timestamp: String(node.createdAt || new Date().toISOString())
        };
        if (this.onChatMessageReceived) this.onChatMessageReceived(msg, room);
      }
    } catch {
      // A malformed event or a failing user callback is dropped; the id still advances below.
    } finally {
      if (eventId !== null) this.lastEventId = eventId;
    }
  }

  _createBasePayload() {
    const obj = {
      apikey: this.apiKey,
      name: this.name
    };
    if (this.token) obj.token = this.token;
    return obj;
  }

  _isReady() {
    return this._isInitialized && !!this._sharedKey && !!this._sessionKey;
  }

  _initFailure() {
    return { success: false, error: this.response.error || "init_failed", message: this.response.message || "Initialization failed." };
  }

  // A call without a session initialises first; an expired handshake is re-initialised once and retried.
  async _sendEncrypted(path, payload, transport = null) {
    const prevGate = this._gate;
    let release;
    this._gate = new Promise((resolve) => { release = resolve; });
    try {
      await prevGate;
    } catch {}

    try {
      if (!this._isReady()) {
        await this.init();
        if (!this._isReady()) return this._initFailure();
      }
      const first = await this._sendEncryptedOnce(path, payload, transport);
      if (!Api._isHandshakeExpired(first)) return first;
      await this.init();
      if (!this._isReady()) return first;
      return await this._sendEncryptedOnce(path, payload, transport);
    } finally {
      release();
    }
  }

  // A handshake message or a session_invalid/unauthenticated error means the handshake expired.
  // Client-side failures never qualify.
  static _isHandshakeExpired(result) {
    if (!result || result.success) return false;
    if (["network_error", "invalid_response", "response_too_large"].includes(result.error)) return false;
    const message = String(result.message || "").toLowerCase();
    return result.status === 428 || message.includes("handshake") || message.includes("initialize app")
      || ["handshake_required", "session_invalid", "unauthenticated"].includes(result.error);
  }

  async _sendEncryptedOnce(path, payload, transport = null) {
    const rid = crypto.randomBytes(16).toString("hex");
    const ts = Date.now();
    const targetUrl = new URL(this.apiUrl + path);
    const aad = `POST:${targetUrl.pathname}:${this._sessionKey}:${rid}:${ts}`;
    const jsonPlain = JSON.stringify(payload);
    const { ct: ctB64, n: nonceB64 } = Api.aesGcmEncrypt(this._sharedKey, jsonPlain, aad);

    const envelope = {
      id: this._sessionKey,
      ct: ctB64,
      n: nonceB64,
      rid,
      ts
    };

    let postBody = JSON.stringify(envelope);
    let postContentType = "application/json";
    if (typeof transport === "function") {
      const custom = transport(envelope);
      if (custom && custom.body) {
        postBody = custom.body;
        if (custom.contentType) postContentType = custom.contentType;
      }
    }

    let status, respRaw;
    try {
      const res = await this._postRaw(path, postBody, postContentType);
      status = res.status;
      respRaw = res.body;
    } catch (e) {
      if (e && e.code === "response_too_large") {
        return { success: false, error: "response_too_large", message: "Response exceeds size limit.", status: e.status };
      }
      const code = e && e.message === "Request timed out" ? "timeout" : "network_error";
      return { success: false, error: code, message: e.message };
    }

    let encResp;
    try {
      encResp = JSON.parse(respRaw);
    } catch {
      return Api._unreadableReply(status);
    }
    if (!encResp || typeof encResp !== "object" || Array.isArray(encResp)) return Api._unreadableReply(status);

    if (encResp && encResp.ct && encResp.n) {
      const resCt = encResp.ct;
      const resN = encResp.n;
      const resRid = encResp.rid;
      const resTs = encResp.ts;
      if (resRid !== rid || resTs !== ts) {
        throw new CryptographicException("Response is not authenticated to this request.");
      }

      const resAad = `v1:res:${this._sessionKey}:${resRid}:${resTs}`;
      let decryptedPlain;
      try {
        decryptedPlain = Api.aesGcmDecrypt(this._sharedKey, resCt, resN, resAad);
      } catch {
        throw new CryptographicException("Response could not be authenticated.");
      }
      return JSON.parse(decryptedPlain);
    }

    // Unencrypted refusals keep the server code and status; an unauthenticated 2xx is never trusted.
    if (status >= 200 && status < 300) {
      throw new CryptographicException("Response is not authenticated to this request.");
    }
    return { success: false, error: encResp.error || "http_error", message: encResp.message || `HTTP ${status}`, status };
  }

  static _unreadableReply(status) {
    return { success: false, error: "invalid_response", message: `Response is not an authenticated JSON object (HTTP ${status}).`, status };
  }

  _getRaw(pathAndQuery, maxBytes) {
    return new Promise((resolve, reject) => {
      Api.validateApiUrl(this.apiUrl, this._allowInsecureLoopback);
      const url = new URL(this.apiUrl + pathAndQuery);
      const client = url.protocol === "https:" ? https : http;

      const req = client.request(url, {
        method: "GET",
        headers: { "User-Agent": "NightAuth-NodeJS-SDK/1.0", "Accept": "application/json" },
        rejectUnauthorized: true,
        timeout: 20000
      }, (res) => {
        const chunks = [];
        let bytes = 0;
        res.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes > maxBytes) {
            req.destroy(new Error("Response exceeds size limit"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("aborted", () => reject(new Error("Response aborted")));
        res.on("end", () => resolve({
          status: res.statusCode,
          location: res.headers.location || "",
          body: Buffer.concat(chunks)
        }));
      });

      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Request timed out"));
      });
      req.end();
    });
  }

  _postRaw(path, bodyData, contentType = "application/json") {
    return new Promise((resolve, reject) => {
      Api.validateApiUrl(this.apiUrl, this._allowInsecureLoopback);
      const url = new URL(this.apiUrl + path);
      const isHttps = url.protocol === "https:";
      const client = isHttps ? https : http;

      const bodyBuf = Buffer.isBuffer(bodyData) ? bodyData : Buffer.from(bodyData, "utf8");

      const req = client.request(url, {
        method: "POST",
        headers: {
          "Content-Type": contentType,
          "User-Agent": "NightAuth-NodeJS-SDK/1.0",
          "Content-Length": bodyBuf.length
        },
        rejectUnauthorized: true,
        timeout: this.requestTimeoutMs || 20000
      }, (res) => {
        let data = "";
        res.setEncoding("utf8");
        let bytes = 0;
        res.on("data", chunk => {
          bytes += Buffer.byteLength(chunk, "utf8");
          if (bytes > 5 * 1024 * 1024) {
            // Reported with the real HTTP status, not as a network failure.
            const tooLarge = Object.assign(new Error("Response exceeds size limit"), { code: "response_too_large", status: res.statusCode });
            req.destroy(tooLarge);
            reject(tooLarge);
            return;
          }
          data += chunk;
        });
        res.on("error", reject);
        res.on("aborted", () => reject(new Error("Response aborted")));
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      });

      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Request timed out"));
      });
      req.write(bodyBuf);
      req.end();
    });
  }

  static aesGcmEncrypt(key, plaintext, aad) {
    const nonce = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce);
    if (aad) cipher.setAAD(Buffer.from(aad, "utf8"));
    const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      ct: Buffer.concat([ct, tag]).toString("base64"),
      n: nonce.toString("base64")
    };
  }

  static aesGcmDecrypt(key, ctB64, nB64, aad) {
    const nonce = Buffer.from(nB64, "base64");
    const combined = Buffer.from(ctB64, "base64");
    const tag = combined.subarray(combined.length - 16);
    const ct = combined.subarray(0, combined.length - 16);

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce);
    if (aad) decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  }

  static verifyServerSignature(k2Hex, vkHex, ts, sigB64) {
    try {
      const vkBytes = Buffer.from(vkHex, "hex");
      const sigBytes = Buffer.from(sigB64, "base64");
      const data = Buffer.from(`${k2Hex}.${vkHex}.${ts}`, "utf8");

      const pubKey = crypto.createPublicKey({
        key: { kty: "OKP", crv: "Ed25519", x: vkBytes.toString("base64url") },
        format: "jwk"
      });
      return crypto.verify(null, data, pubKey, sigBytes);
    } catch {
      return false;
    }
  }

  static cryptoBoxSeal(plaintext, recipientPubKeyHex) {
    const ephem = crypto.generateKeyPairSync("x25519");
    const ephemJwk = ephem.publicKey.export({ format: "jwk" });
    const ephemPubBytes = Buffer.from(ephemJwk.x, "base64url");

    const recipientPub = crypto.createPublicKey({
      key: { kty: "OKP", crv: "X25519", x: Buffer.from(recipientPubKeyHex, "hex").toString("base64url") },
      format: "jwk"
    });
    const rawSecret = crypto.diffieHellman({
      privateKey: ephem.privateKey,
      publicKey: recipientPub
    });

    const encKey = crypto.hkdfSync("sha256", rawSecret, Buffer.alloc(0), Api.SEAL_INFO, 32);
    const nonce = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", encKey, nonce);
    cipher.setAAD(ephemPubBytes);
    const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    const result = Buffer.concat([ephemPubBytes, nonce, tag, ct]);
    return result.toString("base64");
  }

  static hkdfExtractAndExpand(ikm, info, length) {
    return Buffer.from(crypto.hkdfSync("sha256", ikm, Buffer.alloc(0), info, length));
  }

  _populateUserData(data) {
    const u = data.user || data.info;
    if (!u || typeof u !== "object") return;

    this.user.username = String(u.username || "");
    this.user.email = String(u.email || "");
    this.user.hwid = String(u.hwid || "");
    this.user.ip = String(u.ip || "");
    this.user.status = String(u.status || "active");
    this.user.createdAt = String(u.createdAt || u.createdate || "");
    this.user.lastLoginAt = String(u.lastLoginAt || u.lastlogin || "");

    this.user.subscriptions = [];
    if (Array.isArray(u.subscriptions)) {
      for (const item of u.subscriptions) {
        if (!item || typeof item !== "object") continue;
        const tl = item.timeleft !== undefined ? item.timeleft : (item.timeLeft || 0);
        this.user.subscriptions.push({
          subscription: String(item.subscription || ""),
          key: String(item.key || ""),
          expiry: String(item.expiry || item.expiresAt || ""),
          timeLeft: Number(tl) || 0
        });
      }
    }

    if (data.app && typeof data.app === "object") {
      this.app.totalUsers = Number(data.app.totalUsers) || 0;
      this.app.onlineUsers = Number(data.app.onlineUsers) || 0;
      this.app.totalKeys = Number(data.app.totalKeys) || 0;
      this.app.version = String(data.app.version || this.version);
    }
  }

  static _formatHumanErrorMessage(msg, err) {
    const candidate = msg && msg.trim() ? msg.trim() : (err || "Operation failed");
    const mapping = {
      rate_limited: "Too many requests. Please wait a moment and try again.",
      invalid_credentials: "The credentials provided do not match our records.",
      invalid_apikey: "The API key provided is invalid or unrecognized.",
      app_not_found: "Application was not found. Please check your credentials.",
      app_disabled: "This application is currently disabled by administrator policy.",
      app_paused: "Application is currently paused for maintenance.",
      invalid_token: "Authentication token is invalid or expired.",
      feature_disabled: "This feature is currently disabled for this application.",
      session_invalid: "Session is no longer valid. Please sign in again.",
      session_not_validated: "Session is no longer valid. Please sign in again.",
      invalid_hwid: "Device signature is invalid or unrecognized.",
      hwid_mismatch: "Device signature mismatch. Please reset your HWID.",
      vpn_blocked: "Anonymous proxies and VPN connections are not permitted.",
      blacklisted: "Your hardware identifier or IP address has been restricted.",
      username_taken: "This username is already registered. Please choose another.",
      email_taken: "This email address is already registered.",
      invalid_license: "The license key provided is invalid or unrecognized.",
      license_used: "This license key has already been activated.",
      no_active_subscription: "No active subscription found for this account.",
      expired: "No active subscription found for this account.",
      subscription_paused: "Your subscription is temporarily suspended.",
      paused: "Your subscription is temporarily suspended."
    };
    return mapping[candidate] || candidate;
  }

  _setError(msg, err = null) {
    const friendly = Api._formatHumanErrorMessage(msg, err);
    this.response = { success: false, message: friendly, error: err || msg || "error" };
  }

  _setSuccess(msg) {
    this.response = { success: true, message: msg, error: null };
  }

  close() {
    if (this._disposed) return;
    this._disposed = true;
    this.stopRealtimeEventListener();
  }

  applyUpdate(downloadUrl = null) {
    this._setError("Unsigned auto-update is disabled. Verify a signed release manifest with SignedUpdateInstaller.", "unsigned_update_disabled");
    return false;
  }

  async downloadSignedUpdate(manifestUrl, pinnedReleaseKeyHex, destination, options = {}) {
    return SignedUpdateInstaller.download(manifestUrl, pinnedReleaseKeyHex, this.name, destination, options);
  }
}

class VerifiedUpdate {
  constructor(application, version, sequence, url, size, expiresAt, digest) {
    this.application = application;
    this.version = version;
    this.sequence = sequence;
    this.url = url;
    this.size = size;
    this.expiresAt = expiresAt;
    this.digest = digest;
  }
}

class SignedUpdate {
  static MaxArtifactBytes = 256 * 1024 * 1024;
  static MaxManifestBytes = 64 * 1024;

  static verify(envelopeJson, pinnedPublicKeyHex, expectedApplication, minimumSequence = 0) {
    if (typeof envelopeJson !== "string" || Buffer.byteLength(envelopeJson, "utf8") > SignedUpdate.MaxManifestBytes ||
        typeof minimumSequence !== "number" || minimumSequence < 0 || !expectedApplication || typeof expectedApplication !== "string" || !expectedApplication.trim()) {
      throw new Error("Invalid manifest parameters.");
    }
    let envelope;
    try {
      envelope = JSON.parse(envelopeJson);
    } catch {
      throw new Error("Manifest envelope is not valid JSON.");
    }
    if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
      throw new Error("Manifest envelope must be a JSON object.");
    }
    if (typeof envelope.payload !== "string" || typeof envelope.signature !== "string") {
      throw new Error("Manifest envelope missing payload or signature.");
    }

    const payloadBytes = Buffer.from(envelope.payload, "base64");
    const signatureBytes = Buffer.from(envelope.signature, "base64");
    const keyBytes = Buffer.from(pinnedPublicKeyHex, "hex");

    if (payloadBytes.length > 32768 || signatureBytes.length !== 64 || keyBytes.length !== 32) {
      throw new Error("Invalid manifest size, signature or key length.");
    }

    const keyObj = crypto.createPublicKey({
      key: { kty: "OKP", crv: "Ed25519", x: keyBytes.toString("base64url") },
      format: "jwk"
    });

    const signatureValid = crypto.verify(null, payloadBytes, keyObj, signatureBytes);
    if (!signatureValid) {
      throw new CryptographicException("Release signature rejected.");
    }

    let data;
    try {
      data = JSON.parse(payloadBytes.toString("utf8"));
    } catch {
      throw new Error("Manifest payload is not valid JSON.");
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Manifest payload must be a JSON object.");
    }

    const schema = data.schema;
    const application = data.application;
    const version = data.version;
    const sequence = data.sequence;
    const rawUrl = data.url;
    const size = data.size;
    const expiresAt = data.expiresAt;
    const sha256Hex = data.sha256;

    if (schema !== 1 || application !== expectedApplication || typeof version !== "string" || !version.trim() || version.length > 100) {
      throw new Error("Release identity or schema rejected.");
    }
    if (!Number.isSafeInteger(sequence) || sequence <= minimumSequence || sequence > 9007199254740991) {
      throw new Error("Release sequence rejected.");
    }
    if (!Number.isSafeInteger(size) || size < 1 || size > SignedUpdate.MaxArtifactBytes) {
      throw new Error("Release artifact size rejected.");
    }
    const nowSec = Math.floor(Date.now() / 1000);
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= nowSec) {
      throw new Error("Release expired.");
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      throw new Error("Release URL is invalid.");
    }
    if (parsedUrl.protocol !== "https:" || parsedUrl.username || parsedUrl.password || parsedUrl.hash) {
      throw new Error("Release URL must be HTTPS without user info or fragment.");
    }

    if (typeof sha256Hex !== "string" || sha256Hex.length !== 64) {
      throw new Error("Release SHA-256 hash is invalid.");
    }
    const digest = Buffer.from(sha256Hex, "hex");
    if (digest.length !== 32) {
      throw new Error("Release SHA-256 digest length is invalid.");
    }

    return new VerifiedUpdate(application, version, sequence, rawUrl, size, expiresAt, digest);
  }

  static download(update, destination, options = {}) {
    return new Promise((resolve, reject) => {
      if (!update || !(update instanceof VerifiedUpdate)) {
        return reject(new Error("update must be a VerifiedUpdate instance"));
      }
      const nowSec = Math.floor(Date.now() / 1000);
      if (update.expiresAt <= nowSec) {
        return reject(new Error("Release expired."));
      }

      const target = path.resolve(destination);
      if (fs.existsSync(target)) {
        return reject(new Error("Destination file already exists."));
      }
      const dir = path.dirname(target);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const temporary = `${target}.${crypto.randomBytes(8).toString("hex")}.partial`;
      const outStream = fs.createWriteStream(temporary, { flags: "wx" });
      const hash = crypto.createHash("sha256");
      let totalBytes = 0;
      let cleanedUp = false;

      const cleanup = (err) => {
        if (cleanedUp) return;
        cleanedUp = true;
        try { outStream.destroy(); } catch {}
        try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch {}
        reject(err);
      };

      outStream.on("error", cleanup);

      const reqUrl = new URL(update.url);
      const req = https.request(reqUrl, {
        method: "GET",
        headers: { "User-Agent": "NightAuth-Updater/1.0" },
        timeout: (options.timeoutSeconds || 300) * 1000
      }, (res) => {
        if (res.statusCode !== 200) {
          return cleanup(new Error(`Artifact must return HTTP 200 without redirects (got ${res.statusCode}).`));
        }
        const cl = res.headers["content-length"];
        if (cl && parseInt(cl, 10) !== update.size) {
          return cleanup(new Error("Artifact length differs from signed manifest."));
        }

        res.on("data", (chunk) => {
          totalBytes += chunk.length;
          if (totalBytes > update.size) {
            return cleanup(new Error("Artifact exceeds signed size."));
          }
          hash.update(chunk);
          outStream.write(chunk);
        });

        res.on("end", () => {
          outStream.end(() => {
            if (totalBytes !== update.size) {
              return cleanup(new Error("Artifact size differs from signed manifest."));
            }
            const computedDigest = hash.digest();
            if (!crypto.timingSafeEqual(computedDigest, update.digest)) {
              return cleanup(new CryptographicException("Artifact hash rejected."));
            }
            if (update.expiresAt <= Math.floor(Date.now() / 1000)) {
              return cleanup(new Error("Release expired during download."));
            }
            try {
              fs.renameSync(temporary, target);
              resolve(target);
            } catch (renameErr) {
              cleanup(renameErr);
            }
          });
        });

        res.on("error", cleanup);
      });

      req.on("error", cleanup);
      req.on("timeout", () => {
        req.destroy();
        cleanup(new Error("Download timed out."));
      });
      req.end();
    });
  }
}

class SignedUpdateInstaller {
  static MaxManifestBytes = 64 * 1024;

  static getSequencePath(application) {
    if (!application || typeof application !== "string" || application.length > 100 || /[<>:"/\\|?*]/.test(application)) {
      throw new Error("Invalid application identifier.");
    }
    const isWin = process.platform === "win32";
    const root = isWin
      ? (process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"))
      : (process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"));
    const dir = path.join(root, "NightAuth", "release-sequences");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const appHash = crypto.createHash("sha256").update(application, "utf8").digest("hex");
    return path.join(dir, `${appHash}.seq`);
  }

  static async readSequence(seqPath) {
    if (!fs.existsSync(seqPath)) return 0;
    try {
      const text = await fsp.readFile(seqPath, "utf8");
      const trimmed = text.trim();
      const seq = Number(trimmed);
      if (!Number.isSafeInteger(seq) || seq < 0) {
        throw new Error("Stored release sequence is corrupt; refusing update.");
      }
      return seq;
    } catch {
      throw new Error("Stored release sequence is corrupt; refusing update.");
    }
  }

  static async writeSequenceAtomically(seqPath, sequence) {
    const temp = `${seqPath}.${crypto.randomBytes(8).toString("hex")}.tmp`;
    try {
      await fsp.writeFile(temp, String(sequence) + "\n", { encoding: "utf8", flag: "wx" });
      await fsp.rename(temp, seqPath);
    } finally {
      try { if (fs.existsSync(temp)) await fsp.unlink(temp); } catch {}
    }
  }

  static async download(manifestUrl, pinnedReleaseKeyHex, application, destination, options = {}) {
    let parsed;
    try { parsed = new URL(manifestUrl); } catch { throw new Error("Invalid manifest URL."); }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash) {
      throw new Error("Release manifest must use an HTTPS URL without user info or fragment.");
    }

    const statePath = SignedUpdateInstaller.getSequencePath(application);
    const lockPath = statePath + ".lock";

    let lockFd = null;
    const start = Date.now();
    while (true) {
      try {
        lockFd = fs.openSync(lockPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_RDWR);
        break;
      } catch {
        if (Date.now() - start > 10000) {
          throw new Error("Could not acquire update lock.");
        }
        await new Promise(r => setTimeout(r, 100));
      }
    }

    try {
      const currentSequence = await SignedUpdateInstaller.readSequence(statePath);

      const manifestBytes = await new Promise((resolve, reject) => {
        const req = https.request(parsed, {
          method: "GET",
          headers: { "User-Agent": "NightAuth-Updater/1.0" },
          timeout: (options.timeoutSeconds || 30) * 1000
        }, (res) => {
          if (res.statusCode !== 200) {
            return reject(new Error(`Release manifest must return HTTP 200 without redirects (got ${res.statusCode}).`));
          }
          const chunks = [];
          let total = 0;
          res.on("data", (c) => {
            total += c.length;
            if (total > SignedUpdateInstaller.MaxManifestBytes) {
              res.destroy();
              return reject(new Error("Release manifest exceeds the maximum allowed size."));
            }
            chunks.push(c);
          });
          res.on("end", () => resolve(Buffer.concat(chunks)));
          res.on("error", reject);
        });
        req.on("error", reject);
        req.on("timeout", () => {
          req.destroy();
          reject(new Error("Manifest download timed out."));
        });
        req.end();
      });

      const envelopeJson = manifestBytes.toString("utf8");
      const verified = SignedUpdate.verify(envelopeJson, pinnedReleaseKeyHex, application, currentSequence);
      const fullDestination = await SignedUpdate.download(verified, destination, options);
      await SignedUpdateInstaller.writeSequenceAtomically(statePath, verified.sequence);
      return fullDestination;
    } finally {
      if (lockFd !== null) {
        try { fs.closeSync(lockFd); } catch {}
        try { if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath); } catch {}
      }
    }
  }
}

module.exports = {
  Api,
  SecurityProtections,
  CryptographicException,
  NightAuthStreamException,
  SseParser,
  VerifiedUpdate,
  SignedUpdate,
  SignedUpdateInstaller,
  DEFAULT_API_URL,
  DEFAULT_SIGNING_PUBLIC_KEY,
  DEFAULT_SEALED_BOX_PUBLIC_KEY,
  HKDF_INFO,
  SEAL_INFO
};

