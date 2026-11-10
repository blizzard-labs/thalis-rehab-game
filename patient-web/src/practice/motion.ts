import { netRadius, shoulder } from "../reach/starGeometry";
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
  const fresh = samples.filter((sample) => now - sample.time <= 1200);
  if (fresh.length < 3 || now - fresh[fresh.length - 1].time > 500) return null;
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
function cameraTarget(rest: Point, directions: Point[], shot: number) {
  // Out-and-back order gives each direction both a long and a short reach.
  const sweep = shot % (directions.length * 2);
  const lane = Math.min(sweep, directions.length * 2 - 1 - sweep);
  const endpoint = directions[lane];
  const depth = distances[shot % distances.length];
  const target = {
    x: rest.x + (endpoint.x - rest.x) * depth,
    y: rest.y + (endpoint.y - rest.y) * depth,
  };
  return { endpoint, goal: wristInSky(rest, endpoint, target), depth };
}

export function cameraStarTrial(
  rest: Point,
  directions: Point[],
  wrist: Point | null,
  shot: number,
  lastCaught = shot - 1,
) {
  const { endpoint, goal, depth } = cameraTarget(rest, directions, shot);
  const screenWrist = wrist && wristInSky(rest, endpoint, wrist);
  const distance = screenWrist
    ? Math.hypot(screenWrist.x - goal.x, screenWrist.y - goal.y)
    : Infinity;
  // Test departure in the captured star's own calibration. Different directions
  // can have very different comfortable lengths.
  let cleared = lastCaught < 0;
  if (!cleared && wrist) {
    const previous = cameraTarget(rest, directions, lastCaught);
    const inPreviousLane = wristInSky(rest, previous.endpoint, wrist);
    cleared =
      Math.hypot(
        inPreviousLane.x - previous.goal.x,
        inPreviousLane.y - previous.goal.y,
      ) >
      netRadius + 8;
  }
  const relativeDistance =
    screenWrist &&
    Math.hypot(screenWrist.x - shoulder.x, screenWrist.y - shoulder.y) / 190;
  return {
    level:
      relativeDistance === null ? null : Math.min(1, relativeDistance / depth),
    aim: { wrist: screenWrist, goal },
    onTarget: distance <= netRadius,
    nearTarget: distance <= netRadius + 8,
    cleared,
  };
}

/** Relative angles in MediaPipe world coordinates. An obscured joint supplies no angle. */
export function poseAngles(world: Landmark[], side: Side) {
  const offset = side === "right" ? 1 : 0;
  const [hip, shoulder, elbow, wrist] = [23, 11, 13, 15].map(
    (i) => world[i + offset],
  );
  const visible = (p: Landmark | undefined) =>
    p && (p.visibility ?? 0) >= 0.5 && [p.x, p.y, p.z].every(Number.isFinite);
  const angle = (a: Landmark, b: Landmark, c: Landmark) => {
    if (!visible(a) || !visible(b) || !visible(c)) return undefined;
    const u = [a.x - b.x, a.y - b.y, a.z - b.z],
      v = [c.x - b.x, c.y - b.y, c.z - b.z];
    const scale = Math.hypot(...u) * Math.hypot(...v);
    if (scale < 0.0001) return undefined;
    const cosine = u.reduce((dot, value, i) => dot + value * v[i], 0) / scale;
    return (Math.acos(Math.min(1, Math.max(-1, cosine))) * 180) / Math.PI;
  };
  let tilt: number | undefined;
  if ([11, 12, 23, 24].every((i) => visible(world[i]))) {
    const dx = world[11].x + world[12].x - world[23].x - world[24].x;
    const dy = world[23].y + world[24].y - world[11].y - world[12].y;
    if (Math.hypot(dx, dy) > 0.04)
      tilt = (Math.abs(Math.atan2(dx, dy)) * 180) / Math.PI;
  }
  return {
    shoulder: angle(hip, shoulder, elbow),
    elbow: angle(shoulder, elbow, wrist),
    tilt,
  };
}
