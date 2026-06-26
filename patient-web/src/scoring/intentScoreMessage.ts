export type ScoreFrame = {
  intentScore: number;
  erdScore: number | null;
  classifierScore: number | null;
  isArtifact: boolean;
  mode: string;
  timestamp: number;
};

export type ParseResult =
  | { ok: true; frame: ScoreFrame }
  | { ok: false; error: string };

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function parseIntentScoreMessage(raw: string): ParseResult {
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
  if (d.type !== "intent_score") {
    return { ok: false, error: `unexpected type: ${String(d.type)}` };
  }
  if (typeof d.intent_score !== "number" || !Number.isFinite(d.intent_score)) {
    return { ok: false, error: "missing or non-numeric intent_score" };
  }
  return {
    ok: true,
    frame: {
      intentScore: d.intent_score,
      erdScore: numOrNull(d.erd_score),
      classifierScore: numOrNull(d.classifier_score),
      isArtifact: Boolean(d.is_artifact),
      mode: typeof d.mode === "string" ? d.mode : "unknown",
      timestamp: typeof d.timestamp === "number" ? d.timestamp : 0,
    },
  };
}
