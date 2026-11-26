// Explicit site and path allowlist. Other projects on the same Pages host do
// not gain a control channel. No remote configuration or broad HTTPS grants.
function controllerSite(address) {
  try {
    const url = new URL(address);
    if (url.username || url.password) return null;
    if (
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(url.hostname) &&
      ["/", "/index.html"].includes(url.pathname)
    )
      return url.origin;
    if (
      url.origin === "https://blizzard-labs.github.io" &&
      ["/thalis-rehab-game/", "/thalis-rehab-game/index.html"].includes(
        url.pathname,
      )
    )
      return "https://blizzard-labs.github.io/thalis-rehab-game";
  } catch {
    /* Not a controller site. */
  }
  return null;
}
