import { shoulder, withinNet } from "../reach/starGeometry";
import type { Side } from "./session";
export type Point = { x: number; y: number };
type Landmark = Point & { z: number; visibility?: number };
export type MotionSample = { point: Point; time: number };

export const maxReachDirections = 4;

/** Use actual recent frames so a single landmark jump cannot set a calibration point. */
export function medianWrist(
  samples: MotionSample[],
  now: number,
): MotionSample | null {
  const fresh = samples.filter((sample) => now - sample.time <= 480);
  if (fresh.length < 3) return null;
  function median(axis: "x" | "y") {
    const sorted = fresh
      .map((sample) => sample.point[axis])
      .sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return {
    point: { x: median("x"), y: median("y") },
    time: fresh[fresh.length - 1].time,
  };
}

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

export function distinctDirection(rest: Point, first: Point, next: Point) {
  const ax = first.x - rest.x,
    ay = first.y - rest.y;
  const bx = next.x - rest.x,
    by = next.y - rest.y;
  return (
    ax * bx + ay * by <=
    Math.cos(Math.PI / 6) * Math.hypot(ax, ay) * Math.hypot(bx, by)
  );
}

// Each target lies between rest and a position the player actually demonstrated.
// Leave more than a hoop diameter between consecutive short and long targets.
const distances = [1, 0.41, 0.94, 0.37, 0.98, 0.43, 0.96, 0.39];
export function cameraStarTrial(
  rest: Point,
  directions: Point[],
  wrist: Point | null,
  shot: number,
) {
  // Out-and-back order gives each direction both a long and a short reach.
  const sweep = shot % (directions.length * 2);
  const lane = Math.min(sweep, directions.length * 2 - 1 - sweep);
  const endpoint = directions[lane];
  const depth = distances[shot % distances.length];
  const target = {
    x: rest.x + (endpoint.x - rest.x) * depth,
    y: rest.y + (endpoint.y - rest.y) * depth,
  };
  const goal = wristInSky(rest, endpoint, target);
  const screenWrist = wrist && wristInSky(rest, endpoint, wrist);
  // Lateral motion is still movement. A hand held in the previous direction
  // should not count as resting just because the new target is perpendicular.
  const displacement = wrist && Math.hypot(wrist.x - rest.x, wrist.y - rest.y);
  const fullReach = Math.hypot(endpoint.x - rest.x, endpoint.y - rest.y);
  const shortestReach = Math.min(
    ...directions.map((p) => Math.hypot(p.x - rest.x, p.y - rest.y)),
  );
  return {
    // Score relative to this star. Small calibrated reaches keep their full input range.
    level:
      displacement === null
        ? null
        : Math.min(1, displacement / (fullReach * depth)),
    aim: { wrist: screenWrist, goal },
    onTarget: screenWrist !== null && withinNet(screenWrist, goal),
    atRest: displacement !== null && displacement < shortestReach * 0.25,
  };
}
