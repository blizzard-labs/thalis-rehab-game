import { useEffect, useState } from "react";

export type ControllerStatus = {
  installed: boolean;
  connected: boolean;
  canControl: boolean;
  connectionId: string;
  armed: boolean;
  held: boolean;
  game: string;
  host: string;
  reason: string;
  area: { width: number; height: number } | null;
};
export function sendControl(
  type: string,
  values: Record<string, unknown> = {},
) {
  window.postMessage(
    { channel: "neuroreach-library", from: "app", type, ...values },
    location.origin,
  );
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
    const receive = (event: MessageEvent) => {
      if (
        event.source !== window ||
        event.origin !== location.origin ||
        event.data?.channel !== "neuroreach-library" ||
        event.data.from !== "extension"
      )
        return;
      if (event.data.type === "status")
        setStatus({ ...event.data, installed: true });
      if (event.data.type === "missing")
        setStatus((old) => ({
          ...old,
          installed: false,
          connected: false,
          armed: false,
          held: false,
          reason:
            "Extension disconnected. Reload this window after reconnecting it.",
        }));
    };
    window.addEventListener("message", receive);
    sendControl("hello");
    const id = window.setInterval(() => sendControl("hello"), 2000);
    return () => {
      clearInterval(id);
      sendControl("stop");
      window.removeEventListener("message", receive);
    };
  }, []);
  return status;
}
