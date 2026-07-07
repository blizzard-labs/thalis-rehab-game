import type { RelaySocket } from "./scoreRelay";

const SIGNALING_TYPES = new Set(["webrtc-offer", "webrtc-answer", "webrtc-ice"]);

export type SignalingRelayOptions = {
  sidecarWsUrl: string;
  createSocket: (url: string) => RelaySocket;
  sendToPatient: (raw: string) => void;
  scheduler?: (fn: () => void, ms: number) => void;
  reconnectMs?: number;
};

// Bidirectional carrier: patient webrtc-* -> sidecar, sidecar webrtc-* -> patient.
// Kept separate from scoreRelay (one-way intent_score) to preserve one clear
// responsibility per relay.
export function createSignalingRelay(opts: SignalingRelayOptions) {
  const schedule = opts.scheduler ?? ((fn, ms) => setTimeout(fn, ms));
  const reconnectMs = opts.reconnectMs ?? 1000;
  let socket: RelaySocket | null = null;
  let ready = false;
  let stopped = false;
  // Patient offer/ice can arrive before the localhost sidecar socket finishes
  // opening; queue until it does, then drain (mirrors the control-socket outbox).
  const outbox: string[] = [];

  function open() {
    const s = opts.createSocket(opts.sidecarWsUrl);
    socket = s;
    ready = false;
    s.onopen = () => {
      ready = true;
      while (outbox.length) s.send?.(outbox.shift()!);
    };
    s.onmessage = (ev) => {
      const raw = String(ev.data);
      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return;
      }
      if (parsed && SIGNALING_TYPES.has(parsed.type)) opts.sendToPatient(raw);
    };
    s.onclose = () => {
      socket = null;
      ready = false;
      if (stopped) return;
      schedule(open, reconnectMs);
    };
  }

  return {
    connect() {
      stopped = false;
      open();
    },
    sendToSidecar(raw: string) {
      if (!ready || !socket) {
        outbox.push(raw);
        return;
      }
      socket.send?.(raw);
    },
    stop() {
      stopped = true;
      socket?.close();
    },
  };
}
