import { useEffect, useRef, useState } from "react";
import type { Side } from "./session";

type Device = { id: string; name: string };
type Phase = "connecting" | "choose" | "calibrating" | "ready" | "error";
const profileKey = "neuroreach-eeg-profile";

export function useHeadset(enabled: boolean, side: Side) {
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<Phase>("connecting");
  const [devices, setDevices] = useState<Device[]>([]);
  const [message, setMessage] = useState("Opening the local companion…");
  const socket = useRef<WebSocket | null>(null);
  const score = useRef<{ level: number; time: number } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    setPhase("connecting"); setDevices([]); setMessage("Discovering Unicorn streams…");
    const local = location.hostname === "127.0.0.1" || location.hostname === "localhost";
    if (!local) {
      setPhase("error"); setMessage("Open the Windows companion on the computer connected to your headset."); return;
    }
    const ws = new WebSocket(`ws://${location.host}/api/eeg`);
    socket.current = ws;
    let closed = false, failed = false;
    const fail = (why: string) => { failed = true; score.current = null; setPhase("error"); setMessage(why); };
    ws.onmessage = ({data}) => {
      if (closed) return;
      const event = JSON.parse(data);
      if (event.type === "devices") {
        setPhase("choose"); setDevices(event.devices);
        setMessage(event.devices.length ? "Select your headset." : "No Unicorn found. Start the Unicorn Suite LSL stream, then scan again.");
      } else if (event.type === "phase") { setPhase("calibrating"); setMessage([event.message, ...(event.contacts ?? [])].join(" · ")); }
      else if (event.type === "ready") { setPhase("ready"); setMessage(event.message); }
      else if (event.type === "score") {
        score.current = Number.isFinite(event.level) ? { level:event.level, time:performance.now() } : null;
        setMessage(event.message);
      } else if (event.type === "error") fail(event.message);
    };
    ws.onerror = () => { if (!closed) fail("The local EEG companion is unavailable. Run npm run companion on the headset computer, then retry."); };
    ws.onclose = () => { if (!closed && !failed) fail("EEG disconnected. Reconnect the headset or continue with one button."); };
    return () => { closed = true; socket.current = null; score.current = null; ws.close(); };
  }, [enabled, attempt]);

  function start(device: string, train: boolean, remember: boolean) {
    let profile: string | null = null;
    if (remember) {
      try {
        profile = localStorage.getItem(profileKey) || crypto.randomUUID();
        localStorage.setItem(profileKey, profile);
      } catch { setMessage("This browser cannot save a model. Clear Remember calibration and try again."); return; }
    }
    if (socket.current?.readyState !== WebSocket.OPEN) return;
    setPhase("calibrating"); setMessage("Connecting to the selected headset…");
    socket.current.send(JSON.stringify({ cmd:"start", device, side, train, profile }));
  }
  return { devices, phase, message, start, retry: () => setAttempt(i => i+1),
    latest: () => score.current && performance.now() - score.current.time < 500 ? score.current.level : null };
}
