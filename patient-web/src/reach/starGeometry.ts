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

export function starGoals(side: "left" | "right"): Point[] {
  return [
    { x: 300, y: 124 },
    { x: side === "right" ? 490 : 110, y: 330 },
    { x: 300, y: 532 },
  ];
}

/** Give switch users a dwell at each direction, then swing the net to the next one. */
export function scanningWrist(
  seconds: number,
  gentle: boolean,
  side: "left" | "right",
  reducedMotion: boolean,
): Point {
  const beat = seconds / (gentle ? 2.5 : 1.5);
  const slot = Math.floor(beat) % 3;
  const points = starGoals(side);
  const t = Math.max(0, ((beat % 1) - 0.72) / 0.28);
  if (reducedMotion || t === 0) return points[slot];
  const sweep = t * t * (3 - 2 * t);
  const angle =
    ((slot - 1) * Math.PI) / 2 + sweep * (slot === 2 ? Math.PI : Math.PI / 2);
  const radius = (i: number) =>
    Math.hypot(points[i].x - shoulder.x, points[i].y - shoulder.y);
  const r = radius(slot) + (radius((slot + 1) % 3) - radius(slot)) * sweep;
  return {
    x: shoulder.x + (side === "left" ? -1 : 1) * r * Math.cos(angle),
    y: shoulder.y + r * Math.sin(angle),
  };
}
