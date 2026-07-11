import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { StarCatchScene } from "./StarCatchScene";
import { SessionStats } from "../session/SessionStats";
import { ScoreStore } from "../scoring/scoreStore";
import type { ScoreFrame } from "../scoring/intentScoreMessage";

// Directional game: joints carry the normalized wrist offset (image coords:
// +dx right, +dy down). The up goal is reached with the hand raised (dy < 0).
const frame = (
  intent: number,
  w: { dx: number; dy: number } | null = null,
): ScoreFrame => ({
  intentScore: intent, erdScore: null, classifierScore: null, kinematicScore: 60,
  compensationFlag: false, isArtifact: false, mode: "C", timestamp: 0,
  joints: w === null ? null : {
    shoulderFlexionDeg: 0, shoulderAbductionDeg: 0, elbowDeg: 0,
    wristDx: w.dx, wristDy: w.dy, poseValid: true,
  },
});
// On the first (reach-up) goal: hand raised straight up at full magnitude.
const UP_GOAL = { dx: 0, dy: -1.1 };

describe("StarCatchScene", () => {
  let raf: Array<FrameRequestCallback>;
  beforeEach(() => {
    raf = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => { raf.push(cb); return raf.length; });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  function pump(times: number, ms: number) {
    for (let i = 0; i < times; i++) {
      const cbs = raf;
      raf = [];
      act(() => cbs.forEach((cb) => cb(performance.now() + i * ms)));
    }
  }

  it("shows the current target cue and renders a two-bone arm", () => {
    const store = new ScoreStore();
    store.push(frame(80, { dx: 0, dy: -0.3 }));
    render(<StarCatchScene stats={new SessionStats()} engagementThreshold={60}
                           store={store} conn="open" onEnd={() => {}} />);
    expect(screen.getByTestId("rom-cue")).toHaveTextContent(/reach up high/i);
    expect(screen.getByTestId("arm-upper")).toBeInTheDocument();
    expect(screen.getByTestId("arm-fore")).toBeInTheDocument();
  });

  it("shows a plain-language detail instruction naming the affected arm", () => {
    const store = new ScoreStore();
    store.push(frame(80, { dx: 0, dy: -0.3 })); // idx 0 = reach up
    render(<StarCatchScene stats={new SessionStats()} engagementThreshold={60}
                           store={store} conn="open" onEnd={() => {}} />);
    expect(screen.getByTestId("rom-cue-detail")).toHaveTextContent(/lift your affected arm up/i);
  });

  it("collects a star when the net reaches the goal star while engaged", () => {
    const stats = new SessionStats();
    const store = new ScoreStore();
    render(
      <StarCatchScene stats={stats} engagementThreshold={55} store={store} conn="open" onEnd={() => {}} />,
    );
    // hand raised onto the up-goal + engaged EEG.
    act(() => store.push(frame(95, UP_GOAL)));
    pump(3, 100); // reach saturates on the goal
    expect(Number(screen.getByTestId("net").getAttribute("data-reach"))).toBeGreaterThan(0.9);
    expect(screen.getByTestId("status-pill")).toHaveAttribute("data-engaged", "true");
    pump(10, 100); // held past HOLD_S → a star collects
    expect(stats.trialsCompleted).toBeGreaterThanOrEqual(1);
  });

  it("does not collect when the hand is nowhere near the goal star", () => {
    const stats = new SessionStats();
    const store = new ScoreStore();
    render(<StarCatchScene stats={stats} engagementThreshold={55} store={store} conn="open" onEnd={() => {}} />);
    act(() => store.push(frame(95, { dx: 0, dy: 0 }))); // at rest, far from the up goal
    pump(20, 100);
    expect(stats.trialsCompleted).toBe(0);
  });

  it("shows the tracking badge on when pose is valid", () => {
    const store = new ScoreStore();
    store.push(frame(80, { dx: 0, dy: -0.3 })); // frame() sets poseValid: true
    render(<StarCatchScene stats={new SessionStats()} engagementThreshold={60}
                           store={store} conn="open" onEnd={() => {}} />);
    expect(screen.getByTestId("tracking-badge")).toHaveAttribute("data-tracking", "on");
  });

  it("shows the tracking badge off when pose is invalid", () => {
    const store = new ScoreStore();
    store.push(frame(80, null)); // joints null → not tracking
    render(<StarCatchScene stats={new SessionStats()} engagementThreshold={60}
                           store={store} conn="open" onEnd={() => {}} />);
    expect(screen.getByTestId("tracking-badge")).toHaveAttribute("data-tracking", "off");
  });

  it("places the up-trial goal star above the arm and keeps it fixed as the hand moves", () => {
    const store = new ScoreStore();
    store.push(frame(50, { dx: 0, dy: -0.2 }));
    render(<StarCatchScene stats={new SessionStats()} engagementThreshold={95}
                           store={store} conn="open" onEnd={() => {}} />);
    const translateOf = () =>
      /translate\(([\-\d.]+) ([\-\d.]+)\)/.exec(
        screen.getByTestId("reach-goal").getAttribute("transform") ?? "",
      );
    const before = translateOf();
    // up goal is above the centered shoulder (y = 330)
    expect(Number(before?.[2])).toBeLessThan(330);
    act(() => store.push(frame(50, { dx: 0.4, dy: -0.4 }))); // hand moves, same trial
    pump(2, 100);
    const after = translateOf();
    expect(after?.[1]).toBe(before?.[1]);
    expect(after?.[2]).toBe(before?.[2]);
  });

  it("draws a net on the hand instead of a star", () => {
    const store = new ScoreStore();
    store.push(frame(80, { dx: 0, dy: -0.3 }));
    render(<StarCatchScene stats={new SessionStats()} engagementThreshold={60}
                           store={store} conn="open" onEnd={() => {}} />);
    expect(screen.getByTestId("net")).toBeInTheDocument();
    expect(screen.queryByTestId("reach-hand")).toBeNull();
  });

  it("ends the session on the End button", () => {
    const onEnd = vi.fn();
    render(<StarCatchScene stats={new SessionStats()} engagementThreshold={55} store={new ScoreStore()} conn="open" onEnd={onEnd} />);
    screen.getByRole("button", { name: /end session/i }).click();
    expect(onEnd).toHaveBeenCalledOnce();
  });
});
