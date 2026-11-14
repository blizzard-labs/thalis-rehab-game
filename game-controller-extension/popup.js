const button = document.getElementById("connect");
const view = document.getElementById("view");
const statusText = document.getElementById("status");
let game;
let activeLayout;
function labelButton() {
  button.textContent =
    activeLayout && activeLayout !== view.value
      ? "Switch view and choose game area"
      : "Choose game area";
}
Promise.all([
  chrome.tabs.query({ active: true, currentWindow: true }),
  chrome.storage.local.get("controllerView"),
])
  .then(async ([[tab], settings]) => {
    game = tab;
    view.value = settings.controllerView === "popup" ? "popup" : "sidebar";
    view.disabled = false;
    const info =
      tab?.id &&
      (await chrome.runtime.sendMessage({ type: "game-view", tabId: tab.id }));
    activeLayout = info?.layout;
    labelButton();
    button.disabled = !info?.supported;
    if (button.disabled)
      statusText.textContent = "Open a supported game to choose its play area.";
  })
  .catch((error) => {
    statusText.textContent = error.message;
  });

view.onchange = () => {
  labelButton();
  void chrome.storage.local.set({ controllerView: view.value });
};
button.onclick = async () => {
  button.disabled = true;
  const layout = view.value;
  try {
    // Opening a native panel requires the original click's user activation.
    if (layout === "sidebar")
      await chrome.sidePanel.open({ windowId: game.windowId });
    const result = await chrome.runtime.sendMessage({
      type: "choose-area",
      tabId: game.id,
      layout,
    });
    if (!result.ok) throw new Error(result.error);
    window.close();
  } catch (error) {
    statusText.textContent = error.message;
    button.disabled = false;
  }
};
document.getElementById("stop").onclick = async () => {
  await chrome.runtime.sendMessage({ type: "stop" });
  statusText.textContent = "Controls stopped.";
};
