# NightAuth Node.js SDK — Star us on GitHub ⭐

Official **NightAuth** Node.js SDK & Reference Interactive Console CLI Suite. Protect your Node.js, Electron, and JavaScript applications against piracy, reverse engineering, and tampering with cloud licensing, HWID locking, realtime events, encrypted cloud variables, and in-memory execution in minutes.

Official Portal: [https://nightauth.org](https://nightauth.org)  
Documentation: [https://nightauth.org/docs](https://nightauth.org/docs)  
Technical Architecture Benchmark: [NightAuth vs KeyAuth vs Auth.gg](https://nightauth.org/blog/nightauth-vs-keyauth-authgg-comparison)

---

**Languages / Idiomas / Langues / Sprachen:**  
[English](README.md) • [Español](lang/es.md) • [Français](lang/fr.md) • [Deutsch](lang/de.md) • [Italiano](lang/it.md) • [Português](lang/pt.md) • [Русский](lang/ru.md) • [Türkçe](lang/tr.md) • [Polski](lang/pl.md) • [中文](lang/zh.md)

---

> [!NOTE]
> ### 📺 Video Tutorials & System Setup Guides
> Official video tutorials and detailed step-by-step guides explaining how to configure applications, plans, subscriptions, cloud variables, webhooks, and licenses in the NightAuth Dashboard **will be published soon** on our official portal and YouTube channel.

---

## 📸 Screenshots

### Console Application (Interactive Terminal CLI)

| Terminal Login Screen | Interactive Console Dashboard |
| :---: | :---: |
| ![NightAuth Console Login](image/console.png) | ![NightAuth Console Dashboard](image/console-dashboard.png) |

---

## 🛡️ Recommended Security Practices

* **Code Obfuscation & Minification:** JavaScript code can be easily reverse-engineered or extracted from compiled packages. For production distribution, obfuscate your bundled code using **javascript-obfuscator** with control-flow flattening, dead code injection, and string encryption.
* **Native Single-Binary Packaging:** Package your Node.js application into a single native executable binary using **pkg**, **ncc**, or Node.js Single Executable Applications (**SEA**).
* **Enterprise Binary Protection:** Protect the compiled native executable using commercial code virtualizers such as **VMProtect**, **Themida**, or **Enigma Protector**.
* **Memory Buffer Sanitization & Anti-Debugging:** Clear sensitive credentials, decrypted tokens, and cryptographic keys immediately after use by zeroing buffers (`fileBuffer.fill(0)`). NightAuth includes built-in protection against monitoring tools, network interceptors, and debuggers (`HTTPDebugger`, `CheatEngine`, `x64dbg`, `Wireshark`, etc.). Keep these security checks active in production releases.
* **In-Memory Secure File Execution:** When retrieving protected binary payloads or scripts with `NightAuthApp.downloadFile()`, **never write bytes to physical storage or disk**. Execute the buffer directly in memory (e.g. child_process pipe, native addon, or reflective memory loading) and zero out the memory buffers immediately after execution.

---

## 📦 Requirements & Installation

Requires **Node.js >= 18.0.0**.

```bash
npm install
```

---

## ⚙️ Configuration & Initialization

Define your application credentials from the **Manage Apps** tab of the NightAuth dashboard:

```javascript
const { Api } = require("./sdk/nightauth.js");

const NightAuthApp = new Api(
  /* name    */ "",
  /* apikey  */ "",
  /* version */ "1.0",
  /* token   */ null
);
```

### Initialize Cryptographic Handshake (`init`)

You must call `init()` prior to executing any other SDK functions. This establishes an ephemeral Diffie-Hellman (X25519) key exchange and an encrypted session:

```javascript
await NightAuthApp.init();

if (!NightAuthApp.response.success) {
  console.error(`Initialization failed: ${NightAuthApp.response.message}`);
  process.exit(1);
}
```

---

## 🚀 SDK Usage Guide

### 1. Check Session Validation & Blacklist Status

```javascript
// Validate active session status with the server
await NightAuthApp.check();
if (!NightAuthApp.response.success) {
  console.log(`Session invalid: ${NightAuthApp.response.message}`);
}

// Check if client HWID or IP address is blacklisted
const black = await NightAuthApp.checkBlacklist();
if (black.blacklisted) {
  console.error("Access Denied: Machine or IP is blacklisted.");
  process.exit(1);
}
```

### 2. Login with Username & Password (and 2FA)

```javascript
const loggedIn = await NightAuthApp.login(username, password, totpCode);

if (loggedIn) {
  console.log(`Welcome back, ${NightAuthApp.user.username}!`);
} else {
  console.error(`Login failed: ${NightAuthApp.response.message}`);
}
```

### 3. Register with License Key

```javascript
const registered = await NightAuthApp.register(username, password, licenseKey, email);

if (registered) {
  console.log(`Registration successful: ${NightAuthApp.user.username}!`);
} else {
  console.error(`Registration failed: ${NightAuthApp.response.message}`);
}
```

### 4. Authenticate with License Key Only (and 2FA)

```javascript
// Authenticate using license key alone or with 2FA TOTP code
const valid = await NightAuthApp.license(licenseKey, totpCode);

if (valid) {
  console.log(`License valid! Logged in as: ${NightAuthApp.user.username}`);
} else {
  console.error(`License authentication failed: ${NightAuthApp.response.message}`);
}
```

### 5. Upgrade Account / Claim License Key

```javascript
const upgraded = await NightAuthApp.upgrade(username, licenseKey);

if (upgraded) {
  console.log(`Account upgraded: ${NightAuthApp.response.message}`);
  await NightAuthApp.check(); // Refresh session subscriptions
} else {
  console.error(`Upgrade failed: ${NightAuthApp.response.message}`);
}
```

### 6. Reset Hardware ID (HWID Lock)

```javascript
const reset = await NightAuthApp.resetHwid(username, password, totpCode);

if (reset) {
  console.log("Hardware fingerprint reset successfully.");
} else {
  console.error(`HWID reset failed: ${NightAuthApp.response.message}`);
}
```

### 7. Forgot Password / Account Recovery

```javascript
// Step 1: Request recovery email link
await NightAuthApp.forgotPassword("user@example.com");

// Step 2: Complete reset using token received via email
const updated = await NightAuthApp.resetPassword(resetToken, newPassword);
if (updated) {
  console.log("Password updated successfully.");
}
```

### 8. User Profile Data (`NightAuthApp.user`)

```javascript
const u = NightAuthApp.user;
console.log(`Username: ${u.username}`);
console.log(`Email: ${u.email}`);
console.log(`HWID: ${u.hwid}`);
console.log(`Client IP: ${u.ip}`);
console.log(`Account Status: ${u.status}`);
console.log(`Created At: ${u.createdAt}`);
console.log(`Last Login: ${u.lastLoginAt}`);

for (const sub of u.subscriptions) {
  console.log(`Tier: ${sub.subscription} | Key: ${sub.key} | Expires: ${sub.expiry} | Seconds Left: ${sub.timeLeft}`);
}
```

### 9. Cloud Variables (Global)

```javascript
const motd = await NightAuthApp.getGlobalVar("server_motd");
console.log(`Announcement: ${motd}`);
```

### 10. User Variables

```javascript
// Retrieve a per-user encrypted variable
const theme = await NightAuthApp.getUserVar("custom_theme");

// Set or update a per-user variable
await NightAuthApp.setUserVar("custom_theme", "dark_obsidian");

// Fetch all per-user variables
const varsLoaded = await NightAuthApp.getUserVariables();
if (varsLoaded) {
  console.log("User variables loaded successfully.");
}
```

### 11. Application Audit Logs

```javascript
await NightAuthApp.log("User initialized workflow #42");
```

### 12. Ban User & Blacklist Machine

```javascript
await NightAuthApp.ban("Security tampering detected");
```

### 13. Server-Sided Webhooks & File Upload

```javascript
// 1. Trigger JSON payload webhook
const payload = { event: "user_action", score: 42 };
const responseText = await NightAuthApp.triggerWebhook("webhook-id", payload);
if (responseText !== null) {
  console.log(`Webhook response: ${responseText}`);
}

// 2. Upload file securely via server-side webhook proxy
const reportBuffer = Buffer.from("Audit dump content...", "utf8");
const uploadResult = await NightAuthApp.triggerWebhook("webhook-id", payload, null, null, reportBuffer, "audit.log");
```

### 14. Secure In-Memory File Download

```javascript
const fileBuffer = await NightAuthApp.downloadFile("asset_file_id");

if (fileBuffer) {
  console.log(`File downloaded securely into memory (${fileBuffer.length} bytes).`);
  // Process buffer directly in memory without saving to physical disk
  // Wipe buffer from memory immediately after execution:
  fileBuffer.fill(0);
} else {
  console.error(`Download failed: ${NightAuthApp.response.message}`);
}
```

### 15. Realtime Chat Channels

```javascript
// Fetch recent message history
const messages = await NightAuthApp.getChatMessages("general", null, true);
for (const msg of messages) {
  console.log(`[${msg.timestamp}] ${msg.author}: ${msg.message}`);
}

// Send a message to a channel
await NightAuthApp.sendChatMessage("Hello from Node.js SDK!", "general");
```

### 16. Realtime Event Streaming (Server-Sent Events)

```javascript
// Triggered if the admin terminates or invalidates the session
NightAuthApp.onSessionInvalidated = (reason) => {
  console.error(`[SECURITY ALERT] Session Invalidated: ${reason}`);
  process.exit(1);
};

// Triggered if the application is banned
NightAuthApp.onAppBanned = (reason) => {
  console.error(`[CRITICAL BAN] Application Banned: ${reason}`);
  process.exit(1);
};

// Triggered if application status changes (e.g. maintenance mode)
NightAuthApp.onAppStatusChanged = (status) => {
  console.warn(`[STATUS CHANGE] App is now: ${status}`);
};

// Triggered when an update is published
NightAuthApp.onVersionUpdated = (newVersion) => {
  console.log(`[UPDATE] New version available: v${newVersion}`);
};

// Triggered on incoming chat messages
NightAuthApp.onChatMessageReceived = (msg, room) => {
  console.log(`[CHAT #${room}] ${msg.author}: ${msg.message}`);
};

// Start listening for real-time events
NightAuthApp.startRealtimeEventListener();
```

### 17. Two-Factor Authentication (2FA)

```javascript
// Step 1: Initialize TOTP setup
const setupData = await NightAuthApp.setup2FA();
if (setupData) {
  console.log(`Secret Key: ${setupData.secret}`);
  console.log(`Authenticator URI: ${setupData.uri}`);

  // Step 2: Confirm 2FA with 6-digit code from authenticator app
  const confirmData = await NightAuthApp.confirm2FA("123456");
  if (confirmData) {
    console.log("2FA enabled successfully! Backup Codes:");
    for (const code of confirmData.backupCodes) {
      console.log(` - ${code}`);
    }
  }
}

// Step 3: Disable 2FA if needed
const disabled = await NightAuthApp.disable2FA(password, "123456");
```

### 18. Session Lifecycle & Logout

```javascript
// Keep session active with periodic ping
await NightAuthApp.heartbeat();

// Revoke session on cloud and close client
await NightAuthApp.logout();
NightAuthApp.close();
```

### 19. Change Account Username

```javascript
const changed = await NightAuthApp.changeUsername("new_alias", "CurrentPassword123!");

if (changed) {
  console.log(`Username changed successfully to: ${NightAuthApp.user.username}`);
} else {
  console.error(`Change username failed: ${NightAuthApp.response.message}`);
}
```

### 20. Application Telemetry & Online Users

```javascript
// Retrieve application usage statistics
const stats = await NightAuthApp.getStats();
if (stats) {
  console.log(`Users: ${stats.activeUsers} active / ${stats.totalUsers} total`);
  console.log(`Licenses: ${stats.usedLicenses} used / ${stats.totalLicenses} total`);
}

// Fetch list of currently online usernames
const onlineUsers = await NightAuthApp.getOnlineUsers();
console.log(`Online users (${onlineUsers.length}): ${onlineUsers.join(", ")}`);
```

### 21. File Integrity & Binary Hash Verification

```javascript
const fileSha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const valid = await NightAuthApp.verifyFileHash(fileSha256);

if (valid) {
  console.log("Binary matches registered server checksum.");
} else {
  console.error("Integrity verification failed!");
}
```

### 22. Hardware Fingerprinting & SecurityProtections (`SecurityProtections`)

```javascript
const { SecurityProtections } = require("./sdk/nightauth.js");

// Retrieve stable hardware fingerprint identifier
const hwid = SecurityProtections.getHardwareId();
console.log(`Device HWID: ${hwid}`);

// Run anti-debugging and proxy security checks
SecurityProtections.runSecurityChecks();
```

### 23. Standalone Options, Request Timeout & Custom Server Keys

```javascript
// Initialize with custom API endpoint
const customAuth = new Api(
  "Custom App",
  "na_custom_key",
  "1.0",
  null,
  "https://nightauth.org/api/v1"
);

// Configure HTTP request timeout (milliseconds)
customAuth.requestTimeoutMs = 15000;

// Pin server signing public key (hex)
customAuth.signingPin = "cdb2285db481666ce40003aadb874c8751dbeb9a0672a37f740dfe881ecdc742";
```

### 24. Signed Self-Updates

```javascript
const { SignedUpdateInstaller } = require("./sdk/nightauth.js");

// Download and verify Ed25519 digitally signed update manifest with monotonic sequence protection
const downloadedPath = await SignedUpdateInstaller.download(
  "https://releases.example.com/manifest.json",
  "cdb2285db481666ce40003aadb874c8751dbeb9a0672a37f740dfe881ecdc742",
  "SDK Example App",
  "updates/app-v2.0.js"
);
console.log(`Verified update downloaded to: ${downloadedPath}`);
```

---

## 🖥️ Run the Interactive Console Client

```bash
# Configure application environment variables (optional)
export NIGHTAUTH_APP_NAME="YourApp"
export NIGHTAUTH_API_KEY="na_live_xxx"

# Run interactive console
npm run console
```

---

---

## 🆚 Why NightAuth? (KeyAuth & Auth.gg Comparison)

| Feature | NightAuth | KeyAuth | Auth.gg |
| :--- | :---: | :---: | :---: |
| **Cryptography** | **End-to-End Curve25519 (X25519) + ChaCha20-Poly1305** | Static AES-CBC (Vulnerable to MITM & Proxy Interception) | Legacy HTTPS / Plain JSON |
| **Hardware ID (HWID)** | **Multi-Component Cryptographic Hash (Anti-Spoofing)** | Raw WMI Strings (Trivially Spoofed) | Simple Registry / MAC |
| **Edge Network Latency** | **< 35ms Global Anycast Edge Network** | Single-Origin VPS (Frequent Network Outages) | Unmaintained / High Latency |
| **Reseller System & Bots** | **Built-in Multi-Tier Credit Balances + Discord & Telegram Bots** | Manual API / Third-Party Scripts | Incomplete / Deprecated |
| **In-Memory Streaming** | **Zero-Disk Decryption with Direct Memory Execution & Buffer Wiping** | Disk Writes Required | Not Supported |
| **Internationalization** | **10 Languages Supported Out of the Box across Documentation & SDKs** | English Only | English Only |

Read the full architectural benchmark: [NightAuth vs KeyAuth vs Auth.gg](https://nightauth.org/blog/nightauth-vs-keyauth-authgg-comparison)

---

## 📄 License

This project is licensed under the **Elastic License 2.0**.

* You may not provide the software to third parties as a hosted or managed service.
* You may not move, change, disable, or circumvent the license key functionality.
* You may not alter, remove, or obscure any licensing or copyright notices.

See the [LICENSE](LICENSE) file for the full legal text.

---

**Languages / Idiomas / Langues / Sprachen:**  
[English](README.md) • [Español](lang/es.md) • [Français](lang/fr.md) • [Deutsch](lang/de.md) • [Italiano](lang/it.md) • [Português](lang/pt.md) • [Русский](lang/ru.md) • [Türkçe](lang/tr.md) • [Polski](lang/pl.md) • [中文](lang/zh.md)
