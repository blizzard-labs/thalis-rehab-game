import { describe, it, expect } from "vitest";
import { ikArm } from "./ikArm";

describe("ikArm", () => {
  it("reaches straight down when the target is directly below at full length", () => {
    const { wrist } = ikArm({ shoulder: { x: 0, y: 0 }, target: { x: 0, y: 250 },
      upperLen: 130, foreLen: 120, bendSign: 1 });
    expect(wrist.x).toBeCloseTo(0, 3);
    expect(wrist.y).toBeCloseTo(250, 3);
  });

  it("clamps an out-of-reach target to arm length along its direction", () => {
    const { wrist } = ikArm({ shoulder: { x: 0, y: 0 }, target: { x: 0, y: 900 },
      upperLen: 130, foreLen: 120, bendSign: 1 });
    expect(wrist.y).toBeCloseTo(250, 0); // clamped to 130+120
  });

  it("bends the elbow off the shoulder→wrist line for a mid-range target", () => {
    const { elbow } = ikArm({ shoulder: { x: 0, y: 0 }, target: { x: 0, y: 150 },
      upperLen: 130, foreLen: 120, bendSign: 1 });
    expect(Math.abs(elbow.x)).toBeGreaterThan(1); // not collinear
  });
});
