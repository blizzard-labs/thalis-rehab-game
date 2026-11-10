import { expect, it } from "vitest";
import { netRadius, scanningWrist, shoulder } from "../reach/starGeometry";
import {
  completedConstellationCount,
  constellationAt,
  scanTargetSlot,
} from "./constellations";

const id = "05ac3782-36da-48cb-9f77-8fc35b1025ca";
it("moves the golden star along each constellation, including chart and lap boundaries", () => {
  for (const side of ["left", "right"] as const) {
    const layouts = Array.from({ length: 40 }, (_, i) =>
      constellationAt(id, i, side),
    );
    expect(layouts[0].name).toBe("The Kite");
    expect(layouts[6].name).toBe("The Sailboat");
    expect(layouts[12].name).toBe("The Crown");
    expect(layouts[19].goal).not.toEqual(layouts[0].goal);
    layouts.forEach(({ goal, points, index, stops }, i) => {
      expect(goal).toEqual(points[index]);
      const radius = Math.hypot(goal.x - shoulder.x, goal.y - shoulder.y);
      expect(radius).toBeLessThan(250);
      expect(radius).toBeGreaterThan(10);
      if (i > 0) {
        const previous = layouts[i - 1].goal;
        expect(
          Math.hypot(goal.x - previous.x, goal.y - previous.y),
        ).toBeGreaterThan(2 * netRadius);
      }
      for (const reduced of [true, false]) {
        expect(
          scanningWrist(scanTargetSlot(i) * 2.5, true, stops, reduced),
        ).toEqual(goal);
      }
    });
  }
});

it("keeps the same target on resume and changes sky orientation for a new session", () => {
  expect(constellationAt(id, 13, "right")).toEqual(
    constellationAt(id, 13, "right"),
  );
  expect(
    constellationAt("85ac3782-36da-48cb-9f77-8fc35b1025ca", 13, "right").goal,
  ).not.toEqual(constellationAt(id, 13, "right").goal);
});

it("adds only finished outlines, including every repeat in later laps", () => {
  const boundaries = [
    [0, 0],
    [5, 0],
    [6, 1],
    [11, 1],
    [12, 2],
    [18, 2],
    [19, 3],
    [24, 3],
    [25, 4],
    [38, 6],
    [190, 30],
  ];
  for (const [stars, completed] of boundaries) {
    expect(completedConstellationCount(stars)).toBe(completed);
  }
});
