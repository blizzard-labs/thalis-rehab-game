const hosts = [
  "poki.com",
  "coolmathgames.com",
  "playgama.com",
  "gamepix.com",
  "crazygames.com",
  "play2048.co",
  "redsclub.com",
];
const ports = new Set();
let target = null,
  owner = null,
  armed = false,
  held = false,
  point = { x: 0.5, y: 0.5 },
  lastBeat = 0;
let station = "http://127.0.0.1:8766",
  reason = "Choose a game area using the extension button.";
let queue = Promise.resolve();
let pendingMotion = false;
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
    armed: port ? owner === port && armed : armed,
    held,
    reason:
      port?.sender?.url?.endsWith("#game-controller") && owner !== port
        ? "Another controller window is open. Use it, or close it to take control here."
        : reason,
    game: target?.title ?? "",
    host: target ? new URL(target.url).hostname : "",
    area: target?.rect ?? null,
  };
}
function tell() {
  for (const port of ports) {
    try {
      port.postMessage(status(port));
    } catch {}
  }
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
async function stop(
  message = "Controls stopped. Press Enable controls when you are ready.",
  detach = false,
) {
  armed = false;
  reason = message;
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
    "position:absolute;left:20px;right:20px;top:12px;padding:14px 18px;background:#fff;color:#153b30;border-radius:10px;font:16px/1.5 system-ui;pointer-events:none";
  help.textContent =
    "NeuroReach · Drag a rectangle over just the game. Keep advertisements outside it. Escape cancels.";
  const box = document.createElement("div");
  box.style.cssText =
    "position:absolute;border:3px solid #9df3c0;background:#234e4022;pointer-events:none;box-sizing:border-box";
  cover.append(help, box);
  document.documentElement.append(cover);
  cover.focus({ preventScroll: true });
  let start = null;
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
  const layoutChanged = () => {
    chrome.runtime.sendMessage({ type: "layout-changed" }).catch(() => {});
  };
  const clean = () => {
    removePicker();
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
    chrome.runtime.sendMessage({ type: "area", rect }).catch(() => {});
    window.addEventListener("resize", layoutChanged, { once: true });
    window.addEventListener("scroll", layoutChanged, { once: true });
  };
}

async function beginSelection(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!supported(tab.url) || !tab.active)
    throw new Error("Open a supported game in the active tab first.");
  await stop("Choose a new game area.", true);
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
  if (!owner)
    await chrome.windows.create({
      url: station + "/#game-controller",
      type: "popup",
      width: 490,
      height: 840,
    });
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  const run = async () => {
    if (message.type === "stop") {
      await stop(undefined, !target?.rect);
      return;
    }
    if (message.type === "choose-area" && !sender.tab) {
      await beginSelection(message.tabId);
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
      sender.tab?.id === target?.tabId
    )
      await stop("The game layout moved. Choose its play area again.", true);
  };
  enqueue(run)
    .then(() => respond({ ok: true }))
    .catch((error) => respond({ ok: false, error: error.message }));
  return true;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "neuroreach-controls" || !port.sender?.tab) return;
  let url;
  try {
    url = new URL(port.sender.url);
  } catch {
    return;
  }
  if (
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    !["#library", "#game-controller"].includes(url.hash)
  )
    return;
  station = url.origin;
  ports.add(port);
  const controller = url.hash === "#game-controller";
  if (controller && !owner) owner = port;
  port.postMessage(status(port));
  port.onDisconnect.addListener(() => {
    ports.delete(port);
    if (owner === port) {
      owner = null;
      void enqueue(() =>
        stop("Controller closed. Controls stopped.", !target?.rect),
      );
    }
  });
  port.onMessage.addListener((message) => {
    if (message.type === "hello") {
      if (controller && !owner) owner = port;
      port.postMessage(status(port));
      return;
    }
    if (!controller || owner !== port) return;
    if (message.type === "heartbeat") {
      lastBeat = Date.now();
      return;
    }
    if (message.type === "stop") {
      armed = false;
      // The app also sends stop on configuration changes. It may arrive
      // while the player is drawing a replacement area in the game.
      void enqueue(() => stop());
      return;
    }
    if (message.type === "arm") {
      void enqueue(async () => {
        if (!target?.rect || owner !== port) return;
        const tab = await chrome.tabs.get(target.tabId);
        if (!tab.active || tab.url !== target.url) {
          await stop("Return to the selected game, then reconnect.", true);
          return;
        }
        await release();
        // Games such as Crossy Road pause on window blur. Camera play can
        // leave its controller behind the game once calibration is complete.
        if (message.focusGame === true)
          await chrome.windows.update(tab.windowId, { focused: true });
        await focusPlayArea(tab.id, target.rect);
        if (!target || owner !== port) return;
        lastBeat = Date.now();
        armed = true;
        reason = "Controls enabled. Alt+Shift+S stops immediately.";
        tell();
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
      void enqueue(async () => {
        try {
          if (armed && target)
            await input("dispatchMouseEvent", {
              type: "mouseMoved",
              ...coordinates(),
              buttons: held ? 1 : 0,
              button: held ? "left" : "none",
            });
        } finally {
          pendingMotion = false;
        }
      });
    } else if (
      message.type === "click" ||
      message.type === "hold" ||
      message.type === "release"
    ) {
      void enqueue(async () => {
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
          if (message.type === "click") await release();
        }
        tell();
      });
    } else if (message.type === "key") {
      const keys = {
        ArrowUp: 38,
        ArrowRight: 39,
        ArrowDown: 40,
        ArrowLeft: 37,
        Space: 32,
      };
      if (!Object.hasOwn(keys, message.key)) return;
      void enqueue(async () => {
        if (!armed || !target) return;
        const values = {
          key: message.key === "Space" ? " " : message.key,
          code: message.key,
          windowsVirtualKeyCode: keys[message.key],
        };
        await input("dispatchKeyEvent", { type: "rawKeyDown", ...values });
        await input("dispatchKeyEvent", { type: "keyUp", ...values });
      });
    }
  });
});
setInterval(() => {
  if (armed && Date.now() - lastBeat > 1200) {
    armed = false;
    void enqueue(() => stop("Input connection lost. Controls stopped."));
  }
}, 400);
chrome.debugger.onDetach.addListener(({ tabId }) => {
  if (target?.tabId === tabId) {
    target = null;
    armed = held = false;
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
    armed = false;
    void enqueue(() => stop("Game page changed. Choose its area again.", true));
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
    armed = false;
    void enqueue(() => stop("Tab switched. Controls stopped."));
  }
});
chrome.commands.onCommand.addListener(() => {
  armed = false;
  void enqueue(() => stop(undefined, !target?.rect));
});
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (
    armed &&
    windowId !== target?.windowId &&
    windowId !== owner?.sender?.tab?.windowId
  ) {
    armed = false;
    void enqueue(() =>
      stop("Focus left the game and controller. Controls stopped."),
    );
  }
});
