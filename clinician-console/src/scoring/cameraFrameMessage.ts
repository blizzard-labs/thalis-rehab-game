// Parser for the sidecar's clinician-only `camera_frame` frame (~12 Hz): a
// base64 JPEG of the patient camera + MediaPipe landmarks for the console
// overlay. Defensive like the score/quality/vision parsers: never throw on a
// bad frame. Clinician-only — this never rides the patient LAN channel.

export type CameraLandmarks = {
  pose: number[][];
  hands: { left: number[][] | null; right: number[][] | null };
};

export type CameraFrame = {
  jpeg: string;
  landmarks: CameraLandmarks;
  fps: number;
  timestamp: number;
};

export type CameraFrameParseResult =
  | { ok: true; frame: CameraFrame }
  | { ok: false; error: string };

function toRows(v: unknown): number[][] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(Array.isArray)
    .map((row) => (row as unknown[]).filter((n): n is number => typeof n === "number"));
}

export function parseCameraFrameMessage(raw: string): CameraFrameParseResult {
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
  if (d.type !== "camera_frame") {
    return { ok: false, error: `unexpected type: ${String(d.type)}` };
  }
  const lm = (d.landmarks ?? {}) as Record<string, unknown>;
  const hands = (lm.hands ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    frame: {
      jpeg: typeof d.jpeg === "string" ? d.jpeg : "",
      landmarks: {
        pose: toRows(lm.pose),
        hands: {
          left: hands.left == null ? null : toRows(hands.left),
          right: hands.right == null ? null : toRows(hands.right),
        },
      },
      fps: typeof d.fps === "number" && Number.isFinite(d.fps) ? d.fps : 0,
      timestamp: typeof d.timestamp === "number" ? d.timestamp : 0,
    },
  };
}
