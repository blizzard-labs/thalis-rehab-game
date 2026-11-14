import { useEffect, useState } from "react";

export type ControllerStatus = {
  installed: boolean;
  connected: boolean;
  canControl: boolean;
  connectionId: string;
  transferToken?: string;
  armed: boolean;
  held: boolean;
  game: string;
  gameUrl?: string;
  host: string;
  reason: string;
  area: { width: number; height: number } | null;
};
// Only an extension-hosted controller delegates its bridge to the parent panel.
function panelOrigin() {
  if (window.parent === window || location.hash !== "#game-controller")
    return null;
  // Chromium omits the extension referrer when it loads the localhost frame.
  const origin = location.ancestorOrigins?.[0];
  return origin?.startsWith("chrome-extension://") ? origin : null;
}
export function sendControl(
  type: string,
  values: Record<string, unknown> = {},
) {
  const origin = panelOrigin();
  (origin ? window.parent : window).postMessage(
    { channel: "neuroreach-library", from: "app", type, ...values },
    origin ?? location.origin,
  );
}
export function onExtensionMessage(
  receive: (message: MessageEvent["data"]) => void,
) {
  const origin = panelOrigin();
  const listener = (event: MessageEvent) => {
    if (
      event.source === (origin ? window.parent : window) &&
      event.origin === (origin ?? location.origin) &&
      event.data?.channel === "neuroreach-library" &&
      event.data.from === "extension"
    )
      receive(event.data);
  };
  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}
export function useGameController() {
  const [status, setStatus] = useState<ControllerStatus>({
    installed: false,
    connected: false,
    canControl: false,
    connectionId: "",
    armed: false,
    held: false,
    game: "",
    host: "",
    reason:
      "Install the NeuroReach Game Controller extension to connect your inputs.",
    area: null,
  });
  useEffect(() => {
    const unsubscribe = onExtensionMessage((message) => {
      if (message.type === "status") setStatus({ ...message, installed: true });
      if (message.type === "missing")
        setStatus((old) => ({
          ...old,
          installed: false,
          connected: false,
          armed: false,
          held: false,
          reason:
            "Extension disconnected. Reload this window after reconnecting it.",
        }));
    });
    sendControl("hello");
    const id = window.setInterval(() => sendControl("hello"), 2000);
    return () => {
      clearInterval(id);
      sendControl("stop");
      unsubscribe();
    };
  }, []);
  return status;
}
