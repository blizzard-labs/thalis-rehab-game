import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { StarCatchScene } from "./StarCatchScene";
import { SessionStats } from "../session/SessionStats";
import { ScoreStore } from "../scoring/scoreStore";
import type { ScoreFrame } from "../scoring/intentScoreMessage";

const frame = (
  intent: number,
  joints: Partial<{ flex: number; abd: number; elbow: number }> | null = null,
): ScoreFrame => ({
  intentScore: intent, erdScore: null, classifierScore: null, kinematicScore: 60,
  compensationFlag: false, isArtifact: false, mode: "C", timestamp: 0,
  joints: joints === null ? null : {
    shoulderFlexionDeg: joints.flex ?? 0, shoulderAbductionDeg: joints.abd ?? 0,
    elbowDeg: joints.elbow ?? 0, poseValid: true,
  },
});

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
    store.push(frame(80, { flex: 30 }));
    render(<StarCatchScene stats={new SessionStats()} engagementThreshold={60}
                           store={store} conn="open" onEnd={() => {}} />);
    expect(screen.getByTestId("rom-cue")).toHaveTextContent(/reach up high/i);
    expect(screen.getByTestId("arm-upper")).toBeInTheDocument();
    expect(screen.getByTestId("arm-fore")).toBeInTheDocument();
  });

  it("collects a star when the measured joint angle meets the target while engaged", () => {
    const stats = new SessionStats();
    const store = new ScoreStore();
    render(
      <StarCatchScene stats={stats} engagementThreshold={55} store={store} conn="open" onEnd={() => {}} />,
    );
    // flexion target defaults to 60; push a measured 80 deg (>= target) + engaged EEG.
    act(() => store.push(frame(95, { flex: 80 })));
    pump(3, 100); // reach saturates immediately (80/60 clamped to 1)
    expect(Number(screen.getByTestId("reach-hand").getAttribute("data-reach"))).toBeGreaterThan(0.9);
    expect(screen.getByTestId("status-pill")).toHaveAttribute("data-engaged", "true");
    pump(10, 100); // held past HOLD_S → a star collects
    expect(stats.trialsCompleted).toBeGreaterThanOrEqual(1);
  });

  it("does not collect when the joint angle is below target", () => {
    const stats = new SessionStats();
    const store = new ScoreStore();
    render(<StarCatchScene stats={stats} engagementThreshold={55} store={store} conn="open" onEnd={() => {}} />);
    act(() => store.push(frame(95, { flex: 10 }))); // 10 << 60 target
    pump(20, 100);
    expect(stats.trialsCompleted).toBe(0);
  });

  it("ends the session on the End button", () => {
    const onEnd = vi.fn();
    render(<StarCatchScene stats={new SessionStats()} engagementThreshold={55} store={new ScoreStore()} conn="open" onEnd={onEnd} />);
    screen.getByRole("button", { name: /end session/i }).click();
    expect(onEnd).toHaveBeenCalledOnce();
  });
});
