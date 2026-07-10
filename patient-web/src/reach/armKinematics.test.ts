import { describe, it, expect } from "vitest";
import { fkArm } from "./armKinematics";

const near = (a: number, b: number, eps = 0.5) => Math.abs(a - b) < eps;

describe("fkArm", () => {
  it("arm hanging straight down (elevation 0, elbow straight) drops in +Y", () => {
    const { elbow, wrist } = fkArm({
      shoulder: { x: 100, y: 100 }, shoulderElevationDeg: 0, elbowDeg: 180,
      upperLen: 50, foreLen: 50, mirror: false,
    });
    expect(near(elbow.x, 100)).toBe(true);
    expect(near(elbow.y, 150)).toBe(true);
    expect(near(wrist.y, 200)).toBe(true);
  });

  it("elevation 90 raises the upper arm to horizontal (+X, not mirrored)", () => {
    const { elbow } = fkArm({
      shoulder: { x: 100, y: 100 }, shoulderElevationDeg: 90, elbowDeg: 180,
      upperLen: 50, foreLen: 50, mirror: false,
    });
    expect(near(elbow.x, 150)).toBe(true);
    expect(near(elbow.y, 100)).toBe(true);
  });

  it("mirror flips the horizontal direction", () => {
    const { elbow } = fkArm({
      shoulder: { x: 100, y: 100 }, shoulderElevationDeg: 90, elbowDeg: 180,
      upperLen: 50, foreLen: 50, mirror: true,
    });
    expect(near(elbow.x, 50)).toBe(true);
  });

  it("a bent elbow (90) folds the forearm relative to the upper arm", () => {
    const { elbow, wrist } = fkArm({
      shoulder: { x: 100, y: 100 }, shoulderElevationDeg: 0, elbowDeg: 90,
      upperLen: 50, foreLen: 50, mirror: false,
    });
    expect(near(Math.abs(wrist.x - elbow.x), 50)).toBe(true);
  });
});
