import { shoulder, type Point } from "../reach/starGeometry";
import type { Side } from "./session";

export const skies = [
  {
    name: "The Kite",
    strokes: [
      [0, 1, 2, 3, 0],
      [3, 4, 5],
      [1, 3],
    ],
    dots: [
      [12, 35],
      [57, 7],
      [94, 33],
      [53, 51],
      [34, 67],
      [10, 80],
    ],
  },
  {
    name: "The Sailboat",
    strokes: [
      [0, 1, 2, 3, 0],
      [4, 5, 0],
      [5, 1],
    ],
    dots: [
      [8, 52],
      [94, 52],
      [75, 75],
      [27, 75],
      [51, 52],
      [51, 7],
    ],
  },
  {
    name: "The Crown",
    strokes: [[0, 1, 2, 3, 4, 5, 6, 0]],
    dots: [
      [8, 21],
      [26, 48],
      [53, 8],
      [78, 48],
      [97, 21],
      [84, 75],
      [22, 75],
    ],
  },
];
const cycleLength = skies.reduce((n, sky) => n + sky.dots.length, 0);

/** Each full trip through the catalog earns another copy of every constellation. */
export function completedConstellationCount(stars: number) {
  let count = Math.floor(stars / cycleLength) * skies.length;
  let remaining = stars % cycleLength;
  for (const sky of skies) {
    if (remaining < sky.dots.length) break;
    remaining -= sky.dots.length;
    count++;
  }
  return count;
}

/** Show a segment once both its endpoint stars have been caught. */
export function chartPath(sky: (typeof skies)[number], lit = sky.dots.length) {
  const segments: string[] = [];
  for (const stroke of sky.strokes) {
    for (let i = 1; i < stroke.length; i++) {
      const a = stroke[i - 1],
        b = stroke[i];
      if (a < lit && b < lit)
        segments.push(`M${sky.dots[a].join(" ")}L${sky.dots[b].join(" ")}`);
    }
  }
  return segments.join(" ");
}

export function scanTargetSlot(shot: number) {
  return (shot * 2 + 1) % 3;
}

/** The session ID and catch count are already checkpointed, so a recovered
 * display sees exactly the same sky. A new lap turns it a little further. */
export function constellationAt(sessionId: string, shot: number, side: Side) {
  let index = shot % cycleLength;
  let skyIndex = 0;
  while (index >= skies[skyIndex].dots.length) {
    index -= skies[skyIndex].dots.length;
    skyIndex++;
  }
  const sky = skies[skyIndex];
  const turn = parseInt(sessionId.slice(0, 8), 16) / 0x100000000;
  const angle = turn * 2 * Math.PI + Math.floor(shot / cycleLength) * 0.55;
  const cos = Math.cos(angle),
    sin = Math.sin(angle);
  const points = sky.dots.map(([x, y]): Point => {
    const dx = (x - 50) * 4.15,
      dy = (y - 43) * 4.15;
    return {
      x: shoulder.x + (side === "left" ? -1 : 1) * (dx * cos - dy * sin),
      y: shoulder.y + dx * sin + dy * cos,
    };
  });
  const slot = scanTargetSlot(shot);
  // Three dwell stops keep a single-switch player within one short sweep of
  // every star, even in a seven-star constellation.
  const stops = Array.from(
    { length: 3 },
    (_, i) => points[(index + ((i - slot + 3) % 3) * 2) % points.length],
  );
  return { ...sky, index, points, goal: points[index], stops };
}
export type StarLayout = ReturnType<typeof constellationAt>;
