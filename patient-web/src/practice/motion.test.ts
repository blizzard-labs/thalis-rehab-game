import { expect, it } from "vitest";
import { wristOffset, reachProgress, wristInSky } from "./motion";
it("normalizes the selected wrist against the shoulder and hip", () => {
  const pose = Array.from({ length: 33 }, () => ({
    x: 0,
    y: 0,
    z: 0,
    visibility: 0,
  }));
  pose[12] = { x: 0.6, y: 0.2, z: 0, visibility: 1 };
  pose[16] = { x: 0.8, y: 0.1, z: 0, visibility: 1 };
  pose[24] = { x: 0.6, y: 0.6, z: 0, visibility: 1 };
  expect(wristOffset(pose, "left")).toBeNull();
  expect(wristOffset(pose, "right")?.x).toBeCloseTo(0.5);
  expect(wristOffset(pose, "right")?.y).toBeCloseTo(-0.25);
});
it("supports small personalized movements and rejects indistinguishable poses", () => {
  const rest = { x: 1, y: 1 },
    reach = { x: 0.9, y: 0.9 };
  expect(reachProgress(rest, reach, { x: 0.95, y: 0.95 })).toBeCloseTo(0.5);
  expect(reachProgress(rest, rest, reach)).toBeNull();
});

it("moves the displayed wrist toward the player's mirrored calibrated star", () => {
  const rest = { x: 0.1, y: 0.4 },
    reach = { x: -0.1, y: 0.4 };
  expect(wristInSky(rest, reach, rest)).toEqual({ x: 300, y: 330 });
  expect(wristInSky(rest, reach, reach)).toEqual({ x: 490, y: 330 });
});
