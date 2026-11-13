document.getElementById("connect").onclick = async () => {
  const button = document.getElementById("connect");
  button.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    const result = await chrome.runtime.sendMessage({
      type: "choose-area",
      tabId: tab.id,
    });
    if (!result.ok) throw new Error(result.error);
    window.close();
  } catch (error) {
    document.getElementById("status").textContent = error.message;
    button.disabled = false;
  }
};
document.getElementById("stop").onclick = async () => {
  await chrome.runtime.sendMessage({ type: "stop" });
  document.getElementById("status").textContent = "Controls stopped.";
};
