import { expect, it } from "vitest";
import { recordInterval, type Interval } from "./measurements";
import { poseAngles } from "../practice/motion";

it("splits weighted data at 30 seconds and keeps missing, manual and blended time distinct", () => {
  const rows: Interval[] = [];
  recordInterval(rows, 29.5, 30.5, "blended", 0.5, { input: 60, muC3: -10 });
  recordInterval(rows, 30.5, 31, "blended", 0.5, { elbow: 100 });
  recordInterval(rows, 31, 32, "button", 0.5, {});
  expect(rows.map((r) => [r.index, r.source, r.seconds, r.above])).toEqual([
    [0, "blended", 0.5, 0.5],
    [1, "blended", 1, 0.5],
    [1, "button", 1, 0],
  ]);
  expect(rows[1].metrics.muC3).toEqual({
    seconds: 0.5,
    integral: -5,
    peak: -10,
  });
  expect(rows[1].metrics.elbow?.seconds).toBe(0.5);
  expect(rows[2].metrics).toEqual({});
});

it("resolves only visible joint angles on the selected arm", () => {
  const pose = Array.from({ length: 33 }, () => ({
    x: 0,
    y: 0,
    z: 0,
    visibility: 1,
  }));
  pose[23].y = pose[24].y = 1;
  pose[13].x = pose[15].x = 1;
  pose[15].y = 1;
  expect(poseAngles(pose, "left")).toEqual({
    shoulder: 90,
    elbow: 90,
    tilt: 0,
  });
  pose[15].visibility = 0;
  expect(poseAngles(pose, "left").elbow).toBeUndefined();
  expect(poseAngles(pose, "right").shoulder).toBeUndefined();
});
