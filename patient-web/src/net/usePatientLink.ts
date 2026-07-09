import { useCallback, useEffect, useRef, useState } from "react";
import { createLanClient, type PairedSession } from "./lanClient";
import type { ConnectionState, WsLike } from "./scoreClient";
import { parseIntentScoreMessage } from "../scoring/intentScoreMessage";
import { ScoreStore } from "../scoring/scoreStore";
import { config } from "../config";
import type { SignalingMessage } from "./signaling";

export type PatientLink = {
  store: ScoreStore;
  conn: ConnectionState;
  session: PairedSession | null;
  error: string | null;
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
  const factoryRef = useRef(createSocket);
  factoryRef.current = createSocket;
  const clientRef = useRef<ReturnType<typeof createLanClient> | null>(null);
  const signalingSubRef = useRef<((m: SignalingMessage) => void) | null>(null);

  useEffect(() => {
    let stopped = false;
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
        onError: (reason) => setError(reason),
        onSignaling: (m) => signalingSubRef.current?.(m),
        onClose: () => {
          if (stopped) return;
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

  return {
    store: storeRef.current,
    conn,
    session,
    error,
    sendSignaling,
    subscribeSignaling,
  };
}
