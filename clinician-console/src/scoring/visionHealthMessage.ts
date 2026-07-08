// Parser for the sidecar's clinician-only `vision_health` frame (V2-2c, ~2 Hz).
// Defensive like the score/quality parsers: never throw on a bad frame.

export type VisionHealthFrame = {
  connection: string;
  fps: number;
  kinematicActive: boolean;
  degraded: boolean;
  timestamp: number;
};

export type VisionHealthParseResult =
  | { ok: true; frame: VisionHealthFrame }
  | { ok: false; error: string };

export function parseVisionHealthMessage(raw: string): VisionHealthParseResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: "malformed JSON" };
  }
  if (typeof data !== "object" || data === null) {
    return { ok: false, error: "not an object" };
  }
  const d = data as Record<string, unknown>;
  if (d.type !== "vision_health") {
    return { ok: false, error: `unexpected type: ${String(d.type)}` };
  }
  return {
    ok: true,
    frame: {
      connection: typeof d.connection === "string" ? d.connection : "closed",
      fps: typeof d.fps === "number" && Number.isFinite(d.fps) ? d.fps : 0,
      kinematicActive: Boolean(d.kinematic_active),
      degraded: Boolean(d.degraded),
      timestamp: typeof d.timestamp === "number" ? d.timestamp : 0,
    },
  };
}
