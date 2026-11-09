import type { JointId } from "../reach/RomTrialModel";
import { useCallback, useEffect, useRef, useState } from "react";
import { createLanClient, type PairedSession } from "./lanClient";
import type { ConnectionState, WsLike } from "./scoreClient";
import { parseIntentScoreMessage } from "../scoring/intentScoreMessage";
import { ScoreStore } from "../scoring/scoreStore";
import { config } from "../config";
import type { SignalingMessage } from "./signaling";
import type { PatientCheckpoint } from "./checkpoint";

export type PatientLink = {
  store: ScoreStore;
  conn: ConnectionState;
  session: PairedSession | null;
  error: string | null;
  clinicianLive: boolean;
  paused: boolean;
  ended: boolean;
  wristTargets: Partial<Record<JointId,{x:number;y:number}>>;
  romTargets: Partial<Record<string, number>> | null;
  notify: (checkpoint: PatientCheckpoint) => void;
  sendSignaling: (msg: SignalingMessage) => void;
  subscribeSignaling: (fn: (msg: SignalingMessage) => void) => void;
};

/**
 * One persistent connection for the whole patient session, lifted above the
 * scenes so the score stream survives scene changes.
 *
 * With a pairing code (device launched from the console over the LAN) it dials
 * the LAN relay (`wssUrl`), pairs, and rides that same socket for scores — the
 * relay only fans the sidecar out to the *paired* socket, so tearing it down
 * between scenes is what left remote patients stuck at 0. Without a code
 * (dev/local) it dials the localhost sidecar directly, no handshake. Reconnects
 * with capped backoff so a sidecar blip or Wi-Fi hiccup recovers on its own.
 */
export function usePatientLink(
  code: string | null,
  wssUrl: string,
  createSocket?: (url: string) => WsLike,
): PatientLink {
  const storeRef = useRef(new ScoreStore());
  const [conn, setConn] = useState<ConnectionState>("connecting");
  const [session, setSession] = useState<PairedSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [ended, setEnded] = useState(false);
  const [clinicianLive, setClinicianLive] = useState(false);
  const [wristTargets,setWristTargets] = useState<PatientLink["wristTargets"]>({});
  const [romTargets, setRomTargets] = useState<Partial<Record<string, number>> | null>(null);
  const factoryRef = useRef(createSocket);
  factoryRef.current = createSocket;
  const clientRef = useRef<ReturnType<typeof createLanClient> | null>(null);
  const signalingSubRef = useRef<((m: SignalingMessage) => void) | null>(null);

  useEffect(() => {
    let stopped = false;
    const storageKey = "neuroreach-pair-" + code;
    let resumeToken: string | null = null;
    try { resumeToken = code && sessionStorage.getItem(storageKey); } catch { /* ephemeral browser */ }
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let client: ReturnType<typeof createLanClient> | null = null;
    const factory =
      factoryRef.current ?? ((url: string) => new WebSocket(url) as unknown as WsLike);

    const connect = () => {
      setConn(attempt === 0 ? "connecting" : "reconnecting");
      client = createLanClient({
        code,
        wssUrl,
        localhostUrl: config.wsUrl,
        resumeToken,
        onResumeToken: token => {
          resumeToken = token;
          try { sessionStorage.setItem(storageKey, token); } catch { /* reconnect in memory */ }
        },
        createSocket: factory,
        onScoreFrame: (raw) => {
          const r = parseIntentScoreMessage(raw);
          if (r.ok) storeRef.current.push(r.frame);
        },
        onPaired: (s) => {
          attempt = 0;
          setSession(s);
          setError(null);
          setConn("open");
        },
        onRomTargets: (targets) => {
          // rom_targets: { joint: { rest_deg, max_deg, target_deg } } -> { joint: target_deg }
          if (typeof targets !== "object" || targets === null) return;
          const out: Record<string, number> = {};
          const wrists: PatientLink["wristTargets"] = {};
          for (const [joint, v] of Object.entries(targets as Record<string, unknown>)) {
            if (!v || typeof v !== "object") continue;
            const point = (v as {target_wrist?: unknown}).target_wrist;
            if (["elbow_extension","shoulder_flexion","shoulder_abduction"].includes(joint)
              && Array.isArray(point) && point.length===2 && point.every(Number.isFinite)) {
              wrists[joint as JointId] = {x:point[0], y:point[1]};
            }
            const td = (v as { target_deg?: unknown })?.target_deg;
            if (typeof td === "number" && Number.isFinite(td)) out[joint] = td;
          }
          setWristTargets(wrists); setRomTargets(out);
        },
        onError: (reason) => setError(reason),
        onSignaling: (m) => signalingSubRef.current?.(m),
        onCheckpoint: (m) => {
          if (m.type !== "clinician-checkpoint") return;
          if (m.checkpoint === "go-live") setClinicianLive(true);
          if (m.checkpoint === "pause" || m.checkpoint === "resume") {
            storeRef.current.clear(); setPaused(m.checkpoint === "pause");
          }
          if (m.checkpoint === "end") {
            try { sessionStorage.removeItem(storageKey); } catch { /* ephemeral browser */ }
            endedRef.current = true; setEnded(true); storeRef.current.clear(); }
        },
        onClose: () => {
          storeRef.current.clear();
          if (stopped || endedRef.current) return;
          setConn("reconnecting");
          const delay = Math.min(500 * 2 ** attempt, 5000);
          attempt += 1;
          timer = setTimeout(connect, delay);
        },
      });
      clientRef.current = client;
      client.connect();
    };
    connect();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      client?.stop();
      clientRef.current = null;
    };
  }, [code, wssUrl]);

  // Stable identities: both only touch refs, so useCallback with no deps is
  // safe. Consumers (useCameraPublish) list these in a useEffect dep array — a
  // fresh identity each render would restart the WebRTC publisher on every
  // parent re-render, tearing down the live camera link mid-negotiation.
  const sendSignaling = useCallback(
    (msg: SignalingMessage) => clientRef.current?.send(JSON.stringify(msg)),
    [],
  );
  const subscribeSignaling = useCallback((fn: (m: SignalingMessage) => void) => {
    signalingSubRef.current = fn;
  }, []);
  const notify = useCallback(
    (checkpoint: PatientCheckpoint) =>
      clientRef.current?.send(JSON.stringify({ type: "patient-checkpoint", checkpoint })),
    [],
  );

  return {
    store: storeRef.current,
    conn,
    session,
    error,
    clinicianLive,
    paused, ended,
    wristTargets, romTargets,
    notify,
    sendSignaling,
    subscribeSignaling,
  };
}
