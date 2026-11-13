// The bridge is present only on loopback. It never reads camera or EEG data.
let port;
const allowed = () => ["#library", "#game-controller"].includes(location.hash);
function connect() {
  if (!allowed() || port) return;
  port = chrome.runtime.connect({ name: "neuroreach-controls" });
  port.onMessage.addListener((message) =>
    window.postMessage(
      { channel: "neuroreach-library", from: "extension", ...message },
      location.origin,
    ),
  );
  port.onDisconnect.addListener(() => {
    port = null;
    window.postMessage(
      { channel: "neuroreach-library", from: "extension", type: "missing" },
      location.origin,
    );
  });
}
window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== location.origin || !allowed())
    return;
  const message = event.data;
  if (message?.channel !== "neuroreach-library" || message.from !== "app")
    return;
  connect();
  try {
    port?.postMessage(message);
  } catch {
    port = null;
  }
});
window.addEventListener("hashchange", () => {
  if (!allowed()) {
    port?.disconnect();
    port = null;
  }
});
