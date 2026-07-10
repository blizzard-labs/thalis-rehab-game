import { describe, it, expect } from "vitest";
import { RomTrialModel } from "./RomTrialModel";
import type { ScoreFrame } from "../scoring/intentScoreMessage";

function frame(deg: Partial<{ flex: number; abd: number; elbow: number }>, intent = 80): ScoreFrame {
  return {
    intentScore: intent, erdScore: null, classifierScore: null, kinematicScore: 60,
    compensationFlag: false, isArtifact: false, mode: "C", timestamp: 0,
    joints: {
      shoulderFlexionDeg: deg.flex ?? 0, shoulderAbductionDeg: deg.abd ?? 0,
      elbowDeg: deg.elbow ?? 0, poseValid: true,
    },
  };
}

describe("RomTrialModel", () => {
  it("first target is shoulder_flexion with the default target", () => {
    const m = new RomTrialModel();
    expect(m.current.joint).toBe("shoulder_flexion");
    expect(m.current.targetDeg).toBe(60);
  });

  it("reach reflects achieved/target of the current joint", () => {
    const m = new RomTrialModel();
    m.update(frame({ flex: 30 }), true, 0.1); // 30/60 = 0.5
    expect(m.reach).toBeCloseTo(0.5, 1);
  });

  it("collects after holding at/above target while engaged, then advances", () => {
    const m = new RomTrialModel();
    for (let t = 0; t < 8; t++) m.update(frame({ flex: 70 }), true, 0.1);
    expect(m.collected).toBe(1);
    expect(m.lastTrial?.joint).toBe("shoulder_flexion");
    for (let t = 0; t < 20; t++) m.update(frame({ flex: 0 }), false, 0.1);
    expect(m.current.joint).toBe("shoulder_abduction");
  });

  it("does NOT collect when not EEG-engaged even if angle is met", () => {
    const m = new RomTrialModel();
    for (let t = 0; t < 8; t++) m.update(frame({ flex: 70 }), false, 0.1);
    expect(m.collected).toBe(0);
  });

  it("uses provided per-patient targets over defaults", () => {
    const m = new RomTrialModel({ shoulder_flexion: 40 });
    expect(m.current.targetDeg).toBe(40);
  });

  it("absent pose (poseValid false) holds reach at 0, no collect", () => {
    const m = new RomTrialModel();
    const f = frame({ flex: 70 });
    f.joints = { ...f.joints!, poseValid: false };
    for (let t = 0; t < 8; t++) m.update(f, true, 0.1);
    expect(m.collected).toBe(0);
    expect(m.reach).toBe(0);
  });
});
