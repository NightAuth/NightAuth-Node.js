# NightAuth Node.js SDK — Daj nam gwiazdkę na GitHubie ⭐

Oficjalny pakiet SDK **NightAuth** dla środowiska Node.js oraz zestaw referencyjnego interaktywnego interfejsu konsolowego CLI. Chroń swoje aplikacje Node.js, Electron i JavaScript przed piractwem, inżynierią wsteczną i manipulacjami dzięki licencjonowaniu w chmurze, blokadzie HWID, zdarzeniom w czasie rzeczywistym, szyfrowanym zmiennym chmurowym i bezpiecznemu wykonywaniu w pamięci RAM w kilka minut.

Oficjalny Portal: [https://nightauth.org](https://nightauth.org)

---

**Languages / Idiomas / Langues / Sprachen:**  
[English](../README.md) • [Español](es.md) • [Français](fr.md) • [Deutsch](de.md) • [Italiano](it.md) • [Português](pt.md) • [Русский](ru.md) • [Türkçe](tr.md) • [Polski](pl.md) • [中文](zh.md)

---

> [!NOTE]
> ### 📺 Samouczki Wideo i Poradniki Konfiguracji
> Oficjalne poradniki wideo i szczegółowe instrukcje krok po kroku dotyczące konfiguracji aplikacji, planów, subskrypcji, zmiennych chmurowych, webhooków i licencji w panelu NightAuth **zostaną wkrótce opublikowane** na naszym portalu i kanale YouTube.

---

## 📸 Zrzuty Ekranu

### Aplikacja Konsolowa (Interaktywne CLI Terminala)

| Ekran Logowania w Terminalu | Interaktywny Panel Konsolowy |
| :---: | :---: |
| ![NightAuth Console Login](../image/console.png) | ![NightAuth Console Dashboard](../image/console-dashboard.png) |

---

## 🛡️ Zalecane Praktyki Bezpieczeństwa

* **Zaciemnianie i Minifikacja Kodu:** Kod JavaScript można łatwo poddać inżynierii wstecznej. W środowiskach produkcyjnych zabezpieczaj swoje skompilowane pakiety za pomocą **javascript-obfuscator** ze spłaszczaniem przepływu sterowania, wstrzykiwaniem martwego kodu i szyfrowaniem łańcuchów znaków.
* **Natywne Pakowanie do Pojedynczego Pliku Binarnego:** Spakuj swoją aplikację Node.js w jeden natywny plik wykonywalny za pomocą narzędzi **pkg**, **ncc** lub natywnych Node.js Single Executable Applications (**SEA**).
* **Ochrona Binarna Klasy Enterprise:** Zabezpiecz wygenerowany plik wykonywalny za pomocą komercyjnych wirtualizatorów kodu, takich jak **VMProtect**, **Themida** lub **Enigma Protector**.
* **Czyszczenie Buforów w Pamięci RAM i Ochrona Przed Debugowaniem:** Natychmiast po użyciu usuwaj poufne dane i klucze kryptograficzne, zerując bufory (`fileBuffer.fill(0)`). NightAuth zawiera wbudowaną ochronę przed narzędziami analizującymi ruch i debugerami (`HTTPDebugger`, `CheatEngine`, `x64dbg`, `Wireshark` itp.). Utrzymuj te mechanizmy aktywne w środowiskach produkcyjnych.
* **Bezpieczne Wykonywanie Plików w Pamięci RAM:** Pobierając zabezpieczone ładunki lub skrypty za pomocą `NightAuthApp.downloadFile()`, **nigdy nie zapisuj bajtów na dysku fizycznym**. Wykonuj bufor bezpośrednio w pamięci i natychmiast czyść tymczasowe bufory.

---

## 📦 Wymagania & Instalacja

Wymaga **Node.js >= 18.0.0**.

```bash
npm install
```

---

## ⚙️ Konfiguracja & Inicjalizacja

Zdefiniuj dane uwierzytelniające aplikacji w zakładce **Manage Apps** panelu kontrolnego NightAuth:

```javascript
const { Api } = require("./sdk/nightauth.js");

const NightAuthApp = new Api(
  /* name    */ "",
  /* apikey  */ "",
  /* version */ "1.0",
  /* token   */ null
);
```

### Inicjalizacja Uzgadniania Kryptograficznego (`init`)

Musisz wywołać `init()` przed wykonaniem jakichkolwiek innych funkcji SDK. Ustanawia to ulotną wymianę kluczy Diffiego-Hellmana (X25519) i zaszyfrowaną sesję:

```javascript
await NightAuthApp.init();

if (!NightAuthApp.response.success) {
  console.error(`Initialization failed: ${NightAuthApp.response.message}`);
  process.exit(1);
}
```

---

## 🚀 Przewodnik po SDK

### 1. Walidacja Sesji i Sprawdzanie Czarnej Listy

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

### 2. Logowanie za pomocą Nazwy Użytkownika i Hasła (oraz 2FA)

```javascript
const loggedIn = await NightAuthApp.login(username, password, totpCode);

if (loggedIn) {
  console.log(`Welcome back, ${NightAuthApp.user.username}!`);
} else {
  console.error(`Login failed: ${NightAuthApp.response.message}`);
}
```

### 3. Rejestracja z Kluczem Licencyjnym

```javascript
const registered = await NightAuthApp.register(username, password, licenseKey, email);

if (registered) {
  console.log(`Registration successful: ${NightAuthApp.user.username}!`);
} else {
  console.error(`Registration failed: ${NightAuthApp.response.message}`);
}
```

### 4. Uwierzytelnianie Tylko za Pomocą Klucza Licencji (oraz 2FA)

```javascript
// Authenticate using license key alone or with 2FA TOTP code
const valid = await NightAuthApp.license(licenseKey, totpCode);

if (valid) {
  console.log(`License valid! Logged in as: ${NightAuthApp.user.username}`);
} else {
  console.error(`License authentication failed: ${NightAuthApp.response.message}`);
}
```

### 5. Uaktualnij Konto / Odbierz Klucz Licencyjny

```javascript
const upgraded = await NightAuthApp.upgrade(username, licenseKey);

if (upgraded) {
  console.log(`Account upgraded: ${NightAuthApp.response.message}`);
  await NightAuthApp.check(); // Refresh session subscriptions
} else {
  console.error(`Upgrade failed: ${NightAuthApp.response.message}`);
}
```

### 6. Zresetuj ID Sprzętu (Blokada HWID)

```javascript
const reset = await NightAuthApp.resetHwid(username, password, totpCode);

if (reset) {
  console.log("Hardware fingerprint reset successfully.");
} else {
  console.error(`HWID reset failed: ${NightAuthApp.response.message}`);
}
```

### 7. Odzyskiwanie Konta / Zapomniane Hasło

```javascript
// Step 1: Request recovery email link
await NightAuthApp.forgotPassword("user@example.com");

// Step 2: Complete reset using token received via email
const updated = await NightAuthApp.resetPassword(resetToken, newPassword);
if (updated) {
  console.log("Password updated successfully.");
}
```

### 8. Dane Profilu Użytkownika (`NightAuthApp.user`)

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

### 9. Zmienne Chmurowe (Globalne)

```javascript
const motd = await NightAuthApp.getGlobalVar("server_motd");
console.log(`Announcement: ${motd}`);
```

### 10. Zmienne Użytkownika

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

### 11. Dzienniki Audytu Aplikacji

```javascript
await NightAuthApp.log("User initialized workflow #42");
```

### 12. Zablokuj Użytkownika i Maszynę na Czarnej Liście

```javascript
await NightAuthApp.ban("Security tampering detected");
```

### 13. Webhooki Serwerowe i Przesyłanie Plików

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

### 14. Bezpieczne Pobieranie Plików do Pamięci RAM

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

### 15. Kanały Czatu w Czasie Rzeczywistym

```javascript
// Fetch recent message history
const messages = await NightAuthApp.getChatMessages("general", null, true);
for (const msg of messages) {
  console.log(`[${msg.timestamp}] ${msg.author}: ${msg.message}`);
}

// Send a message to a channel
await NightAuthApp.sendChatMessage("Hello from Node.js SDK!", "general");
```

### 16. Strumieniowanie Zdarzeń w Czasie Rzeczywistym (SSE)

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

### 17. Uwierzytelnianie Dwuetapowe (2FA)

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

### 18. Cykl Życia Sesji i Wylogowanie

```javascript
// Keep session active with periodic ping
await NightAuthApp.heartbeat();

// Revoke session on cloud and close client
await NightAuthApp.logout();
NightAuthApp.close();
```

### 19. Zmiana Nazwy Użytkownika Konta

```javascript
const changed = await NightAuthApp.changeUsername("new_alias", "CurrentPassword123!");

if (changed) {
  console.log(`Username changed successfully to: ${NightAuthApp.user.username}`);
} else {
  console.error(`Change username failed: ${NightAuthApp.response.message}`);
}
```

### 20. Telemetria Aplikacji i Użytkownicy Online

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

### 21. Integralność Plików i Weryfikacja Skrótu Hash

```javascript
const fileSha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const valid = await NightAuthApp.verifyFileHash(fileSha256);

if (valid) {
  console.log("Binary matches registered server checksum.");
} else {
  console.error("Integrity verification failed!");
}
```

### 22. Identyfikator Sprzętowy & Bezpieczeństwo (`SecurityProtections`)

```javascript
const { SecurityProtections } = require("./sdk/nightauth.js");

// Retrieve stable hardware fingerprint identifier
const hwid = SecurityProtections.getHardwareId();
console.log(`Device HWID: ${hwid}`);

// Run anti-debugging and proxy security checks
SecurityProtections.runSecurityChecks();
```

### 23. Zaawansowane Opcje, Limit Czasu i Własne Klucze Serwera

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

### 24. Kryptograficznie Podpisane Aktualizacje

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

## 🖥️ Uruchamianie Interaktywnego Klienta Konsolowego

```bash
# Configure application environment variables (optional)
export NIGHTAUTH_APP_NAME="YourApp"
export NIGHTAUTH_API_KEY="na_live_xxx"

# Run interactive console
npm run console
```

---

## 📄 Licencja

Ten projekt jest licencjonowany na warunkach **Elastic License 2.0**.

* Nie możesz udostępniać oprogramowania stronom trzecim jako usługi hostowanej lub zarządzanej.
* Nie możesz modyfikować, przenosić, wyłączać ani omijać funkcjonalności kluczy licencyjnych.
* Nie możesz zmieniać, usuwać ani ukrywać jakichkolwiek informacji o licencji lub prawach autorskich.

Pełny tekst prawny znajduje się w pliku [LICENSE](../LICENSE).

---

**Languages / Idiomas / Langues / Sprachen:**  
[English](../README.md) • [Español](es.md) • [Français](fr.md) • [Deutsch](de.md) • [Italiano](it.md) • [Português](pt.md) • [Русский](ru.md) • [Türkçe](tr.md) • [Polski](pl.md) • [中文](zh.md)
