import { describe, it, expect } from "vitest";
import { lerp, minimumJerk, interpolatePoses } from "./interpolation";
import { getPose } from "./handPoses";

describe("lerp", () => {
  it("returns endpoints at t=0 and t=1", () => {
    expect(lerp(2, 10, 0)).toBe(2);
    expect(lerp(2, 10, 1)).toBe(10);
  });
  it("returns midpoint at t=0.5", () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
  });
});

describe("minimumJerk", () => {
  it("pins endpoints to 0 and 1", () => {
    expect(minimumJerk(0)).toBe(0);
    expect(minimumJerk(1)).toBeCloseTo(1, 10);
  });
  it("is symmetric around t=0.5 (=0.5)", () => {
    expect(minimumJerk(0.5)).toBeCloseTo(0.5, 10);
  });
});

describe("interpolatePoses", () => {
  it("equals start pose at t=0 and end pose at t=1", () => {
    const a = getPose("neutral");
    const b = getPose("open");
    const at0 = interpolatePoses(a, b, 0);
    const at1 = interpolatePoses(a, b, 1);
    expect(at0.index.mcp).toBeCloseTo(a.index.mcp, 10);
    expect(at1.index.mcp).toBeCloseTo(b.index.mcp, 10);
  });
  it("keeps all joints within [0,1]", () => {
    const mid = interpolatePoses(getPose("open"), getPose("closedGrasp"), 0.5);
    for (const finger of [mid.thumb, mid.index, mid.pinky]) {
      for (const v of Object.values(finger)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});
