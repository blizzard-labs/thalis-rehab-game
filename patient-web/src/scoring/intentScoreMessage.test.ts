import { describe, it, expect } from "vitest";
import { parseIntentScoreMessage } from "./intentScoreMessage";

const valid = JSON.stringify({
  type: "intent_score",
  intent_score: 72.3,
  erd_score: 68.1,
  classifier_score: null,
  is_artifact: false,
  mode: "band_power_only",
  timestamp: 123.4,
});

describe("parseIntentScoreMessage", () => {
  it("parses a valid frame", () => {
    const r = parseIntentScoreMessage(valid);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.frame.intentScore).toBeCloseTo(72.3);
      expect(r.frame.classifierScore).toBeNull();
      expect(r.frame.mode).toBe("band_power_only");
      expect(r.frame.isArtifact).toBe(false);
    }
  });
  it("rejects malformed JSON", () => {
    expect(parseIntentScoreMessage("{nope").ok).toBe(false);
  });
  it("rejects the wrong message type", () => {
    expect(parseIntentScoreMessage(JSON.stringify({ type: "eeg_quality" })).ok).toBe(false);
  });
  it("rejects a missing/non-numeric intent_score", () => {
    expect(parseIntentScoreMessage(JSON.stringify({ type: "intent_score" })).ok).toBe(false);
  });
});
