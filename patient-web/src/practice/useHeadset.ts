import { useEffect, useRef, useState } from "react";
import type { Readings } from "../reports/measurements";
import type { Side } from "./session";

export type ModelProfile = string | (() => Promise<string>);

const maxSampleAgeMs = 500;
// Clock probes accept up to 250 ms round trip, so allow half that in forward skew.
const clockToleranceMs = 125;

type Device = { id: string; name: string };
type Phase = "connecting" | "choose" | "calibrating" | "ready" | "error";

export function useHeadset(
  enabled: boolean,
  side: Side,
  modelProfile?: ModelProfile,
) {
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<Phase>("connecting");
  const [devices, setDevices] = useState<Device[]>([]);
  const [message, setMessage] = useState("Opening the local companion…");
  const [calibration, setCalibration] = useState<{
    method: string;
    accuracy: number | null;
    synthetic: boolean;
  }>();
  const socket = useRef<WebSocket | null>(null);
  const starting = useRef<WebSocket | null>(null);
  const score = useRef<{
    level: number;
    features: Readings;
    expiresAt: number;
    sampleMs: number;
  } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    setPhase("connecting");
    setDevices([]);
    setMessage("Discovering Unicorn streams…");
    const local =
      location.hostname === "127.0.0.1" || location.hostname === "localhost";
    const display = location.hash.startsWith("#display=");
    if (!local && !display) {
      setPhase("error");
      setMessage(
        "Open the Windows companion on the computer connected to your headset.",
      );
      return;
    }
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(
      `${scheme}://${location.host}/api/${display ? "display/" : ""}eeg`,
    );
    socket.current = ws;
    let closed = false,
      failed = false;
    let offset: number | null = null;
    let lastAcceptedStamp = -Infinity;
    const fail = (reason: string) => {
      failed = true;
      score.current = null;
      setPhase("error");
      setMessage(reason);
    };
    // Translate station epoch time to the display clock using the lowest-RTT ping.
    async function syncClock() {
      let best = 250;
      for (let i = 0; i < 3 && !closed; i++) {
        try {
          const start = Date.now();
          const response = await fetch("/api/health", {
            cache: "no-store",
            signal: AbortSignal.timeout(2000),
          });
          const data = await response.json();
          const finish = Date.now();
          if (
            !closed &&
            Number.isFinite(data.clockMs) &&
            finish - start < best
          ) {
            best = finish - start;
            offset = data.clockMs - (start + finish) / 2;
          }
        } catch {
          /* Retry on the next ping. */
        }
      }
    }
    void syncClock();
    const clockTimer = window.setInterval(syncClock, 30000);
    ws.onmessage = ({ data }) => {
      if (closed || failed) return;
      const event = JSON.parse(data);
      if (event.type === "devices") {
        setPhase("choose");
        setDevices(event.devices);
        setMessage(
          event.devices.length
            ? "Select your headset."
            : "No Unicorn found. Start the Unicorn Suite LSL stream, then scan again.",
        );
      } else if (event.type === "phase") {
        setPhase("calibrating");
        setMessage([event.message, ...(event.contacts ?? [])].join(" · "));
      } else if (event.type === "ready") {
        void syncClock();
        setPhase("ready");
        setMessage(event.message);
        setCalibration({
          method: event.method,
          accuracy: event.accuracy,
          synthetic: event.synthetic === true,
        });
      } else if (event.type === "score") {
        score.current = null;
        if (!Number.isFinite(event.level)) {
          setMessage(event.message);
          return;
        }
        if (offset === null) {
          setMessage("Synchronizing the display with the EEG station…");
          return;
        }
        const sampleMs = event.sampleMs - offset;
        const age = Date.now() - sampleMs;
        if (
          !Number.isFinite(event.sampleMs) ||
          age < -clockToleranceMs ||
          age >= maxSampleAgeMs ||
          event.sampleMs <= lastAcceptedStamp
        ) {
          setMessage("Waiting for fresh EEG from the headset…");
          return;
        }
        lastAcceptedStamp = event.sampleMs;
        score.current = {
          level: event.level,
          features: {
            muC3: event.features?.muC3,
            muCz: event.features?.muCz,
            muC4: event.features?.muC4,
            classifier: event.features?.classifier,
          },
          sampleMs,
          expiresAt: performance.now() + maxSampleAgeMs - Math.max(0, age),
        };
        setMessage(event.message);
      } else if (event.type === "error") fail(event.message);
    };
    ws.onerror = () => {
      if (!closed)
        fail(
          "The local EEG companion is unavailable. Run npm run companion on the headset computer, then retry.",
        );
    };
    ws.onclose = () => {
      if (!closed && !failed)
        fail(
          "EEG disconnected. Reconnect the headset or continue with one button.",
        );
    };
    return () => {
      closed = true;
      clearInterval(clockTimer);
      socket.current = null;
      score.current = null;
      ws.close();
    };
  }, [enabled, attempt]);

  async function start(device: string, train: boolean, remember: boolean) {
    const ws = socket.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || starting.current === ws)
      return;
    starting.current = ws;
    let profile: string | null = null;
    if (remember) {
      try {
        if (!modelProfile) throw new Error();
        profile =
          typeof modelProfile === "string"
            ? modelProfile
            : await modelProfile();
      } catch {
        if (starting.current === ws) starting.current = null;
        if (ws === socket.current)
          setMessage(
            "Could not open this player’s saved calibration. Return to the game menu or turn off model saving to continue.",
          );
        return;
      }
    }
    if (socket.current !== ws || ws.readyState !== WebSocket.OPEN) return;
    setPhase("calibrating");
    setMessage("Connecting to the selected headset…");
    ws.send(JSON.stringify({ cmd: "start", device, side, train, profile }));
  }
  return {
    features: () =>
      score.current && performance.now() < score.current.expiresAt
        ? score.current.features
        : {},
    sampleMs: () => score.current?.sampleMs ?? null,
    devices,
    phase,
    message,
    calibration,
    start,
    retry: () => setAttempt((i) => i + 1),
    latest: () =>
      score.current && performance.now() < score.current.expiresAt
        ? score.current.level
        : null,
  };
}
