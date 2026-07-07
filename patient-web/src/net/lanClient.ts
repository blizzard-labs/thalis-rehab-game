import type { WsLike } from "./scoreClient";

export type PairedSession = {
  patientFirstName: string;
  affectedSide: "left" | "right";
  mode: string;
};

export type LanClientOptions = {
  code: string | null;
  wssUrl: string;
  localhostUrl: string;
  createSocket: (url: string) => WsLike;
  onScoreFrame: (raw: string) => void;
  onPaired: (session: PairedSession) => void;
  onError: (reason: string) => void;
  onClose?: () => void;
  scheduler?: (fn: () => void, ms: number) => void;
};

const DEV_SESSION: PairedSession = { patientFirstName: "Margaret", affectedSide: "left", mode: "band_power_only" };

export function createLanClient(opts: LanClientOptions) {
  let socket: WsLike | null = null;

  function open() {
    const url = opts.code ? opts.wssUrl : opts.localhostUrl;
    const s = opts.createSocket(url);
    socket = s;
    s.onopen = () => {
      if (opts.code) s.send?.(JSON.stringify({ type: "pair", code: opts.code }));
      else opts.onPaired(DEV_SESSION); // dev: localhost score socket, no pairing handshake
    };
    s.onmessage = (ev) => {
      const raw = String(ev.data);
      let msg: any;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (msg.type === "paired") opts.onPaired(msg.session as PairedSession);
      else if (msg.type === "error") opts.onError(msg.reason);
      else if (msg.type === "intent_score") opts.onScoreFrame(raw);
    };
    s.onclose = () => {
      socket = null;
      opts.onClose?.();
    };
  }

  return {
    connect() {
      open();
    },
    stop() {
      socket?.close();
    },
  };
}
