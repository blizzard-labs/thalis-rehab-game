import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { GardenScene } from "./GardenScene";
import { SessionStats } from "../session/SessionStats";
import { ScoreStore } from "../scoring/scoreStore";

// Scenes are pure consumers of a shared ScoreStore now; drive the loop by
// pushing frames into the store the App hook would otherwise fill.
const frame = (v: number) => ({
  intentScore: v, erdScore: null, classifierScore: null, isArtifact: false, mode: "band_power_only", timestamp: 0,
});

describe("GardenScene", () => {
  let raf: Array<FrameRequestCallback>;
  beforeEach(() => {
    raf = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => { raf.push(cb); return raf.length; });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  // pump: drive the rAF loop. ms is the simulated milliseconds per frame.
  // Brief bug fixed: original pump(30, 0.1) passes dt=0.0001s/frame → growth of
  // 0.00232 total → toFixed(2)="0.00" so after===before===0 and toBeGreaterThan(0) fails.
  // Fix: use ms=100 (100 ms/frame) so growth per frame=0.8×0.1=0.08, clearly visible
  // at two decimal places (growth reaches ~0.90 after 30 frames at score 90).
  function pump(times: number, ms: number) {
    for (let i = 0; i < times; i++) {
      const cbs = raf;
      raf = [];
      act(() => cbs.forEach((cb) => cb(performance.now() + i * ms)));
    }
  }

  it("grows the flower as scores rise and flips the status pill at threshold", () => {
    const store = new ScoreStore();
    render(
      <GardenScene
        stats={new SessionStats()}
        engagementThreshold={55}
        store={store}
        conn="open"
        onEnd={() => {}}
      />,
    );
    const flower = screen.getByTestId("flower");
    const before = Number(flower.getAttribute("data-growth"));

    act(() => store.push(frame(90)));
    pump(30, 100); // ~3 s of 100 ms frames at high score
    const after = Number(screen.getByTestId("flower").getAttribute("data-growth"));
    expect(after).toBeGreaterThan(before);
    expect(screen.getByTestId("status-pill")).toHaveAttribute("data-engaged", "true");

    act(() => store.push(frame(10)));
    pump(5, 100);
    expect(screen.getByTestId("status-pill")).toHaveAttribute("data-engaged", "false");
  });

  it("ends the session on the End button", async () => {
    const onEnd = vi.fn();
    render(<GardenScene stats={new SessionStats()} engagementThreshold={55} store={new ScoreStore()} conn="open" onEnd={onEnd} />);
    screen.getByRole("button", { name: /end session/i }).click();
    expect(onEnd).toHaveBeenCalledOnce();
  });
});
