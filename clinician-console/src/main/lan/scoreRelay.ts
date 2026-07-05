export type RelaySocket = {
  onmessage: ((ev: { data: any }) => void) | null;
  onclose: ((ev?: any) => void) | null;
  onopen: ((ev?: any) => void) | null;
  send?(raw: string): void;
  close(): void;
};

export type ScoreRelayOptions = {
  sidecarWsUrl: string;
  createSocket: (url: string) => RelaySocket;
  send: (raw: string) => void;
  scheduler?: (fn: () => void, ms: number) => void;
  reconnectMs?: number;
};

export function createScoreRelay(opts: ScoreRelayOptions) {
  const schedule = opts.scheduler ?? ((fn, ms) => setTimeout(fn, ms));
  const reconnectMs = opts.reconnectMs ?? 1000;
  let socket: RelaySocket | null = null;
  let stopped = false;

  function open() {
    const s = opts.createSocket(opts.sidecarWsUrl);
    socket = s;
    s.onmessage = (ev) => {
      const raw = String(ev.data);
      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return;
      }
      if (parsed && parsed.type === "intent_score") opts.send(raw);
    };
    s.onclose = () => {
      socket = null;
      if (stopped) return;
      schedule(open, reconnectMs);
    };
  }

  return {
    connect() {
      stopped = false;
      open();
    },
    stop() {
      stopped = true;
      socket?.close();
    },
  };
}
