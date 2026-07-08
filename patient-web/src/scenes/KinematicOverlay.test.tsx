import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { KinematicOverlay } from "./KinematicOverlay";
import { ScoreStore } from "../scoring/scoreStore";

function frame(over: Partial<Record<string, unknown>> = {}) {
  return {
    intentScore: 50, erdScore: 40, classifierScore: null,
    kinematicScore: 70, compensationFlag: false, isArtifact: false,
    mode: "B", timestamp: 0, ...over,
  } as any;
}

describe("KinematicOverlay", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows the verified badge when kinematicScore is present", () => {
    const store = new ScoreStore();
    store.push(frame({ kinematicScore: 65 }));
    render(<KinematicOverlay store={store} />);
    act(() => { vi.advanceTimersByTime(150); });
    expect(screen.getByTestId("verified-badge")).toBeInTheDocument();
  });

  it("hides the verified badge when kinematicScore is null", () => {
    const store = new ScoreStore();
    store.push(frame({ kinematicScore: null }));
    render(<KinematicOverlay store={store} />);
    act(() => { vi.advanceTimersByTime(150); });
    expect(screen.queryByTestId("verified-badge")).toBeNull();
  });

  it("shows the compensation cue only after the flag persists", () => {
    const store = new ScoreStore();
    store.push(frame({ compensationFlag: true }));
    render(<KinematicOverlay store={store} showAfterMs={300} hideAfterMs={300} pollMs={50} />);
    act(() => { vi.advanceTimersByTime(100); }); // not yet past showAfterMs
    expect(screen.queryByTestId("compensation-cue")).toBeNull();
    act(() => { vi.advanceTimersByTime(300); }); // now persisted long enough
    expect(screen.getByTestId("compensation-cue")).toBeInTheDocument();
  });
});
