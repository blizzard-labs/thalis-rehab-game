importScripts("sites.js", "protocol.js");
const hosts = [
  "poki.com",
  "coolmathgames.com",
  "playgama.com",
  "gamepix.com",
  "crazygames.com",
  "play2048.co",
  "redsclub.com",
  "service.play.works",
];
const ports = new Set();
const panels = new Map();
const controllerPorts = new Set();
let layout = "sidebar";
let controllerWindow = null;
let popupTabId = null;
let selectedGame = null;
let transferToken = null;
let confirmTransfer = null;
let cameraSetup = null;
let target = null,
  owner = null,
  armed = false,
  showAim = false,
  heldKey = null,
  held = false,
  point = { x: 0.5, y: 0.5 },
  lastBeat = 0;
let station = null,
  reason = "Choose a game area using the extension button.";
const stationReady = chrome.storage.session.get("station").then((stored) => {
  station ??=
    controllerSite((stored.station || "") + "/") ??
    "https://blizzard-labs.github.io/thalis-rehab-game";
});
let queue = Promise.resolve();
let pendingMotion = false;
let pendingArm = false;
let generation = 0;
let queuedInputs = 0;
function disarm() {
  armed = false;
  generation += 1;
}
function queueInput(port, task, settled = () => {}) {
  const session = target;
  const epoch = generation;
  const current = () => armed && owner === port && target === session && generation === epoch && Date.now() - lastBeat <= 1200;
  if (queuedInputs >= 8) {
    disarm();
    settled();
    void enqueue(() => stop("Input arrived too quickly. Enable controls to try again."));
    return false;
  }
  queuedInputs += 1;
  void enqueue(async () => {
    try {
      if (current()) await task(current);
    } finally {
      queuedInputs -= 1;
      settled();
    }
  });
  return true;
}
const supported = (url) => {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      hosts.some((h) => u.hostname === h || u.hostname.endsWith("." + h))
    );
  } catch {
    return false;
  }
};
function status(port) {
  return {
    type: "status",
    connected: !!target?.rect,
    canControl: !!port && owner === port,
    connectionId: target?.rect ? `${target.tabId}:${target.url}` : "",
    transferToken: owner === port && target?.rect ? transferToken : null,
    armed: port ? owner === port && armed : armed,
    held,
    reason:
      port?.sender?.url?.endsWith("#game-controller") && owner !== port
        ? "Another controller window is open. Use it, or close it to take control here."
        : reason,
    game: target?.title ?? "",
    gameUrl: target
      ? new URL(target.url).origin + new URL(target.url).pathname
      : "",
    host: target ? new URL(target.url).hostname : "",
    area: target?.rect ?? null,
  };
}
function syncPanel(port) {
  const active =
    layout === "sidebar" &&
    controllerWindow !== null &&
    panels.get(port) === controllerWindow;
  if (owner === port && !active) owner = null;
  if (active && !owner) owner = port;
  port.postMessage({ type: "panel", station: active ? station : null });
  port.postMessage(status(port));
}

async function setSurface(next, windowId) {
  const previousWindow = controllerWindow;
  if (next !== layout || windowId !== previousWindow) {
    owner = null;
    layout = next;
    controllerWindow = windowId;
    if (popupTabId !== null) {
      await chrome.tabs.remove(popupTabId).catch(() => {});
      popupTabId = null;
    }
    if (
      previousWindow !== null &&
      (next !== "sidebar" || previousWindow !== windowId)
    ) {
      if (chrome.sidePanel.close) {
        await chrome.sidePanel
          .close({ windowId: previousWindow })
          .catch(() => {});
      } else {
        for (const [panel, id] of panels) {
          if (id === previousWindow) panel.postMessage({ type: "close-panel" });
        }
      }
    }
  }
  for (const panel of panels.keys()) syncPanel(panel);
  if (next === "sidebar" && ![...panels.values()].includes(windowId)) {
    // A still-open idle panel may have lost its port while the worker slept.
    void chrome.runtime
      .sendMessage({ type: "reconnect-sidebar" })
      .catch(() => {});
  }
  if (next === "popup" && !owner)
    owner =
      [...controllerPorts].find((port) =>
        port.sender.url.startsWith(station + "/"),
      ) ?? null;
}
// Calibration stays on the selected NeuroReach site. Only its handoff token crosses the bridge.
async function prepareTransfer() {
  const token = crypto.randomUUID();
  const port = owner;
  return new Promise((resolve) => {
    const finish = (saved) => {
      clearTimeout(timeout);
      confirmTransfer = null;
      resolve(saved ? token : null);
    };
    // A background controller may need a disk read before acknowledging.
    // Keep controls stopped while allowing a bounded handoff on slower devices.
    const timeout = setTimeout(() => finish(false), 3000);
    confirmTransfer = (sender, message) => {
      if (port === sender && message.token === token) finish(message.saved);
    };
    try {
      port.postMessage({ type: "save-setup", token });
    } catch {
      finish(false);
    }
  });
}
function tell() {
  for (const port of ports) {
    try {
      port.postMessage(status(port));
    } catch {}
  }
}
// A native side panel cannot display Chrome's camera prompt. Use a normal tab
// with the same extension parent and controller-site iframe permission context.
async function openCameraSetup(port) {
  if (owner !== port || !target?.rect) return;
  await stop("Camera setup open. Controls stopped.");
  if (cameraSetup?.port === port && cameraSetup.target === target) {
    await chrome.tabs.update(cameraSetup.tabId, { active: true });
    return;
  }
  await closeCameraSetup();
  const tab = await chrome.tabs.create({ url: "about:blank", active: false, windowId: target.windowId });
  cameraSetup = { tabId: tab.id, port, target, station };
  await chrome.tabs.update(tab.id, { url: chrome.runtime.getURL("camera.html"), active: true });
}
async function closeCameraSetup() {
  const previous = cameraSetup;
  cameraSetup = null;
  if (previous) await chrome.tabs.remove(previous.tabId).catch(() => {});
}
function cameraSetupCurrent() {
  return cameraSetup && cameraSetup.port === owner && cameraSetup.target === target;
}
async function input(method, params) {
  if (!target) return;
  return chrome.debugger.sendCommand(
    { tabId: target.tabId },
    "Input." + method,
    params,
  );
}
function coordinates() {
  return {
    x: target.rect.x + point.x * target.rect.width,
    y: target.rect.y + point.y * target.rect.height,
  };
}
function paintAim(visible) {
  if (!showAim || !target?.rect) return;
  void chrome.tabs
    .sendMessage(
      target.tabId,
      { type: "neuroreach-aim", visible, held, ...coordinates() },
      { frameId: 0 },
    )
    .catch(() => {});
}
async function focusPlayArea(tabId, rect) {
  const tab = { tabId };
  const x = Math.round(rect.x + rect.width / 2);
  const y = Math.round(rect.y + rect.height / 2);
  const { result } = await chrome.debugger.sendCommand(
    tab,
    "Runtime.evaluate",
    {
      expression: `(() => {
        const element = document.elementFromPoint(${x}, ${y});
        element?.focus({preventScroll:true});
        return element?.matches("iframe,frame");
      })()`,
    },
  );
  if (!result.value) return;
  // Some portals wrap the actual game in another frame. Focusing just the
  // outer player sends arrows to the wrapper and leaves the game paused.
  try {
    const hit = await chrome.debugger.sendCommand(
      tab,
      "DOM.getNodeForLocation",
      { x, y },
    );
    const { object } = await chrome.debugger.sendCommand(
      tab,
      "DOM.resolveNode",
      {
        backendNodeId: hit.backendNodeId,
      },
    );
    try {
      await chrome.debugger.sendCommand(tab, "Runtime.callFunctionOn", {
        objectId: object.objectId,
        functionDeclaration: `function () {
          if (this.matches?.("iframe,frame")) this.contentWindow.focus();
          else this.ownerDocument.defaultView.focus();
        }`,
        userGesture: true,
      });
    } finally {
      await chrome.debugger.sendCommand(tab, "Runtime.releaseObject", {
        objectId: object.objectId,
      });
    }
  } catch {
    // A process-isolated frame may expose only its outer player to this tab.
    // The player can still give the game focus by clicking its play area.
  }
}
const keyCodes = {
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
  ArrowLeft: 37,
  Space: 32,
};
function keyEvent(type, key) {
  return input("dispatchKeyEvent", {
    type,
    key: key === "Space" ? " " : key,
    code: key,
    windowsVirtualKeyCode: keyCodes[key],
  });
}
async function releaseKey() {
  if (heldKey) {
    const key = heldKey;
    heldKey = null;
    await keyEvent("keyUp", key);
  }
}
async function release() {
  if (held && target) {
    held = false;
    try {
      await input("dispatchMouseEvent", {
        type: "mouseReleased",
        ...coordinates(),
        button: "left",
        buttons: 0,
        clickCount: 1,
      });
    } catch {}
  }
}
async function stop(message, detach = false) {
  disarm();
  // A controller's cleanup must not replace a useful disconnect explanation.
  if (message) reason = message;
  else if (target?.rect)
    reason = "Controls stopped. Press Enable controls when you are ready.";
  paintAim(false);
  showAim = false;
  await releaseKey().catch(() => {});
  await release();
  if (detach && target) {
    const old = target;
    target = null;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: old.tabId },
        func: () => window.__neuroreachAreaCleanup?.(),
      });
    } catch {}
    try {
      await chrome.debugger.detach({ tabId: old.tabId });
    } catch {}
  }
  tell();
}
function enqueue(task) {
  const result = queue.then(task);
  queue = result.catch(() =>
    stop("The game connection ended. Choose its play area again.", true),
  );
  return result;
}

// Runs in an isolated extension world after the player clicks the toolbar button.
async function chooseArea() {
  window.__neuroreachAreaCleanup?.();
  // Chrome's debugger notice resizes the viewport. Let that settle before the
  // player measures the game area, otherwise the new connection invalidates itself.
  await new Promise((resolve) => {
    let quiet;
    const finish = () => {
      clearTimeout(quiet);
      clearTimeout(limit);
      window.removeEventListener("resize", resized);
      resolve();
    };
    const resized = () => {
      clearTimeout(quiet);
      quiet = setTimeout(finish, 200);
    };
    const limit = setTimeout(finish, 1500);
    quiet = setTimeout(finish, 300);
    window.addEventListener("resize", resized);
  });
  const cover = document.createElement("div");
  cover.dataset.neuroreachArea = "true";
  cover.tabIndex = -1;
  const previousFocus = document.activeElement;
  cover.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;background:#142d3944;cursor:crosshair;touch-action:none";
  const help = document.createElement("div");
  help.style.cssText =
    "position:absolute;left:20px;right:20px;top:12px;padding:14px 18px;background:#fff;color:#153b30;border-radius:10px;font:16px/1.5 system-ui;user-select:none";
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
    help.style.transition = "opacity 140ms ease-out";
  help.textContent =
    "NeuroReach · Drag a rectangle over just the game. Keep advertisements outside it. Escape cancels.";
  const box = document.createElement("div");
  box.style.cssText =
    "position:absolute;border:3px solid #9df3c0;background:#234e4022;pointer-events:none;box-sizing:border-box";
  cover.append(help, box);
  document.documentElement.append(cover);
  cover.focus({ preventScroll: true });
  let start = null;
  // Pointer events bubble to the picker, so a selection can start inside the hint.
  help.onpointerenter = () => {
    help.style.opacity = "0.45";
  };
  help.onpointerleave = () => {
    if (!start) help.style.opacity = "1";
  };
  const removePicker = () => {
    const restoreFocus = document.activeElement === cover;
    cover.remove();
    document.removeEventListener("keydown", escape, true);
    if (
      restoreFocus &&
      previousFocus instanceof HTMLElement &&
      previousFocus.isConnected
    )
      previousFocus.focus({ preventScroll: true });
  };
  let selectedLayout = null;
  const layoutChanged = () => {
    if (
      selectedLayout &&
      (innerWidth !== selectedLayout.width ||
        innerHeight !== selectedLayout.height ||
        scrollX !== selectedLayout.x ||
        scrollY !== selectedLayout.y)
    )
      chrome.runtime.sendMessage({ type: "layout-changed" }).catch(() => {});
  };
  // Keep the game underneath the marker clickable, including nested game frames.
  const aim = document.createElement("div");
  aim.dataset.neuroreachAim = "true";
  aim.setAttribute("aria-hidden", "true");
  aim.style.cssText =
    "all:initial;position:fixed;top:0;left:0;z-index:2147483647;pointer-events:none;" +
    "width:18px;height:18px;box-sizing:border-box;border:2px solid white;" +
    "border-radius:50%;box-shadow:0 0 0 2px #342844;display:none";
  const drawAim = (message, sender) => {
    if (sender.id !== chrome.runtime.id || message.type !== "neuroreach-aim")
      return;
    if (!message.visible) {
      aim.remove();
      return;
    }
    if (!aim.isConnected) document.documentElement.append(aim);
    aim.style.display = "block";
    aim.style.background = message.held ? "#ffbd4773" : "transparent";
    aim.style.transform = `translate(${message.x - 9}px,${message.y - 9}px)`;
  };
  const clean = () => {
    removePicker();
    aim.remove();
    chrome.runtime.onMessage.removeListener(drawAim);
    window.removeEventListener("resize", layoutChanged);
    window.removeEventListener("scroll", layoutChanged);
    delete window.__neuroreachAreaCleanup;
  };
  const escape = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      clean();
      chrome.runtime.sendMessage({ type: "cancel-area" }).catch(() => {});
    }
  };
  window.__neuroreachAreaCleanup = clean;
  document.addEventListener("keydown", escape, true);
  cover.onpointerdown = (event) => {
    start = { x: event.clientX, y: event.clientY };
    help.style.opacity = "0.45";
    cover.setPointerCapture(event.pointerId);
  };
  cover.onpointermove = (event) => {
    if (!start) return;
    Object.assign(box.style, {
      left: Math.min(start.x, event.clientX) + "px",
      top: Math.min(start.y, event.clientY) + "px",
      width: Math.abs(start.x - event.clientX) + "px",
      height: Math.abs(start.y - event.clientY) + "px",
    });
  };
  cover.onpointerup = (event) => {
    if (!start) return;
    const rect = {
      x: Math.max(0, Math.min(start.x, event.clientX)),
      y: Math.max(0, Math.min(start.y, event.clientY)),
      width: Math.abs(start.x - event.clientX),
      height: Math.abs(start.y - event.clientY),
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
    };
    start = null;
    help.style.opacity = help.matches(":hover") ? "0.45" : "1";
    if (
      rect.width < 120 ||
      rect.height < 100 ||
      rect.x + rect.width > innerWidth ||
      rect.y + rect.height > innerHeight
    ) {
      help.textContent =
        "Select a larger area inside this window, or press Escape to cancel.";
      return;
    }
    removePicker();
    chrome.runtime.onMessage.addListener(drawAim);
    selectedLayout = {
      width: innerWidth,
      height: innerHeight,
      x: scrollX,
      y: scrollY,
    };
    chrome.runtime.sendMessage({ type: "area", rect }).catch(() => {});
    window.addEventListener("resize", layoutChanged);
    window.addEventListener("scroll", layoutChanged);
  };
}

async function beginSelection(tabId, nextLayout = "sidebar") {
  const tab = await chrome.tabs.get(tabId);
  if (!supported(tab.url) || !tab.active)
    throw new Error("Open a supported game in the active tab first.");
  await closeCameraSetup();
  const switching =
    owner &&
    nextLayout !== layout &&
    selectedGame?.id === tabId &&
    selectedGame.url === tab.url;
  const previous = target;
  const reuse = previous?.tabId === tabId && previous.url === tab.url;
  // Keep the debugger notice in place when reselecting the same game. Detaching
  // and reattaching makes Chrome resize the game twice during the view handoff.
  // Release held input while its old rectangle still exists.
  await stop("Choose a new game area.", !reuse);
  if (reuse) {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.__neuroreachAreaCleanup?.(),
    });
    previous.rect = null;
    tell();
  }
  transferToken = switching ? await prepareTransfer() : null;
  selectedGame = { id: tabId, url: tab.url };
  await setSurface(nextLayout, tab.windowId);
  if (!reuse || target !== previous)
    await chrome.debugger.attach({ tabId }, "1.3");
  const selection = {
    tabId,
    url: tab.url,
    title: tab.title,
    windowId: tab.windowId,
    rect: null,
  };
  target = selection;
  tell();
  await chrome.scripting.executeScript({ target: { tabId }, func: chooseArea });
  if (target !== selection) {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.__neuroreachAreaCleanup?.(),
    });
    throw new Error("Game connection changed. Choose its area again.");
  }
}

async function connectGame(tabId, rect) {
  const tab = await chrome.tabs.get(tabId);
  if (
    !supported(tab.url) ||
    !tab.active ||
    target?.tabId !== tabId ||
    target.url !== tab.url ||
    target.rect
  )
    throw new Error("Open a supported game in the active tab first.");
  if (
    !rect ||
    !["x", "y", "width", "height", "viewportWidth", "viewportHeight"].every(
      (k) => Number.isFinite(rect[k]),
    ) ||
    rect.x < 0 ||
    rect.y < 0 ||
    rect.width < 120 ||
    rect.height < 100 ||
    rect.x + rect.width > rect.viewportWidth ||
    rect.y + rect.height > rect.viewportHeight
  )
    throw new Error("Select a valid game area.");
  target.rect = rect;
  point = { x: 0.5, y: 0.5 };
  reason = "Game connected. Set up your input, then enable controls.";
  tell();
  if (layout === "popup" && !owner) {
    const popup = await chrome.windows.create({
      url: station + "/#game-controller",
      type: "popup",
      width: 490,
      height: 840,
    });
    popupTabId = popup.tabs?.[0]?.id ?? null;
  }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !message || typeof message !== "object") return;
  if (message.type === "camera-context" || message.type === "camera-return") {
    if (sender.url !== chrome.runtime.getURL("camera.html") || sender.tab?.id !== cameraSetup?.tabId || !cameraSetupCurrent()) {
      respond({ ok: false });
      return;
    }
    if (message.type === "camera-context") {
      respond({ station: cameraSetup.station });
      return;
    }
    void enqueue(async () => {
      if (!cameraSetupCurrent() || sender.tab.id !== cameraSetup.tabId) return;
      const setup = cameraSetup;
      await chrome.tabs.update(setup.target.tabId, { active: true });
      setup.port.postMessage({ type: "camera-permission-result" });
      await closeCameraSetup();
    }).then(() => respond({ ok: true }));
    return true;
  }
  const toolbar = sender.url === chrome.runtime.getURL("popup.html");
  if (toolbar && message.type === "game-view") {
    chrome.tabs.get(message.tabId).then(
      (tab) =>
        respond({
          supported: supported(tab.url),
          layout: target?.tabId === tab.id ? layout : null,
        }),
      () => respond({ supported: false }),
    );
    return true;
  }
  // Keep the entire handoff in the worker: opening Chrome's side panel can
  // destroy the toolbar popup before its next awaited instruction runs.
  // Start opening synchronously while the toolbar click is still a gesture.
  const panelReady = toolbar && message.type === "choose-area" && message.layout === "sidebar"
    ? chrome.sidePanel.open({ windowId: message.windowId }).then(() => null, (error) => error)
    : Promise.resolve(null);
  const run = async () => {
    if (message.type === "stop") {
      await stop(undefined, !target?.rect);
      return;
    }
    if (message.type === "choose-area" && toolbar) {
      const panelError = await panelReady;
      if (panelError) throw panelError;
      await stationReady;
      await beginSelection(
        message.tabId,
        message.layout === "popup" ? "popup" : "sidebar",
      );
    } else if (message.type === "area" && sender.tab)
      await connectGame(sender.tab.id, message.rect);
    else if (
      message.type === "cancel-area" &&
      sender.tab?.id === target?.tabId &&
      !target?.rect
    )
      await stop("Game selection cancelled.", true);
    else if (
      message.type === "layout-changed" &&
      target?.rect &&
      sender.tab?.id === target?.tabId
    )
      await stop("The game layout moved. Choose its play area again.", true);
  };
  if (message.type === "stop" || message.type === "choose-area") disarm();
  enqueue(run)
    .then(() => respond({ ok: true }))
    .catch((error) => respond({ ok: false, error: error.message }));
  return true;
});

chrome.runtime.onConnect.addListener((port) => {
  const sidebar =
    port.name === "neuroreach-sidebar" &&
    port.sender?.url === chrome.runtime.getURL("sidebar.html");
  let controller = sidebar;
  if (!sidebar) {
    if (
      port.name !== "neuroreach-controls" ||
      !port.sender?.tab ||
      port.sender.frameId !== 0
    )
      return;
    const url = new URL(port.sender.url);
    const site = controllerSite(url.href);
    if (!site || !["#library", "#game-controller"].includes(url.hash)) return;
    controller = url.hash === "#game-controller";
    if (!controller) {
      station = site;
      void chrome.storage.session.set({ station });
    }
    if (controller) controllerPorts.add(port);
    if (controller && layout === "popup" && !owner && site === station)
      owner = port;
  }
  ports.add(port);
  port.postMessage(status(port));
  port.onDisconnect.addListener(() => {
    ports.delete(port);
    panels.delete(port);
    controllerPorts.delete(port);
    if (port.sender?.tab?.id === popupTabId) popupTabId = null;
    if (owner === port) {
      owner = null;
      void enqueue(closeCameraSetup);
      void enqueue(() =>
        stop("Controller closed. Controls stopped.", !target?.rect),
      );
    }
  });
  port.onMessage.addListener((message) => {
    if (!message || typeof message !== "object") return;
    if (
      sidebar &&
      message.type === "panel-ready" &&
      Number.isInteger(message.windowId)
    ) {
      panels.set(port, message.windowId);
      syncPanel(port);
      return;
    }
    message = controlCommand(message);
    if (!message) return;
    if (message.type === "hello") {
      if (
        !sidebar &&
        controller &&
        layout === "popup" &&
        !owner &&
        controllerSite(port.sender.url) === station
      )
        owner = port;
      port.postMessage(status(port));
      return;
    }
    if (!controller || owner !== port) return;
    if (message.type === "camera-permission") {
      disarm();
      void enqueue(() => openCameraSetup(port));
      return;
    }
    if (message.type === "setup-saved") {
      confirmTransfer?.(port, message);
      return;
    }
    if (message.type === "setup-restored" && message.token === transferToken) {
      transferToken = null;
      return;
    }
    if (message.type === "heartbeat") {
      lastBeat = Date.now();
      return;
    }
    if (message.type === "stop") {
      disarm();
      // The app also sends stop on configuration changes. It may arrive
      // while the player is drawing a replacement area in the game.
      void enqueue(() => stop());
      return;
    }
    if (message.type === "arm") {
      if (cameraSetup) return;
      if (pendingArm) return;
      pendingArm = true;
      const session = target;
      const epoch = generation;
      void enqueue(async () => {
        try {
          if (!target?.rect || target !== session || generation !== epoch || owner !== port) return;
          const tab = await chrome.tabs.get(target.tabId);
          if (!tab.active || tab.url !== target.url) {
            await stop("Return to the selected game, then reconnect.", true);
            return;
          }
          await releaseKey();
          await release();
          // Games such as Crossy Road pause on window blur. Camera play can
          // leave its controller behind the game once calibration is complete.
          if (message.focusGame === true)
            await chrome.windows.update(tab.windowId, { focused: true });
          await focusPlayArea(tab.id, target.rect);
          if (target !== session || generation !== epoch || owner !== port) return;
          lastBeat = Date.now();
          armed = true;
          showAim = message.showAim === true;
          reason = "Controls enabled. Alt+Shift+S stops immediately.";
          tell();
        } finally {
          pendingArm = false;
        }
      });
      return;
    }
    if (!armed || !target || Date.now() - lastBeat > 1200) return;
    // Bound the queue: input is immediate; frames are dropped under backpressure.
    if (message.type === "move") {
      if (
        ![message.x, message.y].every(
          (v) => Number.isFinite(v) && v >= 0 && v <= 1,
        )
      )
        return;
      point = { x: message.x, y: message.y };
      if (pendingMotion) return;
      pendingMotion = true;
      queueInput(port, async () => {
          if (armed && target) {
            paintAim(true);
            await input("dispatchMouseEvent", {
              type: "mouseMoved",
              ...coordinates(),
              buttons: held ? 1 : 0,
              button: held ? "left" : "none",
            });
          }
      }, () => { pendingMotion = false; });
    } else if (
      message.type === "click" ||
      message.type === "hold" ||
      message.type === "release"
    ) {
      queueInput(port, async () => {
        if (!armed || !target) return;
        if (message.type === "hold" && held) return;
        if (message.type === "release" || held) await release();
        else {
          held = true;
          await input("dispatchMouseEvent", {
            type: "mousePressed",
            ...coordinates(),
            button: "left",
            buttons: 1,
            clickCount: 1,
          });
          if (message.type === "click") {
            // Frame-polled games can miss a press and release within one frame.
            await new Promise((resolve) => setTimeout(resolve, 90));
            await release();
          }
        }
        paintAim(true);
        tell();
      });
    } else if (message.type === "key") {
      if (!Object.hasOwn(keyCodes, message.key)) return;
      queueInput(port, async (current) => {
        if (!armed || !target) return;
        await releaseKey();
        if (!current()) return;
        heldKey = message.key;
        await keyEvent("rawKeyDown", message.key);
        await new Promise((resolve) => setTimeout(resolve, 60));
        await releaseKey();
      });
    } else if (message.type === "steer") {
      const key = message.key;
      if (key !== null && (!Object.hasOwn(keyCodes, key) || key === "Space"))
        return;
      queueInput(port, async (current) => {
        if (!armed || !target || key === heldKey) return;
        await releaseKey();
        if (key && current()) {
          heldKey = key;
          await keyEvent("rawKeyDown", key);
        }
      });
    }
  });
});
setInterval(() => {
  if (armed && Date.now() - lastBeat > 1200) {
    disarm();
    void enqueue(() => stop("Input connection lost. Controls stopped."));
  }
}, 400);
chrome.debugger.onDetach.addListener(({ tabId }) => {
  if (target?.tabId === tabId) {
    target = null;
    disarm();
    held = false;
    showAim = false;
    heldKey = null;
    reason = "Game disconnected. Choose its area again.";
    void chrome.scripting
      .executeScript({
        target: { tabId },
        func: () => window.__neuroreachAreaCleanup?.(),
      })
      .catch(() => {});
    tell();
  }
});
chrome.tabs.onUpdated.addListener((id, change) => {
  if (
    target?.tabId === id &&
    (change.status === "loading" || (change.url && change.url !== target.url))
  ) {
    disarm();
    void enqueue(() => stop("Game page changed. Choose its area again.", true));
  }
});
chrome.tabs.onRemoved.addListener((id) => {
  if (cameraSetup?.tabId !== id) return;
  const setup = cameraSetup;
  cameraSetup = null;
  if (owner === setup.port) {
    try { setup.port.postMessage({ type: "camera-permission-result" }); } catch {}
  }
});
chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  const controllerTab = owner?.sender?.tab;
  if (
    (target && windowId === target.windowId && tabId !== target.tabId) ||
    (armed &&
      controllerTab?.windowId === windowId &&
      tabId !== controllerTab.id)
  ) {
    disarm();
    void enqueue(() => stop("Tab switched. Controls stopped."));
  }
});
chrome.commands.onCommand.addListener(() => {
  disarm();
  void enqueue(() => stop(undefined, !target?.rect));
});
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (
    armed &&
    windowId !== target?.windowId &&
    windowId !== owner?.sender?.tab?.windowId
  ) {
    disarm();
    void enqueue(() =>
      stop("Focus left the game and controller. Controls stopped."),
    );
  }
});
