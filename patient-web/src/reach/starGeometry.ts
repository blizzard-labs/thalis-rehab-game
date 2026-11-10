import { ikArm } from "./ikArm";

export type Point = { x: number; y: number };
export const shoulder = { x: 300, y: 330 };
export const netRadius = 46;

export function toScreen(point: Point): Point {
  return { x: shoulder.x + point.x * 200, y: shoulder.y - point.y * 200 };
}

export function armAt(target: Point, side: "left" | "right") {
  return ikArm({
    shoulder,
    target,
    upperLen: 130,
    foreLen: 120,
    bendSign: side === "left" ? -1 : 1,
  });
}

export function withinNet(point: Point, goal: Point) {
  return Math.hypot(point.x - goal.x, point.y - goal.y) <= netRadius;
}

/** Give switch users a dwell at each direction, then swing the net to the next one. */
export function scanningWrist(
  seconds: number,
  gentle: boolean,
  points: Point[],
  reducedMotion: boolean,
): Point {
  const beat = seconds / (gentle ? 2.5 : 1.5);
  const slot = Math.floor(beat) % 3;
  const t = Math.max(0, ((beat % 1) - 0.72) / 0.28);
  if (reducedMotion || t === 0) return points[slot];
  const sweep = t * t * (3 - 2 * t);
  const from = points[slot],
    to = points[(slot + 1) % points.length];
  return {
    x: from.x + (to.x - from.x) * sweep,
    y: from.y + (to.y - from.y) * sweep,
  };
}
