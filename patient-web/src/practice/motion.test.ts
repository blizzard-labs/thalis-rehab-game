import { netRadius } from "../reach/starGeometry";
import { expect, it } from "vitest";
import {
  cameraStarTrial,
  distinctDirection,
  wristOffset,
  reachProgress,
  wristInSky,
} from "./motion";
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

it("alternates catch distances inside a single calibrated reach and rejects the old endpoint", () => {
  const rest = { x: 0, y: 0 },
    reach = { x: 1, y: 0 };
  expect(cameraStarTrial(rest, [reach], reach, 0).onTarget).toBe(true);
  const near = cameraStarTrial(rest, [reach], reach, 1);
  expect(near.onTarget).toBe(false);
  const halfway = cameraStarTrial(rest, [reach], { x: 0.41, y: 0 }, 1);
  expect(halfway.onTarget).toBe(true);
  expect(halfway.level).toBeCloseTo(1);
  let previous = cameraStarTrial(rest, [reach], null, 0).aim.goal;
  for (let shot = 1; shot <= 8; shot++) {
    const { goal } = cameraStarTrial(rest, [reach], null, shot).aim;
    expect(
      Math.hypot(goal.x - previous.x, goal.y - previous.y),
    ).toBeGreaterThan(2 * netRadius);
    previous = goal;
  }
  expect(cameraStarTrial(rest, [reach], null, 1).onTarget).toBe(false);
});

it("uses both captured directions and distinguishes an off-axis wrist from rest", () => {
  const rest = { x: 0, y: 0 },
    first = { x: 0.2, y: 0 },
    second = { x: 0, y: -1 };
  expect(distinctDirection(rest, first, second)).toBe(true);
  expect(distinctDirection(rest, first, { x: 0.5, y: 0.02 })).toBe(false);
  const directions = [first, second];
  const held = cameraStarTrial(rest, directions, first, 1);
  expect(held.onTarget).toBe(false);
  expect(held.atRest).toBe(false);
  expect(held.aim.goal.x).toBe(300);
  expect(
    cameraStarTrial(rest, directions, { x: 0, y: -0.41 }, 1).onTarget,
  ).toBe(true);
});
