import { expect, it } from "vitest";
import { wristOffset, reachProgress } from "./motion";
it("normalizes the selected wrist against the shoulder and hip", () => {
  const pose = Array.from({length:33}, () => ({ x:0,y:0,z:0,visibility:0 }));
  pose[12] = {x:.6,y:.2,z:0,visibility:1};
  pose[16] = {x:.8,y:.1,z:0,visibility:1};
  pose[24] = {x:.6,y:.6,z:0,visibility:1};
  expect(wristOffset(pose, "left")).toBeNull();
  expect(wristOffset(pose, "right")?.x).toBeCloseTo(.5);
  expect(wristOffset(pose, "right")?.y).toBeCloseTo(-.25);
});
it("supports small personalized movements and rejects indistinguishable poses", () => {
  const rest = {x:1,y:1}, reach = {x:.9,y:.9};
  expect(reachProgress(rest, reach, {x:.95,y:.95})).toBeCloseTo(.5);
  expect(reachProgress(rest, rest, reach)).toBeNull();
});
