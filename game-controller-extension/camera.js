const frame = document.querySelector("iframe");
const notice = document.querySelector("p");
let station;
chrome.runtime.sendMessage({ type: "camera-context" }).then((context) => {
  const site = context?.station && controllerSite(context.station + "/");
  if (!site || site !== context.station) throw new Error("Setup expired");
  station = site;
  frame.src = station + "/camera-permission.html";
  frame.hidden = false;
  notice.hidden = true;
}).catch(() => {
  notice.textContent = "Camera setup has ended. Close this tab and open camera setup from your game controller again.";
});
window.addEventListener("message", (event) => {
  if (!station || event.source !== frame.contentWindow || event.origin !== new URL(station).origin ||
      event.data?.channel !== "neuroreach-camera" || event.data.type !== "return") return;
  chrome.runtime.sendMessage({ type: "camera-return" }).catch(() => {});
});
