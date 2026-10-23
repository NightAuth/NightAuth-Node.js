// Browser-facing example. The same-origin backend owns the NightAuth API key and
// calls the server-side SDK; this file never embeds application credentials.
const form = document.querySelector("#login-form");
const status = document.querySelector("#status");

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const payload = Object.fromEntries(data.entries());
  status.textContent = "Signing in…";
  try {
    const response = await fetch("/api/nightauth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok || result.success !== true) throw new Error(result.message || "Sign in failed.");
    status.textContent = `Welcome, ${result.user?.username || "user"}.`;
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Sign in failed.";
  }
});
