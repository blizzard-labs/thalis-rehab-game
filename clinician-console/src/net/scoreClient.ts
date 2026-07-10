import { parseIntentScoreMessage, type ScoreFrame } from "../scoring/intentScoreMessage";
import { parseEegQualityMessage, type EegQualityFrame } from "../scoring/eegQualityMessage";
import { parseVisionHealthMessage, type VisionHealthFrame } from "../scoring/visionHealthMessage";
import { parseCameraFrameMessage, type CameraFrame } from "../scoring/cameraFrameMessage";

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
  /** Optional: contact-quality / trace frames for the C2 setup screen. */
  onQuality?: (f: EegQualityFrame) => void;
  /** Optional: clinician-only camera-link health frames (V2-2c). */
  onVisionHealth?: (f: VisionHealthFrame) => void;
  /** Optional: clinician-only camera feed frames (JPEG + landmarks). */
  onCameraFrame?: (f: CameraFrame) => void;
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
      const raw = String(ev.data);
      const r = parseIntentScoreMessage(raw);
      if (r.ok) {
        opts.onFrame(r.frame);
        return;
      }
      const q = parseEegQualityMessage(raw);
      if (q.ok) {
        opts.onQuality?.(q.frame);
        return;
      }
      const v = parseVisionHealthMessage(raw);
      if (v.ok) {
        opts.onVisionHealth?.(v.frame);
        return;
      }
      const cf = parseCameraFrameMessage(raw);
      if (cf.ok) {
        opts.onCameraFrame?.(cf.frame);
        return;
      }
      dropped += 1;
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
