import { describe, it, expect } from "vitest";
import { PlantGrowthModel } from "./PlantGrowthModel";

describe("PlantGrowthModel", () => {
  it("grows toward a high target, clamped to 1", () => {
    const p = new PlantGrowthModel();
    for (let i = 0; i < 100; i++) p.update(1, 0.05);
    expect(p.currentGrowth).toBe(1);
  });
  it("wilts more slowly than it grows (asymmetry)", () => {
    const grow = new PlantGrowthModel();
    grow.update(1, 0.1); // +0.08
    const wilt = new PlantGrowthModel();
    wilt.update(1, 1); // saturate toward 1 first
    const before = wilt.currentGrowth;
    wilt.update(0, 0.1); // -0.03
    expect(grow.currentGrowth).toBeCloseTo(0.08, 5);
    expect(before - wilt.currentGrowth).toBeCloseTo(0.03, 5);
  });
  it("blooms only after >=3s dwell above 0.75 and clears below 0.60", () => {
    const p = new PlantGrowthModel();
    // 25 steps × 0.05 s = 1.25 s simulated; current reaches exactly 1.0 but
    // dwell above 0.75 is only ~0.35 s (steps 18–24) — well below BLOOM_DWELL_S.
    // (Brief used 100 steps, which accumulated >3 s of dwell and accidentally
    // triggered bloom before the assertion — diverges from the C# reference test.)
    for (let i = 0; i < 25; i++) p.update(1, 0.05); // pin near 1
    expect(p.isBloom).toBe(false);
    p.update(1, 3.0); // accumulate dwell
    expect(p.isBloom).toBe(true);
    p.update(0.65, 1); // between off and on → hysteresis holds bloom
    expect(p.isBloom).toBe(true);
    for (let i = 0; i < 50; i++) p.update(0, 0.1); // drive below 0.60
    expect(p.isBloom).toBe(false);
  });
  it("resets to seed state", () => {
    const p = new PlantGrowthModel();
    for (let i = 0; i < 100; i++) p.update(1, 0.05);
    p.reset();
    expect(p.currentGrowth).toBe(0);
    expect(p.isBloom).toBe(false);
  });
});
