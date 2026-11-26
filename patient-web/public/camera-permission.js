const allow = document.querySelector("#allow");
const back = document.querySelector("#back");
const status = document.querySelector("#status");
const help = document.querySelector("#help");
const extensionOrigin = location.ancestorOrigins?.[0];
back.hidden = window.parent === window || !extensionOrigin?.startsWith("chrome-extension://");
let closed = false;
window.addEventListener("pagehide", () => { closed = true; });
allow.addEventListener("click", async () => {
  allow.disabled = true;
  status.textContent = "Choose Allow in the browser’s camera prompt.";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    // Only establish permission here. The controller owns the playing stream.
    stream.getTracks().forEach(track => track.stop());
    if (closed) return;
    allow.hidden = true;
    status.textContent = "Camera access is ready. Return to the game to finish setting your movement range.";
    back.focus();
  } catch (error) {
    if (closed) return;
    status.textContent = error.name === "NotAllowedError"
      ? "Camera access is still blocked or the prompt was dismissed. Check the permission settings below, then try again."
      : error.name === "NotFoundError"
        ? "No camera was found. Connect a webcam, then try again."
        : "The camera could not start. Close other camera apps and check your computer’s camera privacy settings, then try again.";
    help.open = true;
    allow.textContent = "Try camera again";
  } finally { allow.disabled = false; }
});
back.addEventListener("click", () => {
  if (!back.hidden) window.parent.postMessage({ channel: "neuroreach-camera", type: "return" }, extensionOrigin);
});
