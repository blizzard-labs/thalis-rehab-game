import { describe, it, expect } from "vitest";
import { ReachModel } from "./ReachModel";

// Drive the model for `seconds` at a fixed intentUnit using small dt steps.
function drive(m: ReachModel, intentUnit: number, seconds: number, dt = 0.05) {
  for (let t = 0; t < seconds; t += dt) m.update(intentUnit, dt);
}

describe("ReachModel", () => {
  it("extends reach toward the intent unit", () => {
    const m = new ReachModel();
    expect(m.reach).toBe(0);
    drive(m, 0.9, 2);
    expect(m.reach).toBeGreaterThan(0.5);
    expect(m.reach).toBeLessThanOrEqual(1);
  });

  it("recedes gently (non-punitive), never snapping to zero in one step", () => {
    const m = new ReachModel();
    drive(m, 1.0, 2); // reach ~1
    const high = m.reach;
    m.update(0, 0.1); // one low-score tick
    expect(m.reach).toBeLessThan(high);
    expect(m.reach).toBeGreaterThan(0); // gentle, not a reset
  });

  it("collects a star once reach holds at/above the goal, incrementing collected", () => {
    const m = new ReachModel();
    expect(m.collected).toBe(0);
    // hold max reach well past HOLD_S
    let sawJustCollected = false;
    for (let t = 0; t < 3; t += 0.05) {
      m.update(1.0, 0.05);
      if (m.justCollected) sawJustCollected = true;
    }
    expect(sawJustCollected).toBe(true);
    expect(m.collected).toBeGreaterThanOrEqual(1);
  });

  it("justCollected is a one-tick pulse, not sticky", () => {
    const m = new ReachModel();
    // reach the goal and collect
    for (let t = 0; t < (ReachModel.HOLD_S + 0.5); t += 0.05) m.update(1.0, 0.05);
    // the immediately-following update with no new collect clears the flag
    const before = m.collected;
    m.update(0, 0.05); // drop score so no new collect this tick
    expect(m.justCollected).toBe(false);
    expect(m.collected).toBe(before);
  });

  it("raises the goal after a run of successes but stays within the band", () => {
    const m = new ReachModel();
    const start = m.goalFraction;
    // sustain max reach long enough for several collects
    drive(m, 1.0, 8);
    expect(m.goalFraction).toBeGreaterThan(start);
    expect(m.goalFraction).toBeLessThanOrEqual(ReachModel.GOAL_MAX);
  });

  it("lowers the goal after a sustained miss but not below the floor", () => {
    const m = new ReachModel();
    // push the goal up first
    drive(m, 1.0, 8);
    const raised = m.goalFraction;
    // now sustain a score well below the goal for longer than MISS_S
    drive(m, 0.1, ReachModel.MISS_S + 2);
    expect(m.goalFraction).toBeLessThan(raised);
    expect(m.goalFraction).toBeGreaterThanOrEqual(ReachModel.GOAL_MIN);
  });
});
