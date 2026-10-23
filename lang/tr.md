# NightAuth Node.js SDK — GitHub'da Bize Yıldız Verin ⭐

Resmi **NightAuth** Node.js SDK ve Referans Etkileşimli Konsol CLI Paketi. Bulut lisanslama, HWID kilitleme, gerçek zamanlı olaylar, şifrelenmiş bulut değişkenleri ve bellek içi yürütme ile Node.js, Electron ve JavaScript uygulamalarınızı dakikalar içinde korsanlığa, tersine mühendisliğe ve kurcalamaya karşı koruyun.

Resmi Portal: [https://nightauth.org](https://nightauth.org)

---

**Languages / Idiomas / Langues / Sprachen:**  
[English](../README.md) • [Español](es.md) • [Français](fr.md) • [Deutsch](de.md) • [Italiano](it.md) • [Português](pt.md) • [Русский](ru.md) • [Türkçe](tr.md) • [Polski](pl.md) • [中文](zh.md)

---

> [!NOTE]
> ### 📺 Video Eğitimleri ve Sistem Kurulum Kılavuzları
> NightAuth Kontrol Panelinde uygulamaların, planların, aboneliklerin, bulut değişkenlerinin, webhook'ların ve lisansların nasıl yapılandırılacağını açıklayan resmi video eğitimleri ve ayrıntılı adım adım kılavuzlar **yakında** resmi portalımızda ve YouTube kanalımızda yayınlanacaktır.

---

## 📸 Ekran Görüntüleri

### Konsol Uygulaması (Etkileşimli Terminal CLI)

| Terminal Giriş Ekranı | Etkileşimli Konsol Kontrol Paneli |
| :---: | :---: |
| ![NightAuth Console Login](../image/console.png) | ![NightAuth Console Dashboard](../image/console-dashboard.png) |

---

## 🛡️ Önerilen Güvenlik Uygulamaları

* **Kod Karartma ve Küçültme:** JavaScript kodları kolayca ayıklanabilir ve tersine mühendisliğe maruz kalabilir. Üretim dağıtımları için paketlerinizi kontrol akışı düzleştirme, ölü kod enjeksiyonu ve dize şifreleme uygulayan **javascript-obfuscator** ile karartın.
* **Yerel Tek İkili Paketleme:** Node.js uygulamanızı **pkg**, **ncc** veya yerel Node.js Single Executable Applications (**SEA**) kullanarak tek bir yerel çalıştırılabilir ikili dosyaya paketleyin.
* **Kurumsal Düzeyde İkili Koruma:** Ortaya çıkan yerel çalıştırılabilir dosyayı **VMProtect**, **Themida** veya **Enigma Protector** gibi ticari kod sanallaştırıcılarıyla koruyun.
* **Bellek Arabelleklerini Temizleme & Anti-Hata Ayıklama:** Hassas kimlik bilgilerini ve kriptografik anahtarları kullanımdan hemen sonra arabellekleri sıfırlayarak silin (`fileBuffer.fill(0)`). NightAuth, izleme araçlarına ve hata ayıklayıcılara (`HTTPDebugger`, `CheatEngine`, `x64dbg`, `Wireshark` vb.) karşı yerleşik koruma içerir. Bu güvenlik kontrollerini üretimde aktif tutun.
* **Bellek İçi Güvenli Dosya Yürütme:** `NightAuthApp.downloadFile()` ile korunan modülleri veya komut dosyalarını indirirken **baytları asla fiziksel diske yazmayın**. Arabelleği doğrudan RAM'de yürütün ve geçici arabellekleri anında temizleyin.

---

## 📦 Gereksinimler & Kurulum

**Node.js >= 18.0.0** gerektirir.

```bash
npm install
```

---

## ⚙️ Yapılandırma & Başlatma

Uygulama kimlik bilgilerinizi NightAuth kontrol panelinin **Manage Apps** sekmesinden tanımlayın:

```javascript
const { Api } = require("./sdk/nightauth.js");

const NightAuthApp = new Api(
  /* name    */ "",
  /* apikey  */ "",
  /* version */ "1.0",
  /* token   */ null
);
```

### Kriptografik El Sıkışmayı Başlatma (`init`)

Diğer SDK işlevlerini yürütmeden önce `init()` işlevini çağırmalısınız. Bu, kısa ömürlü bir Diffie-Hellman (X25519) anahtar değişimi ve şifrelenmiş bir oturum kurar:

```javascript
await NightAuthApp.init();

if (!NightAuthApp.response.success) {
  console.error(`Initialization failed: ${NightAuthApp.response.message}`);
  process.exit(1);
}
```

---

## 🚀 SDK Kullanım Kılavuzu

### 1. Oturum Doğrulama ve Kara Liste Durumu Kontrolü

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

### 2. Kullanıcı Adı ve Şifre ile Giriş (ve 2FA)

```javascript
const loggedIn = await NightAuthApp.login(username, password, totpCode);

if (loggedIn) {
  console.log(`Welcome back, ${NightAuthApp.user.username}!`);
} else {
  console.error(`Login failed: ${NightAuthApp.response.message}`);
}
```

### 3. Lisans Anahtarı ile Kayıt Olma

```javascript
const registered = await NightAuthApp.register(username, password, licenseKey, email);

if (registered) {
  console.log(`Registration successful: ${NightAuthApp.user.username}!`);
} else {
  console.error(`Registration failed: ${NightAuthApp.response.message}`);
}
```

### 4. Yalnızca Lisans Anahtarı ile Kimlik Doğrulama (ve 2FA)

```javascript
// Authenticate using license key alone or with 2FA TOTP code
const valid = await NightAuthApp.license(licenseKey, totpCode);

if (valid) {
  console.log(`License valid! Logged in as: ${NightAuthApp.user.username}`);
} else {
  console.error(`License authentication failed: ${NightAuthApp.response.message}`);
}
```

### 5. Hesabı Yükselt / Lisans Anahtarı Kullan

```javascript
const upgraded = await NightAuthApp.upgrade(username, licenseKey);

if (upgraded) {
  console.log(`Account upgraded: ${NightAuthApp.response.message}`);
  await NightAuthApp.check(); // Refresh session subscriptions
} else {
  console.error(`Upgrade failed: ${NightAuthApp.response.message}`);
}
```

### 6. Donanım Kimliğini Sıfırla (HWID Kilidi)

```javascript
const reset = await NightAuthApp.resetHwid(username, password, totpCode);

if (reset) {
  console.log("Hardware fingerprint reset successfully.");
} else {
  console.error(`HWID reset failed: ${NightAuthApp.response.message}`);
}
```

### 7. Şifremi Unuttum / Hesap Kurtarma

```javascript
// Step 1: Request recovery email link
await NightAuthApp.forgotPassword("user@example.com");

// Step 2: Complete reset using token received via email
const updated = await NightAuthApp.resetPassword(resetToken, newPassword);
if (updated) {
  console.log("Password updated successfully.");
}
```

### 8. Kullanıcı Profil Verileri (`NightAuthApp.user`)

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

### 9. Bulut Değişkenleri (Genel)

```javascript
const motd = await NightAuthApp.getGlobalVar("server_motd");
console.log(`Announcement: ${motd}`);
```

### 10. Kullanıcı Değişkenleri

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

### 11. Uygulama Denetim Günlükleri

```javascript
await NightAuthApp.log("User initialized workflow #42");
```

### 12. Kullanıcıyı Yasakla ve Cihazı Kara Listeye Al

```javascript
await NightAuthApp.ban("Security tampering detected");
```

### 13. Sunucu Taraflı Webhook'lar ve Dosya Yükleme

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

### 14. Bellek İçi Güvenli Dosya İndirme

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

### 15. Gerçek Zamanlı Sohbet Kanalları

```javascript
// Fetch recent message history
const messages = await NightAuthApp.getChatMessages("general", null, true);
for (const msg of messages) {
  console.log(`[${msg.timestamp}] ${msg.author}: ${msg.message}`);
}

// Send a message to a channel
await NightAuthApp.sendChatMessage("Hello from Node.js SDK!", "general");
```

### 16. Gerçek Zamanlı Olay Akışı (Server-Sent Events)

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

### 17. İki Faktörlü Kimlik Doğrulama (2FA)

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

### 18. Oturum Yaşam Döngüsü ve Güvenli Çıkış

```javascript
// Keep session active with periodic ping
await NightAuthApp.heartbeat();

// Revoke session on cloud and close client
await NightAuthApp.logout();
NightAuthApp.close();
```

### 19. Hesap Kullanıcı Adını Değiştirme

```javascript
const changed = await NightAuthApp.changeUsername("new_alias", "CurrentPassword123!");

if (changed) {
  console.log(`Username changed successfully to: ${NightAuthApp.user.username}`);
} else {
  console.error(`Change username failed: ${NightAuthApp.response.message}`);
}
```

### 20. Uygulama Telemetrisi ve Çevrimiçi Kullanıcılar

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

### 21. Dosya Bütünlüğü ve Sağlama (Hash) Doğrulaması

```javascript
const fileSha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const valid = await NightAuthApp.verifyFileHash(fileSha256);

if (valid) {
  console.log("Binary matches registered server checksum.");
} else {
  console.error("Integrity verification failed!");
}
```

### 22. Donanım Parmak İzi & Güvenlik (`SecurityProtections`)

```javascript
const { SecurityProtections } = require("./sdk/nightauth.js");

// Retrieve stable hardware fingerprint identifier
const hwid = SecurityProtections.getHardwareId();
console.log(`Device HWID: ${hwid}`);

// Run anti-debugging and proxy security checks
SecurityProtections.runSecurityChecks();
```

### 23. Bağımsız Seçenekler, Zaman Aşımı ve Özel Sunucu Anahtarları

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

### 24. İmzalı Otomatik Güncellemeler

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

## 🖥️ Etkileşimli Konsol İstemcisini Çalıştırma

```bash
# Configure application environment variables (optional)
export NIGHTAUTH_APP_NAME="YourApp"
export NIGHTAUTH_API_KEY="na_live_xxx"

# Run interactive console
npm run console
```

---

## 📄 Lisans

Bu proje **Elastic License 2.0** kapsamında lisanslanmıştır.

* Yazılımı üçüncü taraflara barındırılan veya yönetilen bir hizmet olarak sağlayamazsınız.
* Lisans anahtarı işlevselliğini taşıyamaz, değiştiremez, devre dışı bırakamaz veya atlatamazsınız.
* Hiçbir lisans veya telif hakkı bildirimini değiştiremez, kaldıramaz veya gizleyemezsiniz.

Tam yasal metin için [LICENSE](../LICENSE) dosyasına bakın.

---

**Languages / Idiomas / Langues / Sprachen:**  
[English](../README.md) • [Español](es.md) • [Français](fr.md) • [Deutsch](de.md) • [Italiano](it.md) • [Português](pt.md) • [Русский](ru.md) • [Türkçe](tr.md) • [Polski](pl.md) • [中文](zh.md)
