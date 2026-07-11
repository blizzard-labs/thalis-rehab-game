import { describe, it, expect } from "vitest";
import { RomTrialModel, REACH_MAG, REACH_MAG_SIDE } from "./RomTrialModel";
import type { ScoreFrame } from "../scoring/intentScoreMessage";

const frame = (dx: number, dy: number): ScoreFrame => ({
  intentScore: 90, erdScore: null, classifierScore: null, kinematicScore: 60,
  compensationFlag: false, isArtifact: false, mode: "C", timestamp: 0,
  joints: { shoulderFlexionDeg: 0, shoulderAbductionDeg: 0, elbowDeg: 0,
    wristDx: dx, wristDy: dy, poseValid: true },
});

describe("RomTrialModel (directional)", () => {
  it("first trial is reach-up; reach saturates when the wrist is on the up goal", () => {
    const m = new RomTrialModel("right");
    expect(m.current.dir).toBe("up");
    m.update(frame(0, -REACH_MAG), true, 0.1); // straight up, full magnitude
    expect(m.reach).toBeGreaterThan(0.9);
  });

  it("does not saturate the up trial when the wrist goes sideways", () => {
    const m = new RomTrialModel("right");
    m.update(frame(REACH_MAG, 0), true, 0.1); // sideways, not up
    expect(m.reach).toBeLessThan(0.5);
  });

  it("collects the up star after holding on-goal while engaged, then advances to side", () => {
    const m = new RomTrialModel("right");
    for (let i = 0; i < 20; i++) m.update(frame(0, -REACH_MAG), true, 0.1);
    expect(m.collected).toBeGreaterThanOrEqual(1);
    expect(m.current.dir).toBe("side");
  });

  it("does not collect while EEG-disengaged even if on-goal", () => {
    const m = new RomTrialModel("right");
    for (let i = 0; i < 10; i++) m.update(frame(0, -REACH_MAG), false, 0.1);
    expect(m.collected).toBe(0);
  });

  it("collects the side star from a partial lateral reach (forgiving capture)", () => {
    const m = new RomTrialModel("right");
    for (let i = 0; i < 20; i++) m.update(frame(0, -REACH_MAG), true, 0.1); // collect up, advance to side
    expect(m.current.dir).toBe("side");
    // hand reaches partway to the side goal (short of full magnitude)
    for (let i = 0; i < 10; i++) m.update(frame(REACH_MAG_SIDE - 0.2, 0), true, 0.1);
    expect(m.collected).toBeGreaterThanOrEqual(2);
  });

  it("places the side goal toward the affected side (left → negative x)", () => {
    const mL = new RomTrialModel("left");
    // advance to the side trial
    for (let i = 0; i < 20; i++) mL.update(frame(0, -REACH_MAG), true, 0.1);
    expect(mL.current.dir).toBe("side");
    expect(mL.current.goal.x).toBeLessThan(0);
  });
});
