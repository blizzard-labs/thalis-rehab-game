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
  it("parses joints when present and null when absent", () => {
    const withJoints = JSON.stringify({
      type: "intent_score", intent_score: 50,
      joints: { shoulder_flexion_deg: 40, shoulder_abduction_deg: 88, elbow_deg: 150, pose_valid: true },
    });
    const r = parseIntentScoreMessage(withJoints);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.frame.joints?.shoulderAbductionDeg).toBe(88);
      expect(r.frame.joints?.poseValid).toBe(true);
    }
    const noJoints = parseIntentScoreMessage(JSON.stringify({ type: "intent_score", intent_score: 50 }));
    expect(noJoints.ok && noJoints.frame.joints).toBeNull();
  });
});
