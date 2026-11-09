import { describe, it, expect } from "vitest";
import { ScoreStore } from "./scoreStore";
import type { ScoreFrame } from "./intentScoreMessage";

const frame = (s: number): ScoreFrame => ({
  intentScore: s, erdScore: null, classifierScore: null,
  kinematicScore: null, compensationFlag: false, joints: null,
  isArtifact: false, mode: "band_power_only", timestamp: 0,
});

describe("ScoreStore", () => {
  it("returns null when empty and tracks latest", () => {
    const st = new ScoreStore(4);
    expect(st.latest()).toBeNull();
    st.push(frame(10));
    st.push(frame(20));
    expect(st.latest()!.intentScore).toBe(20);
    expect(st.size()).toBe(2);
  });
  it("averages the most recent n", () => {
    const st = new ScoreStore(10);
    [10, 20, 30, 40].forEach((s) => st.push(frame(s)));
    expect(st.recentAverage(2)).toBe(35);
  });
  it("counts the trailing streak at/above threshold", () => {
    const st = new ScoreStore(10);
    [10, 80, 90, 95].forEach((s) => st.push(frame(s)));
    expect(st.streakAboveThreshold(70)).toBe(3);
    st.push(frame(10));
    expect(st.streakAboveThreshold(70)).toBe(0);
  });
  it("wraps at capacity without growing", () => {
    const st = new ScoreStore(3);
    [1, 2, 3, 4, 5].forEach((s) => st.push(frame(s)));
    expect(st.size()).toBe(3);
    expect(st.latest()!.intentScore).toBe(5);
    expect(st.recentAverage(3)).toBe(4); // (3+4+5)/3
  });
});

it("expires a repeated stale timestamp and rejects artifact-held values", () => {
  const store = new ScoreStore();
  const clock = vi.spyOn(performance,"now");
  try {
    clock.mockReturnValue(0);store.push({...frame(90),timestamp:7});
    clock.mockReturnValue(800);store.push({...frame(90),timestamp:7});
    expect(store.fresh()).toBeNull();
    store.push({...frame(90),timestamp:8,isArtifact:true});
    expect(store.fresh()).toBeNull();
  } finally { clock.mockRestore(); }
});
