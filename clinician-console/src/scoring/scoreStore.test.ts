import { describe, it, expect, vi } from "vitest";
import { ScoreStore } from "./scoreStore";
import type { ScoreFrame } from "./intentScoreMessage";

function frame(intentScore: number, isArtifact = false): ScoreFrame {
  return { intentScore, erdScore: 50, classifierScore: null, kinematicScore: null, compensationFlag: false, joints: null, isArtifact, mode: "band_power_only", timestamp: 0 };
}

describe("ScoreStore", () => {
  it("starts empty with placeholder signal", () => {
    const s = new ScoreStore();
    expect(s.getState().latest).toBeNull();
    expect(s.getState().signalText).toBe("—");
  });

  it("tracks the latest frame", () => {
    const s = new ScoreStore();
    s.push(frame(10));
    s.push(frame(80));
    expect(s.getState().latest?.intentScore).toBe(80);
  });

  it("caps the rolling buffer and evicts oldest", () => {
    const s = new ScoreStore(3);
    s.push(frame(1));
    s.push(frame(2));
    s.push(frame(3));
    s.push(frame(4));
    const b = s.getState().buffer;
    expect(b.map((f) => f.intentScore)).toEqual([2, 3, 4]);
  });

  it("flips signalText on artifact", () => {
    const s = new ScoreStore();
    s.push(frame(50, false));
    expect(s.getState().signalText).toBe("Good");
    s.push(frame(50, true));
    expect(s.getState().signalText).toBe("Artifact");
  });

  it("notifies subscribers and supports unsubscribe", () => {
    const s = new ScoreStore();
    const cb = vi.fn();
    const off = s.subscribe(cb);
    s.push(frame(5));
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    s.push(frame(6));
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
