const frame = document.querySelector("iframe");
const notice = document.querySelector("p");
let port;
let station;
function receive(message) {
  if (message.type === "panel") {
    const site = message.station && controllerSite(message.station + "/");
    if (!site || site !== message.station) {
      station = null;
      frame.hidden = true;
      frame.removeAttribute("src");
      notice.hidden = false;
      return;
    }
    if (station !== site) {
      station = site;
      frame.src = station + "/#game-controller";
    }
    notice.hidden = true;
    frame.hidden = false;
  } else if (message.type === "close-panel") {
    window.close();
  } else if (station) {
    frame.contentWindow.postMessage(
      { ...message, channel: "neuroreach-library", from: "extension" },
      new URL(station).origin,
    );
  }
}
window.addEventListener("message", (event) => {
  if (
    station &&
    event.source === frame.contentWindow &&
    event.origin === new URL(station).origin &&
    event.data?.channel === "neuroreach-library" &&
    event.data.from === "app" &&
    event.data.type !== "panel-ready"
  )
    {
      const command = controlCommand(event.data);
      if (command) port?.postMessage(command);
    }
});
function connect() {
  if (port) return;
  port = chrome.runtime.connect({ name: "neuroreach-sidebar" });
  port.onMessage.addListener(receive);
  port.onDisconnect.addListener(() => {
    port = null;
    station = null;
    frame.removeAttribute("src");
    frame.hidden = true;
    notice.textContent =
      "Controller disconnected. Open the NeuroReach extension to reconnect.";
    notice.hidden = false;
  });
  chrome.windows
    .getCurrent()
    .then(({ id }) => port?.postMessage({ type: "panel-ready", windowId: id }));
}
chrome.runtime.onMessage.addListener((message, sender) => {
  if (sender.id === chrome.runtime.id && message.type === "reconnect-sidebar")
    connect();
});
connect();
