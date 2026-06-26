import { describe, it, expect } from "vitest";
import { SessionStats } from "./SessionStats";

describe("SessionStats", () => {
  it("accumulates active time and the longest engaged streak", () => {
    const s = new SessionStats();
    s.accumulate(2, true);   // streak 2
    s.accumulate(2, true);   // streak 4
    s.accumulate(1, false);  // break
    s.accumulate(3, true);   // streak 3
    expect(s.totalActiveSeconds).toBeCloseTo(7); // engaged-only: 2+2+3; the 1s break (false) is not counted
    expect(s.bestStreakSeconds).toBeCloseTo(4);
  });
  it("renders singular vs plural focus line", () => {
    const a = new SessionStats();
    a.accumulate(60, true);
    expect(a.focusLine()).toBe("You focused for 1 minute");
    const b = new SessionStats();
    b.accumulate(150, true);
    expect(b.focusLine()).toBe("You focused for 3 minutes"); // rounds 2.5→3
  });
  it("renders a streak line and warm praise, no raw percentage", () => {
    const s = new SessionStats();
    s.accumulate(7, true);
    expect(s.streakLine()).toBe("Your best streak was 7 seconds");
    expect(s.praiseLine()).toBe("Great session!");
    expect(s.streakLine()).not.toMatch(/%/);
  });
});
