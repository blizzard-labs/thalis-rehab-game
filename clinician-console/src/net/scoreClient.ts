import { parseIntentScoreMessage, type ScoreFrame } from "../scoring/intentScoreMessage";

export type ConnectionState = "connecting" | "open" | "reconnecting" | "closed";

export type WsLike = {
  onopen: ((ev: any) => void) | null;
  onclose: ((ev: any) => void) | null;
  onmessage: ((ev: { data: any }) => void) | null;
  onerror: ((ev: any) => void) | null;
  close(): void;
};

export type ScoreClientOptions = {
  url: string;
  createSocket: (url: string) => WsLike;
  onFrame: (f: ScoreFrame) => void;
  onState: (s: ConnectionState) => void;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  scheduler?: (fn: () => void, ms: number) => void;
};

export function createScoreClient(opts: ScoreClientOptions) {
  const base = opts.backoffBaseMs ?? 500;
  const max = opts.backoffMaxMs ?? 5000;
  const schedule = opts.scheduler ?? ((fn, ms) => setTimeout(fn, ms));

  let socket: WsLike | null = null;
  let stopped = false;
  let attempt = 0;
  let dropped = 0;

  function open() {
    opts.onState(attempt === 0 ? "connecting" : "reconnecting");
    const s = opts.createSocket(opts.url);
    socket = s;
    s.onopen = () => {
      attempt = 0;
      opts.onState("open");
    };
    s.onmessage = (ev) => {
      const r = parseIntentScoreMessage(String(ev.data));
      if (r.ok) opts.onFrame(r.frame);
      else dropped += 1;
    };
    s.onerror = () => {
      /* close handler drives reconnect */
    };
    s.onclose = () => {
      socket = null;
      if (stopped) return;
      opts.onState("reconnecting");
      const delay = Math.min(base * Math.pow(2, attempt), max);
      attempt += 1;
      schedule(open, delay);
    };
  }

  return {
    connect() {
      stopped = false;
      attempt = 0;
      open();
    },
    stop() {
      stopped = true;
      socket?.close();
      opts.onState("closed");
    },
    droppedCount() {
      return dropped;
    },
  };
}
