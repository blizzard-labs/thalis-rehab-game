import { shoulder } from "../reach/starGeometry";
import type { Side } from "./session";
export type Point = { x: number; y: number };
type Landmark = Point & { z: number; visibility?: number };
export type MotionSample = { point: Point; time: number };

export function wristOffset(pose: Landmark[], side: Side): Point | null {
  const offset = side === "right" ? 1 : 0;
  const [shoulder, wrist, hip] = [11, 15, 23].map((i) => pose[i + offset]);
  if ([shoulder, wrist, hip].some((p) => !p || (p.visibility ?? 0) < 0.5))
    return null;
  const torso = Math.hypot(
    shoulder.x - hip.x,
    shoulder.y - hip.y,
    shoulder.z - hip.z,
  );
  if (!Number.isFinite(torso) || torso < 0.02) return null;
  const point = {
    x: (wrist.x - shoulder.x) / torso,
    y: (wrist.y - shoulder.y) / torso,
  };
  return Number.isFinite(point.x) && Number.isFinite(point.y) ? point : null;
}

export function reachProgress(
  rest: Point,
  reach: Point,
  current: Point,
): number | null {
  const dx = reach.x - rest.x,
    dy = reach.y - rest.y;
  const length = dx * dx + dy * dy;
  if (length < 0.06 ** 2) return null;
  return Math.max(
    0,
    Math.min(
      1,
      ((current.x - rest.x) * dx + (current.y - rest.y) * dy) / length,
    ),
  );
}

/** Map displacement from this player's resting wrist to the original arm rig.
 * A comfortable reach spans 190 SVG units. Mirror x like the selfie preview. */
export function wristInSky(rest: Point, reach: Point, current: Point): Point {
  const scale = 190 / Math.hypot(reach.x - rest.x, reach.y - rest.y);
  return {
    x: shoulder.x - (current.x - rest.x) * scale,
    y: shoulder.y + (current.y - rest.y) * scale,
  };
}
