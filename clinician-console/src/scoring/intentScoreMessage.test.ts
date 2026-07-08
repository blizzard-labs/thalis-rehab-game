import { describe, it, expect } from "vitest";
import { parseIntentScoreMessage } from "./intentScoreMessage";

const valid = JSON.stringify({
  type: "intent_score",
  intent_score: 72.3,
  erd_score: 68.1,
  classifier_score: null,
  is_artifact: false,
  mode: "band_power_only",
  timestamp: 1719261000.5,
});

describe("parseIntentScoreMessage", () => {
  it("parses a valid frame", () => {
    const r = parseIntentScoreMessage(valid);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.frame.intentScore).toBeCloseTo(72.3);
      expect(r.frame.erdScore).toBeCloseTo(68.1);
      expect(r.frame.classifierScore).toBeNull();
      expect(r.frame.isArtifact).toBe(false);
      expect(r.frame.mode).toBe("band_power_only");
      expect(r.frame.timestamp).toBeCloseTo(1719261000.5);
    }
  });

  it("rejects malformed JSON", () => {
    const r = parseIntentScoreMessage("{not json");
    expect(r.ok).toBe(false);
  });

  it("rejects wrong type (e.g. server error frame)", () => {
    const r = parseIntentScoreMessage(JSON.stringify({ type: "error", message: "x" }));
    expect(r.ok).toBe(false);
  });

  it("rejects missing intent_score", () => {
    const r = parseIntentScoreMessage(JSON.stringify({ type: "intent_score", mode: "band_power_only" }));
    expect(r.ok).toBe(false);
  });

  it("passes through null erd_score and coerces is_artifact", () => {
    const raw = JSON.stringify({
      type: "intent_score",
      intent_score: 10,
      erd_score: null,
      classifier_score: 0.7,
      is_artifact: true,
      mode: "band_power_only",
      timestamp: 1,
    });
    const r = parseIntentScoreMessage(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.frame.erdScore).toBeNull();
      expect(r.frame.classifierScore).toBeCloseTo(0.7);
      expect(r.frame.isArtifact).toBe(true);
    }
  });
});

describe("parseIntentScoreMessage kinematic fields (V2-2b)", () => {
  it("parses kinematic_score and compensation_flag when present", () => {
    const raw = JSON.stringify({
      type: "intent_score", intent_score: 60, erd_score: 40, classifier_score: null,
      is_artifact: false, mode: "band_power_only", kinematic_score: 72.5,
      compensation_flag: true, timestamp: 123,
    });
    const res = parseIntentScoreMessage(raw);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.frame.kinematicScore).toBe(72.5);
      expect(res.frame.compensationFlag).toBe(true);
    }
  });
  it("defaults kinematic fields when absent (back-compat)", () => {
    const raw = JSON.stringify({
      type: "intent_score", intent_score: 60, is_artifact: false,
      mode: "band_power_only", timestamp: 1,
    });
    const res = parseIntentScoreMessage(raw);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.frame.kinematicScore).toBe(null);
      expect(res.frame.compensationFlag).toBe(false);
    }
  });
});
