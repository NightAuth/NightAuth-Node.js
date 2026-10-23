#!/usr/bin/env node
const readline = require("readline");
const { Api, SecurityProtections } = require("../sdk/nightauth.js");

if (process.env.NIGHTAUTH_IGNORE_SECURITY === undefined || process.argv.includes("--ignore-security") || process.argv.includes("--dev")) {
  process.env.NIGHTAUTH_IGNORE_SECURITY = "1";
}

const APP_NAME = "";
const APP_API_KEY = "";
const APP_VERSION = "1.0";
const APP_TOKEN = null;

const C_RESET = "\x1b[0m";
const C_BOLD = "\x1b[1m";
const C_DIM = "\x1b[38;2;100;116;139m";
const C_MUTED = "\x1b[38;2;148;163;184m";
const C_TEXT = "\x1b[38;2;226;232;240m";
const C_WHITE = "\x1b[38;2;248;250;252m";
const C_BLUE = "\x1b[38;2;59;130;246m";
const C_GLOW = "\x1b[38;2;96;165;250m";
const C_CYAN = "\x1b[38;2;56;189;248m";
const C_GREEN = "\x1b[38;2;52;211;153m";
const C_AMBER = "\x1b[38;2;251;191;36m";
const C_RED = "\x1b[38;2;248;113;113m";
const C_BORDER = "\x1b[38;2;42;50;70m";
const C_BADGE_BG = "\x1b[48;2;23;37;68m";
const C_GREEN_BG = "\x1b[48;2;14;46;38m";
const C_RED_BG = "\x1b[48;2;56;20;26m";

let nightAuth;

let linesQueue = [];
let resolversQueue = [];
let stdinEnded = false;

readline.createInterface({ input: process.stdin, terminal: false }).on("line", (line) => {
  if (resolversQueue.length > 0) {
    const resolve = resolversQueue.shift();
    resolve(line.trim());
  } else {
    linesQueue.push(line.trim());
  }
}).on("close", () => {
  stdinEnded = true;
  while (resolversQueue.length > 0) {
    const resolve = resolversQueue.shift();
    resolve("");
  }
});

function fit(value, width) {
  const s = String(value == null ? "" : value);
  return s.length >= width ? s.slice(0, width) : s.padEnd(width, " ");
}

function clearScreen() {
  try {
    if (process.platform === "win32") {
      require("child_process").execSync("cls", { stdio: "inherit" });
      return;
    }
  } catch {}
  process.stdout.write("\x1b[2J\x1b[H");
}

function printHr() {
  process.stdout.write(`  ${C_BORDER}────────────────────────────────────────────────────────────────────────────${C_RESET}\n`);
}

function printSectionHeader(title, subtitle) {
  process.stdout.write(`\n  ${C_BLUE}▌${C_RESET} ${C_WHITE}${C_BOLD}${title}${C_RESET}`);
  if (subtitle) {
    process.stdout.write(`  ${C_DIM}·  ${subtitle}${C_RESET}`);
  }
  process.stdout.write("\n");
  printHr();
}

function printOk(title, detail = "") {
  process.stdout.write(`\n  ${C_GREEN_BG}${C_GREEN}${C_BOLD} ✓ SUCCESS ${C_RESET} ${C_WHITE}${C_BOLD}${title}${C_RESET}`);
  if (detail) {
    process.stdout.write(` ${C_MUTED}— ${detail}${C_RESET}`);
  }
  process.stdout.write("\n\n");
}

function printErr(title, detail = "") {
  process.stdout.write(`\n  ${C_RED_BG}${C_RED}${C_BOLD} ✕ ERROR ${C_RESET} ${C_WHITE}${C_BOLD}${title}${C_RESET}`);
  if (detail) {
    process.stdout.write(` ${C_RED}— ${detail}${C_RESET}`);
  }
  process.stdout.write("\n\n");
}

function printInfo(label, value) {
  process.stdout.write(`  ${C_BLUE}•${C_RESET} ${C_MUTED}${fit(label, 18)}${C_RESET} ${C_CYAN}${value}${C_RESET}\n`);
}

function ask(prompt) {
  process.stdout.write(`  ${C_GLOW}❯${C_RESET} ${C_TEXT}${prompt}${C_RESET}`);
  return new Promise((resolve) => {
    if (linesQueue.length > 0) {
      resolve(linesQueue.shift());
    } else if (stdinEnded) {
      process.exit(0);
    } else {
      resolversQueue.push(resolve);
    }
  });
}

function formatTimestamp(raw) {
  if (raw === null || raw === undefined) return "";
  const s = String(raw).trim();
  if (!s) return "";
  if (/^\d+$/.test(s) && Number(s) > 0) {
    const num = Number(s);
    const ms = num > 100000000000 ? num : num * 1000;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) {
      return d.toISOString().replace("T", " ").substring(0, 16) + " UTC";
    }
  }
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return d.toISOString().replace("T", " ").substring(0, 16) + " UTC";
    }
  } catch {}
  return s;
}

function renderBanner(app_name, hwid, connected) {
  process.stdout.write("\n");
  process.stdout.write(`  ${C_BLUE}${C_BOLD}  _   _ _       _     _      _         _   _     \n${C_RESET}`);
  process.stdout.write(`  ${C_BLUE}${C_BOLD} | \\ | (_) __ _| |__ | |_   / \\  _   _| |_| |__  \n${C_RESET}`);
  process.stdout.write(`  ${C_GLOW}${C_BOLD} |  \\| | |/ _\` | '_ \\| __| / _ \\| | | | __| '_ \\ \n${C_RESET}`);
  process.stdout.write(`  ${C_GLOW}${C_BOLD} | |\\  | | (_| | | | | |_ / ___ \\ |_| | |_| | | |\n${C_RESET}`);
  process.stdout.write(`  ${C_CYAN}${C_BOLD} |_| \\_|_|\\__, |_| |_|\\__/_/   \\_\\__,_|\\__|_| |_|\n${C_RESET}`);
  process.stdout.write(`  ${C_CYAN}${C_BOLD}          |___/                                  ${C_RESET}  ${C_BADGE_BG}${C_GLOW}${C_BOLD} NODE.JS CLI ${C_RESET}\n\n`);

  process.stdout.write(`  ${C_BORDER}╭──────────────────────────────────────────────────────────────────────────╮${C_RESET}\n`);
  const appField = fit(app_name || "Unconfigured", 26);
  const statusIcon = connected ? `${C_GREEN}● ` : `${C_AMBER}◌ `;
  const statusText = fit(connected ? "Connected" : "Initializing", 16);
  process.stdout.write(`  ${C_BORDER}│${C_RESET}  ${C_DIM}APPLICATION${C_RESET}  ${C_WHITE}${C_BOLD}${appField}${C_RESET}  ${C_DIM}STATUS${C_RESET}  ${statusIcon}${statusText}${C_RESET} ${C_BORDER}│${C_RESET}\n`);
  if (hwid) {
    process.stdout.write(`  ${C_BORDER}│${C_RESET}  ${C_DIM}DEVICE HWID${C_RESET}  ${C_CYAN}${fit(hwid, 58)}${C_RESET} ${C_BORDER}│${C_RESET}\n`);
  }
  process.stdout.write(`  ${C_BORDER}╰──────────────────────────────────────────────────────────────────────────╯${C_RESET}\n`);
}

function registerRealtimeEventHandlers() {
  nightAuth.onSessionInvalidated = (reason) => {
    printErr("Security Alert", `${reason} (Kill-switch triggered)`);
    process.exit(0xDEAD);
  };

  nightAuth.onAppBanned = (reason) => {
    printErr("Critical Ban", `Application banned: ${reason}`);
    process.exit(0xDEAD);
  };

  nightAuth.onAppStatusChanged = (status) => {
    printErr("Status Change", status);
    process.exit(0xDEAD);
  };

  nightAuth.onVersionUpdated = (newVersion, downloadUrl) => {
    const extra = downloadUrl ? ` (${downloadUrl})` : "";
    printInfo("Update Available:", `v${newVersion}${extra}`);
  };

  nightAuth.onChatMessageReceived = (msg, room) => {
    process.stdout.write(`\n  ${C_BADGE_BG}${C_GLOW} CHAT #${room} ${C_RESET} ${C_CYAN}${C_BOLD}${msg.author}${C_RESET}: ${C_TEXT}${msg.message}${C_RESET}\n`);
  };
}

async function performHandshake(app_name) {
  process.stdout.write(`\n  ${C_MUTED}◌ Establishing encrypted session with NightAuth Cloud...${C_RESET}\r`);
  try {
    await nightAuth.init();
  } catch (ex) {
    process.stdout.write("                                                                      \r");
    renderBanner(app_name, "", false);
    printErr("Handshake Exception", ex && ex.message ? ex.message : String(ex));
    await ask("Press Enter to exit...");
    process.exit(1);
  }
  process.stdout.write("                                                                      \r");

  if (!nightAuth.response.success) {
    renderBanner(app_name, "", false);
    printErr("Handshake Failed", nightAuth.response.message);
    process.stdout.write(`  ${C_DIM}Please verify your App Name and API Key.${C_RESET}\n\n`);
    await ask("Press Enter to exit...");
    process.exit(1);
  }

  const hwid = SecurityProtections.getHardwareId();
  clearScreen();
  renderBanner(app_name, hwid, true);
}

async function handleLogin() {
  printSectionHeader("ACCOUNT SIGN IN", "Authenticate with your username and password");
  const user = await ask("Username: ");
  const pass = await ask("Password: ");
  const totp = await ask(`2FA Code ${C_DIM}(Optional, Enter to skip)${C_TEXT}: `);

  if (await nightAuth.login(user, pass, totp || null)) {
    printOk("Session Authenticated", "Welcome back to NightAuth.");
    return true;
  }

  printErr("Login Failed", nightAuth.response.message);
  return false;
}

async function handleRegister() {
  printSectionHeader("CREATE NEW ACCOUNT", "Activate a license key and bind your credentials");
  const user = await ask("Username: ");
  const pass = await ask("Password: ");
  const key = await ask("License Key: ");
  const email = await ask(`Email Address ${C_DIM}(Optional, Enter to skip)${C_TEXT}: `);

  if (await nightAuth.register(user, pass, key, email)) {
    printOk("Account Registered & Activated", "Session started automatically.");
    return true;
  }

  let detail = nightAuth.response.message || "";
  if (nightAuth.response.error) {
    detail += ` [${nightAuth.response.error}]`;
  }
  printErr("Registration Failed", detail);
  return false;
}

async function handleLicenseOnly() {
  printSectionHeader("LICENSE KEY AUTHENTICATION", "Instant passwordless login bound to your HWID");
  const key = await ask("Enter License Key: ");

  if (await nightAuth.license(key)) {
    printOk("License Validated", "Direct hardware-bound session active.");
    return true;
  }

  printErr("License Validation Failed", nightAuth.response.message);
  return false;
}

async function handleUpgrade(knownUser = "") {
  printSectionHeader("UPGRADE ACCOUNT SUBSCRIPTION", "Attach a new license key tier to an account");
  let user = knownUser;
  if (user) {
    printInfo("Target Account:", user);
  } else {
    user = await ask("Target Username: ");
  }
  const key = await ask("Upgrade License Key: ");

  if (await nightAuth.upgrade(user, key)) {
    printOk("Upgrade Complete", nightAuth.response.message);
    return true;
  } else {
    printErr("Upgrade Failed", nightAuth.response.message);
    return false;
  }
}

async function handleForgotPassword() {
  printSectionHeader("PASSWORD RECOVERY", "Request a reset link to your registered email");
  const email = await ask("Registered Email: ");

  if (await nightAuth.forgotPassword(email)) {
    printOk("Recovery Dispatched", "If an account matches, a password reset link was sent to your email.");
  } else {
    printErr("Request Failed", nightAuth.response.message);
  }
}

async function handleResetPassword() {
  printSectionHeader("COMPLETE PASSWORD RESET", "Confirm recovery token and set a new password");
  const token = await ask("Reset Token: ");
  const newPass = await ask("New Password: ");

  if (await nightAuth.resetPassword(token, newPass)) {
    printOk("Password Updated", "Your password has been reset successfully.");
  } else {
    printErr("Reset Failed", nightAuth.response.message);
  }
}

async function handleResetHwid() {
  printSectionHeader("RESET HARDWARE FINGERPRINT (HWID)", "Unbind previous device to authorize a new machine");
  const user = await ask("Username: ");
  const pass = await ask("Password: ");
  const totp = await ask(`2FA Code ${C_DIM}(Optional, Enter to skip)${C_TEXT}: `);

  if (await nightAuth.resetHwid(user, pass, totp || null)) {
    printOk("HWID Reset", nightAuth.response.message);
  } else {
    printErr("HWID Reset Failed", nightAuth.response.message);
  }
}

async function handleCheckBlacklist() {
  printSectionHeader("HARDWARE BLACKLIST CHECK", "Verify if a machine fingerprint is restricted");
  let targetHwid = await ask(`Hardware ID ${C_DIM}(Press Enter for local machine HWID)${C_TEXT}: `);
  if (!targetHwid) {
    targetHwid = SecurityProtections.getHardwareId();
  }

  const res = await nightAuth.checkBlacklist(targetHwid);
  const isBlacklisted = typeof res === "object" && res !== null ? Boolean(res.blacklisted) : Boolean(res);
  if (nightAuth.response.success) {
    if (isBlacklisted) {
      printErr("Blacklisted", "This Hardware ID is currently restricted.");
    } else {
      printOk("Clean Fingerprint", "Hardware ID is not on the blacklist.");
    }
  } else {
    printErr("Blacklist Query Failed", nightAuth.response.message);
  }
}

async function handleVerifyHash() {
  printSectionHeader("BINARY INTEGRITY CHECK", "Validate SHA-256 checksum against server registry");
  const hash = await ask("SHA-256 File Hash: ");
  const verified = await nightAuth.verifyFileHash(hash);
  if (nightAuth.response.success) {
    if (verified) {
      printOk("Integrity Verified", "Checksum matches authorized server release.");
    } else {
      printErr("Verification Failed", "Checksum does not match any approved file release.");
    }
  } else {
    printErr("Verification Failed", nightAuth.response.message);
  }
}

async function handleAuthenticationFlow() {
  while (true) {
    printSectionHeader("AUTHENTICATION & PRE-SESSION GATEWAY", "Select an operation to continue");

    process.stdout.write(`  ${C_BADGE_BG}${C_GLOW}${C_BOLD} 01 ${C_RESET} ${C_WHITE}Sign In (Username & Password)${C_RESET}` +
                         `          ${C_BADGE_BG}${C_GLOW}${C_BOLD} 06 ${C_RESET} ${C_WHITE}Complete Password Reset (Token)${C_RESET}\n`);
    process.stdout.write(`  ${C_BADGE_BG}${C_GLOW}${C_BOLD} 02 ${C_RESET} ${C_WHITE}Register New Account + License${C_RESET}` +
                         `         ${C_BADGE_BG}${C_GLOW}${C_BOLD} 07 ${C_RESET} ${C_WHITE}Reset Hardware Binding (HWID)${C_RESET}\n`);
    process.stdout.write(`  ${C_BADGE_BG}${C_GLOW}${C_BOLD} 03 ${C_RESET} ${C_WHITE}Instant License Key Login${C_RESET}` +
                         `              ${C_BADGE_BG}${C_GLOW}${C_BOLD} 08 ${C_RESET} ${C_WHITE}Check HWID Blacklist Status${C_RESET}\n`);
    process.stdout.write(`  ${C_BADGE_BG}${C_GLOW}${C_BOLD} 04 ${C_RESET} ${C_WHITE}Upgrade Existing Account Plan${C_RESET}` +
                         `          ${C_BADGE_BG}${C_GLOW}${C_BOLD} 09 ${C_RESET} ${C_WHITE}Verify Binary SHA-256 Hash${C_RESET}\n`);
    process.stdout.write(`  ${C_BADGE_BG}${C_GLOW}${C_BOLD} 05 ${C_RESET} ${C_WHITE}Forgot Password (Email Link)${C_RESET}` +
                         `           ${C_RED_BG}${C_RED}${C_BOLD} 10 ${C_RESET} ${C_MUTED}Exit Application${C_RESET}\n\n`);

    const sel = await ask("Select option [1-10]: ");

    if (sel === "1" || sel === "01") {
      if (await handleLogin()) return true;
    } else if (sel === "2" || sel === "02") {
      if (await handleRegister()) return true;
    } else if (sel === "3" || sel === "03") {
      if (await handleLicenseOnly()) return true;
    } else if (sel === "4" || sel === "04") {
      await handleUpgrade();
    } else if (sel === "5" || sel === "05") {
      await handleForgotPassword();
    } else if (sel === "6" || sel === "06") {
      await handleResetPassword();
    } else if (sel === "7" || sel === "07") {
      await handleResetHwid();
    } else if (sel === "8" || sel === "08") {
      await handleCheckBlacklist();
    } else if (sel === "9" || sel === "09") {
      await handleVerifyHash();
    } else if (sel === "10" || sel === "0") {
      return false;
    }
  }
}

function renderUserProfile() {
  const u = nightAuth.user;
  const createdStr = formatTimestamp(u.createdAt) || "-";
  const lastLoginStr = formatTimestamp(u.lastLoginAt) || "Just now";
  process.stdout.write("\n");
  process.stdout.write(`  ${C_BORDER}╭─ ${C_GLOW}${C_BOLD}AUTHENTICATED IDENTITY & ENTITLEMENTS${C_BORDER} ──────────────────────────────────╮${C_RESET}\n`);
  process.stdout.write(`  ${C_BORDER}│${C_RESET}  ${C_DIM}Username :${C_RESET} ${C_WHITE}${C_BOLD}${fit(u.username || "Authenticated", 24)}${C_RESET}  ${C_DIM}Status     :${C_RESET} ${C_GREEN}${C_BOLD}${fit(u.status || "ACTIVE", 20)}${C_RESET} ${C_BORDER}│${C_RESET}\n`);
  process.stdout.write(`  ${C_BORDER}│${C_RESET}  ${C_DIM}Email    :${C_RESET} ${C_TEXT}${fit(u.email || "Not linked", 24)}${C_RESET}  ${C_DIM}Client IP  :${C_RESET} ${C_CYAN}${fit(u.ip || "Protected / TLS", 20)}${C_RESET} ${C_BORDER}│${C_RESET}\n`);
  process.stdout.write(`  ${C_BORDER}│${C_RESET}  ${C_DIM}Created  :${C_RESET} ${C_MUTED}${fit(createdStr, 24)}${C_RESET}  ${C_DIM}Last Login :${C_RESET} ${C_MUTED}${fit(lastLoginStr, 20)}${C_RESET} ${C_BORDER}│${C_RESET}\n`);
  process.stdout.write(`  ${C_BORDER}├──────────────────────────────────────────────────────────────────────────┤${C_RESET}\n`);

  if (u.subscriptions && u.subscriptions.length > 0) {
    for (const sub of u.subscriptions) {
      const expStr = formatTimestamp(sub.expiry) || "Lifetime";
      process.stdout.write(`  ${C_BORDER}│${C_RESET}  ${C_GREEN}●${C_RESET} ${C_WHITE}${C_BOLD}${fit(sub.subscription, 16)}${C_RESET} ${C_DIM}Key:${C_RESET} ${C_CYAN}${fit(sub.key || "Direct Entitlement", 22)}${C_RESET} ${C_DIM}Exp:${C_RESET} ${C_AMBER}${fit(expStr, 16)}${C_RESET} ${C_BORDER}│${C_RESET}\n`);
    }
  } else {
    process.stdout.write(`  ${C_BORDER}│${C_RESET}  ${C_DIM}No active subscription tiers attached to this account.${C_RESET}                   ${C_BORDER}│${C_RESET}\n`);
  }
  process.stdout.write(`  ${C_BORDER}╰──────────────────────────────────────────────────────────────────────────╯${C_RESET}\n`);
}

async function handleChatRoom() {
  printSectionHeader("LIVE CHANNEL CHAT", "Type /exit at any time to leave the channel");
  let room = await ask("Channel name (e.g. general): ");
  if (!room) room = "general";

  const msgs = await nightAuth.getChatMessages(room, 0, true);
  process.stdout.write(`\n  ${C_BORDER}╭─ ${C_GLOW}${C_BOLD}#${room.padEnd(20, " ")}${C_BORDER} ──────────────────────────────────────────────────╮${C_RESET}\n`);
  if (!msgs || msgs.length === 0) {
    process.stdout.write(`  ${C_BORDER}│${C_RESET}  ${C_DIM}No messages in this channel yet. Start the conversation below.${C_RESET}          ${C_BORDER}│${C_RESET}\n`);
  } else {
    for (const m of msgs) {
      process.stdout.write(`  ${C_BORDER}│${C_RESET} ${C_DIM}[${m.timestamp}]${C_RESET} ${C_CYAN}${C_BOLD}${m.author}${C_RESET}: ${C_TEXT}${m.message}${C_RESET}\n`);
    }
  }
  process.stdout.write(`  ${C_BORDER}╰──────────────────────────────────────────────────────────────────────────╯${C_RESET}\n\n`);

  while (true) {
    const input = await ask(`${C_CYAN}#${room}${C_RESET} message: `);
    if (input === "/exit" || input === "/EXIT") {
      process.stdout.write(`  ${C_DIM}Left channel #${room}.${C_RESET}\n\n`);
      return;
    }
    if (!input) continue;
    if (!(await nightAuth.sendChatMessage(input, room))) {
      printErr("Send Failed", nightAuth.response.message);
    }
  }
}

async function renderStatsTable() {
  const stats = await nightAuth.getStats();
  if (stats) {
    process.stdout.write("\n");
    process.stdout.write(`  ${C_BORDER}╭─ ${C_GLOW}${C_BOLD}APPLICATION LIVE TELEMETRY${C_BORDER} ─────────────────────────────────────────────╮${C_RESET}\n`);
    process.stdout.write(`  ${C_BORDER}│${C_RESET}  ${C_DIM}Total Users     :${C_RESET} ${C_WHITE}${C_BOLD}${String(stats.totalUsers).padEnd(14, " ")}${C_RESET}  ${C_DIM}Total Licenses  :${C_RESET} ${C_WHITE}${C_BOLD}${String(stats.totalLicenses).padEnd(18, " ")}${C_RESET} ${C_BORDER}│${C_RESET}\n`);
    process.stdout.write(`  ${C_BORDER}│${C_RESET}  ${C_DIM}Active Users    :${C_RESET} ${C_GREEN}${C_BOLD}${String(stats.activeUsers).padEnd(14, " ")}${C_RESET}  ${C_DIM}Used Licenses   :${C_RESET} ${C_CYAN}${C_BOLD}${String(stats.usedLicenses).padEnd(18, " ")}${C_RESET} ${C_BORDER}│${C_RESET}\n`);
    process.stdout.write(`  ${C_BORDER}│${C_RESET}  ${C_DIM}Banned Users    :${C_RESET} ${C_RED}${C_BOLD}${String(stats.bannedUsers).padEnd(14, " ")}${C_RESET}  ${C_DIM}Unused Licenses :${C_RESET} ${C_AMBER}${C_BOLD}${String(stats.unusedLicenses).padEnd(18, " ")}${C_RESET} ${C_BORDER}│${C_RESET}\n`);
    process.stdout.write(`  ${C_BORDER}│${C_RESET}  ${C_DIM}Target Version  :${C_RESET} ${C_GLOW}${String(stats.version || appVersion).padEnd(52, " ")}${C_RESET} ${C_BORDER}│${C_RESET}\n`);
    process.stdout.write(`  ${C_BORDER}╰──────────────────────────────────────────────────────────────────────────╯${C_RESET}\n\n`);
  } else {
    printErr("Telemetry Error", nightAuth.response.message);
  }
}

async function handleSetup2FA() {
  printSectionHeader("TWO-FACTOR AUTHENTICATION (TOTP)", "Enroll an authenticator app (RFC 6238)");
  const setup = await nightAuth.setup2FA();
  if (setup) {
    printInfo("TOTP Secret Key:", setup.secret);
    printInfo("Provisioning URI:", setup.uri);
    const code = await ask("Enter 6-digit Authenticator code: ");
    const conf = await nightAuth.confirm2FA(code);
    if (conf) {
      printOk("2FA Activated", "Store these recovery backup codes safely:");
      for (const bc of conf.backupCodes) {
        process.stdout.write(`    ${C_AMBER}• ${bc}${C_RESET}\n`);
      }
      process.stdout.write("\n");
    } else {
      printErr("Verification Failed", nightAuth.response.message);
    }
  } else {
    printErr("2FA Setup Failed", nightAuth.response.message);
  }
}

async function handleDownloadFile() {
  printSectionHeader("PROTECTED ASSET DOWNLOADER", "Download encrypted files via scoped access ticket");
  const fileId = await ask("Enter File ID or Asset Name: ");
  const content = await nightAuth.downloadFile(fileId);
  if (content) {
    const size = content.length;
    content.fill(0);
    printOk("Download Complete", `Retrieved ${size} bytes securely.`);
  } else {
    printErr("Download Failed", nightAuth.response.message);
  }
}

async function handleListAllUserVars() {
  const vars = await nightAuth.getUserVariables();
  if (!vars) {
    printErr("Fetch Failed", nightAuth.response.message);
    return;
  }
  printSectionHeader("USER CLOUD VARIABLES", "Per-user encrypted key-value pairs");
  if (vars.length === 0) {
    process.stdout.write(`  ${C_DIM}No user variables stored for this account yet.${C_RESET}\n\n`);
    return;
  }
  for (const kv of vars) {
    process.stdout.write(`  ${C_BLUE}•${C_RESET} ${C_CYAN}${C_BOLD}${String(kv.key).padEnd(22, " ")}${C_RESET} = ${C_WHITE}${kv.value}${C_RESET}\n`);
  }
  process.stdout.write("\n");
}

async function handleTriggerWebhook() {
  printSectionHeader("SERVER-SIDE WEBHOOK TRIGGER", "Execute an authenticated webhook endpoint");
  const webId = await ask("Webhook ID: ");
  let payloadStr = await ask(`JSON Payload ${C_DIM}(Enter for {})${C_TEXT}: `);
  if (!payloadStr) payloadStr = "{}";

  try {
    const payload = JSON.parse(payloadStr);
    const result = await nightAuth.triggerWebhook(webId, payload);
    if (result !== null) {
      printOk("Webhook Dispatched", "HTTP 200 OK");
    } else {
      printErr("Webhook Failed", nightAuth.response.message);
    }
  } catch (ex) {
    printErr("Invalid Webhook Payload", ex && ex.message ? ex.message : String(ex));
  }
}

async function handleEventsFeed() {
  printSectionHeader("REAL-TIME APPLICATION EVENTS (SSE)", "Press Enter at any time to stop listening");
  nightAuth.startRealtimeEventListener();
  await ask("");
  nightAuth.stopRealtimeEventListener();
  printOk("Stream Closed", "Disconnected from real-time event feed.");
}

async function handleSelfBan() {
  printSectionHeader("EMERGENCY KILLSWITCH / BAN", "Report security violation and lock this session");
  const reason = await ask(`Ban Reason ${C_DIM}(Optional)${C_TEXT}: `);

  if (await nightAuth.ban(reason || null)) {
    printOk("Killswitch Executed", nightAuth.response.message);
  } else {
    printErr("Ban Report Failed", nightAuth.response.message);
  }
}

async function handleHeartbeat() {
  if (await nightAuth.heartbeat()) {
    printOk("Heartbeat Acknowledged", nightAuth.response.message);
  } else {
    printErr("Heartbeat Failed", nightAuth.response.message);
  }
}

async function handleKillSessionDemo() {
  printSectionHeader("SESSION REVOCATION & INVALIDATION VERIFICATION", "3-Step Live Security Audit");
  process.stdout.write(`  ${C_MUTED}1. Verifying active session before revocation...${C_RESET}\n`);
  if (await nightAuth.check()) {
    printOk("Step 1 Passed", "Session is active and authenticated on server.");
  } else {
    printErr("Step 1 Failed", nightAuth.response.message);
    return;
  }

  process.stdout.write(`  ${C_MUTED}2. Revoking and terminating session on server (/logout)...${C_RESET}\n`);
  if (await nightAuth.logout()) {
    printOk("Step 2 Passed", "Server confirmed session revocation.");
  } else {
    printErr("Step 2 Failed", nightAuth.response.message);
  }

  process.stdout.write(`  ${C_MUTED}3. Verifying that subsequent session check is rejected...${C_RESET}\n`);
  if (await nightAuth.check()) {
    printErr("Step 3 Unexpected", "Session was still accepted after revocation.");
  } else {
    printOk("Step 3 Passed", "Server rejected revoked session as expected.");
  }
}

async function runApplicationFeaturesMenu() {
  while (true) {
    printSectionHeader("WORKSPACE MODULES & ACTIONS", "Select a command [1-21]");

    process.stdout.write(`  ${C_DIM}CLOUD VARIABLES & CHAT${C_RESET}                    ${C_DIM}SECURITY & TELEMETRY${C_RESET}\n`);
    process.stdout.write(`  ${C_BADGE_BG}${C_GLOW}${C_BOLD} 01 ${C_RESET} ${C_WHITE}Read Global Variable${C_RESET}` +
                         `                 ${C_BADGE_BG}${C_GLOW}${C_BOLD} 10 ${C_RESET} ${C_WHITE}Setup Two-Factor Auth (2FA)${C_RESET}\n`);
    process.stdout.write(`  ${C_BADGE_BG}${C_GLOW}${C_BOLD} 02 ${C_RESET} ${C_WHITE}Get User Cloud Variable${C_RESET}` +
                         `              ${C_BADGE_BG}${C_GLOW}${C_BOLD} 11 ${C_RESET} ${C_WHITE}Disable Two-Factor Auth (2FA)${C_RESET}\n`);
    process.stdout.write(`  ${C_BADGE_BG}${C_GLOW}${C_BOLD} 03 ${C_RESET} ${C_WHITE}Set User Cloud Variable${C_RESET}` +
                         `              ${C_BADGE_BG}${C_GLOW}${C_BOLD} 12 ${C_RESET} ${C_WHITE}Download Protected Asset${C_RESET}\n`);
    process.stdout.write(`  ${C_BADGE_BG}${C_GLOW}${C_BOLD} 04 ${C_RESET} ${C_WHITE}List All User Variables${C_RESET}` +
                         `              ${C_BADGE_BG}${C_GLOW}${C_BOLD} 13 ${C_RESET} ${C_WHITE}Trigger Server Webhook${C_RESET}\n`);
    process.stdout.write(`  ${C_BADGE_BG}${C_GLOW}${C_BOLD} 05 ${C_RESET} ${C_WHITE}Enter Live Chat Channel${C_RESET}` +
                         `              ${C_BADGE_BG}${C_GLOW}${C_BOLD} 14 ${C_RESET} ${C_WHITE}Send Audit Log Event${C_RESET}\n`);
    process.stdout.write(`  ${C_BADGE_BG}${C_GLOW}${C_BOLD} 19 ${C_RESET} ${C_WHITE}Fetch Paginated Chat History${C_RESET}` +
                         `         ${C_BADGE_BG}${C_GLOW}${C_BOLD} 15 ${C_RESET} ${C_WHITE}Verify Session Entitlement${C_RESET}\n\n`);

    process.stdout.write(`  ${C_DIM}ACCOUNT & INSIGHTS${C_RESET}                        ${C_DIM}SESSION LIFECYCLE${C_RESET}\n`);
    process.stdout.write(`  ${C_BADGE_BG}${C_GLOW}${C_BOLD} 06 ${C_RESET} ${C_WHITE}Application Live Statistics${C_RESET}` +
                         `          ${C_BADGE_BG}${C_GLOW}${C_BOLD} 16 ${C_RESET} ${C_WHITE}Send Heartbeat Ping${C_RESET}\n`);
    process.stdout.write(`  ${C_BADGE_BG}${C_GLOW}${C_BOLD} 07 ${C_RESET} ${C_WHITE}View Online Active Users${C_RESET}` +
                         `             ${C_BADGE_BG}${C_GLOW}${C_BOLD} 17 ${C_RESET} ${C_WHITE}Emergency Killswitch / Ban${C_RESET}\n`);
    process.stdout.write(`  ${C_BADGE_BG}${C_GLOW}${C_BOLD} 08 ${C_RESET} ${C_WHITE}Change Account Username${C_RESET}` +
                         `              ${C_BADGE_BG}${C_GLOW}${C_BOLD} 18 ${C_RESET} ${C_WHITE}Stream Live Events (SSE)${C_RESET}\n`);
    process.stdout.write(`  ${C_BADGE_BG}${C_GLOW}${C_BOLD} 09 ${C_RESET} ${C_WHITE}Upgrade Plan with License Key${C_RESET}` +
                         `        ${C_BADGE_BG}${C_GLOW}${C_BOLD} 20 ${C_RESET} ${C_WHITE}Session Revocation Audit Demo${C_RESET}\n`);
    process.stdout.write(`                                            ${C_RED_BG}${C_RED}${C_BOLD} 21 ${C_RESET} ${C_MUTED}Sign Out & Terminate Session${C_RESET}\n\n`);

    const choice = await ask("Action [1-21]: ");
    const num = parseInt(choice, 10) || 0;

    if (num === 1) {
      const gKey = await ask("Global Variable Key: ");
      const gVal = await nightAuth.getGlobalVar(gKey);
      if (gVal) {
        printOk(gKey, gVal);
      } else {
        printErr("Fetch Failed", nightAuth.response.message);
      }
    } else if (num === 2) {
      const uKey = await ask("User Variable Key: ");
      const uVal = await nightAuth.getUserVar(uKey);
      if (uVal) {
        printOk(uKey, uVal);
      } else {
        printErr("Fetch Failed", nightAuth.response.message);
      }
    } else if (num === 3) {
      const sKey = await ask("User Variable Key: ");
      const sVal = await ask("Value to Store: ");
      if (await nightAuth.setUserVar(sKey, sVal)) {
        printOk("Variable Saved", sKey);
      } else {
        printErr("Save Failed", nightAuth.response.message);
      }
    } else if (num === 4) {
      await handleListAllUserVars();
    } else if (num === 5) {
      await handleChatRoom();
    } else if (num === 6) {
      await renderStatsTable();
    } else if (num === 7) {
      const users = await nightAuth.getOnlineUsers();
      const hdr = `${users.length} active session(s)`;
      printSectionHeader("ONLINE ACTIVE SESSIONS", hdr);
      for (const u of users) {
        process.stdout.write(`  ${C_GREEN}●${C_RESET} ${C_WHITE}${u}${C_RESET}\n`);
      }
      process.stdout.write("\n");
    } else if (num === 8) {
      const newU = await ask("New Username: ");
      const p1 = await ask("Confirm Password: ");
      if (await nightAuth.changeUsername(newU, p1)) {
        printOk("Username Updated", nightAuth.user.username);
        process.stdout.write(`  ${C_AMBER}For security, your session has been closed. Please sign in with your new username.${C_RESET}\n\n`);
        return;
      } else {
        printErr("Update Failed", nightAuth.response.message);
      }
    } else if (num === 9) {
      if (await handleUpgrade(nightAuth.user.username)) {
        await nightAuth.check();
        renderUserProfile();
      }
    } else if (num === 10) {
      await handleSetup2FA();
    } else if (num === 11) {
      const p3 = await ask("Account Password: ");
      const code3 = await ask("6-digit Authenticator Code: ");
      if (await nightAuth.disable2FA(p3, code3)) {
        printOk("2FA Disabled", "Two-factor protection has been removed from this account.");
      } else {
        printErr("Disable Failed", nightAuth.response.message);
      }
    } else if (num === 12) {
      await handleDownloadFile();
    } else if (num === 13) {
      await handleTriggerWebhook();
    } else if (num === 14) {
      const logMsg = await ask("Audit Log Message: ");
      if (await nightAuth.log(logMsg)) {
        printOk("Audit Log Recorded", "Delivered to application telemetry feed.");
      } else {
        printErr("Log Failed", nightAuth.response.message);
      }
    } else if (num === 15) {
      if (await nightAuth.check()) {
        printOk("Session Verified", "Active and cryptographically valid.");
        renderUserProfile();
      } else {
        printErr("Session Invalid", nightAuth.response.message);
      }
    } else if (num === 16) {
      await handleHeartbeat();
    } else if (num === 17) {
      await handleSelfBan();
    } else if (num === 18) {
      await handleEventsFeed();
    } else if (num === 19) {
      const histRoom = await ask("Channel Name: ");
      const histBefore = await ask(`Before Message ID ${C_DIM}(Optional, Enter for latest)${C_TEXT}: `);
      const histMr = await ask("Mark messages as read? (y/n): ");
      const beforeId = histBefore ? parseInt(histBefore, 10) || 0 : 0;
      const markRead = Boolean(histMr && (histMr[0] === "y" || histMr[0] === "Y"));

      const hist = await nightAuth.getChatMessages(histRoom, beforeId, markRead);
      if (!nightAuth.response.success) {
        printErr("History Query Failed", nightAuth.response.message);
      } else {
        const sub = `${hist.length} message(s) retrieved`;
        printSectionHeader(histRoom, sub);
        for (const m of hist) {
          process.stdout.write(`  ${C_DIM}[${m.timestamp}]${C_RESET} ${C_CYAN}${C_BOLD}${m.author}${C_RESET}: ${C_TEXT}${m.message}${C_RESET} ${C_DIM}(#${m.id} · ${m.status || "-"})${C_RESET}\n`);
        }
        process.stdout.write("\n");
      }
    } else if (num === 20) {
      await handleKillSessionDemo();
      return;
    } else if (num === 21) {
      await nightAuth.logout();
      printOk("Signed Out", "Session revoked cleanly. Goodbye!");
      return;
    }
  }
}

function startHeartbeat() {
  setInterval(async () => {
    try {
      await nightAuth.heartbeat();
    } catch {}
  }, 120000).unref();
}

async function main() {
  if (process.platform === "win32") {
    try {
      require("child_process").execSync("chcp 65001 >nul", { stdio: "ignore" });
    } catch {}
  }
  process.stdout.write("\x1b]2;NightAuth — Node.js Security Console\x1b\\");

  let appName = process.env.NIGHTAUTH_APP_NAME || APP_NAME;
  let apiKey = process.env.NIGHTAUTH_API_KEY || APP_API_KEY;
  const appVersion = process.env.NIGHTAUTH_APP_VERSION || APP_VERSION;
  const appToken = process.env.NIGHTAUTH_APP_TOKEN || APP_TOKEN;

  clearScreen();
  renderBanner(appName, "", false);

  if (!appName) {
    appName = await ask("Enter App Name: ");
  }
  if (!apiKey) {
    apiKey = await ask("Enter API Key: ");
  }

  try {
    nightAuth = new Api(appName, apiKey, appVersion, appToken);
  } catch (err) {
    printErr("Initialization Error", err && err.message ? err.message : String(err));
    await ask("Press Enter to exit...");
    process.exit(1);
  }
  registerRealtimeEventHandlers();
  await performHandshake(appName);

  if (!(await handleAuthenticationFlow())) {
    nightAuth.close();
    process.exit(0);
  }

  const hwid = SecurityProtections.getHardwareId();
  clearScreen();
  renderBanner(appName, hwid, true);
  renderUserProfile();

  startHeartbeat();
  await runApplicationFeaturesMenu();
  nightAuth.close();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  await ask("Press Enter to exit...");
  process.exit(1);
});
