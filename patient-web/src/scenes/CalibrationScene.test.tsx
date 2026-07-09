import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { CalibrationScene } from "./CalibrationScene";

describe("CalibrationScene", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("greys out 'I'm ready' until a framing choice (skip / in-frame) is made", () => {
    render(
      <CalibrationScene affectedSide="left" totalTrials={20} baselineMs={1000} onComplete={() => {}} />,
    );
    // Before any framing choice the clinician gate is disabled.
    expect(screen.getByTestId("ready-btn")).toBeDisabled();
    // Skip (no camera) is the always-available framing choice; it unlocks ready.
    act(() => fireEvent.click(screen.getByTestId("framing-skip")));
    expect(screen.getByTestId("ready-btn")).toBeEnabled();
  });

  it("disables the 'I'm in frame' choice until the camera heuristic passes", () => {
    // jsdom has no getUserMedia -> heuristic can't pass -> in-frame disabled,
    // while skip stays available.
    render(
      <CalibrationScene affectedSide="left" totalTrials={20} baselineMs={1000} onComplete={() => {}} />,
    );
    expect(screen.getByTestId("framing-confirm")).toBeDisabled();
    expect(screen.getByTestId("framing-skip")).toBeEnabled();
  });

  it("holds the block until the clinician presses 'I'm ready'", () => {
    render(
      <CalibrationScene affectedSide="left" totalTrials={20} baselineMs={1000} onComplete={() => {}} />,
    );
    const root = screen.getByTestId("calibration");
    // No recording indicator and the block does not advance before ready.
    expect(screen.queryByTestId("rec-indicator")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(5000));
    expect(root).toHaveAttribute("data-phase", "baseline");
    act(() => fireEvent.click(screen.getByTestId("framing-skip")));
    act(() => fireEvent.click(screen.getByTestId("ready-btn")));
    // Button disappears, recording indicator appears.
    expect(screen.queryByTestId("ready-btn")).not.toBeInTheDocument();
    expect(screen.getByTestId("rec-indicator")).toBeInTheDocument();
  });

  it("runs a 60 s eyes-open baseline rest before the first cued trial (spec §6 step 1)", () => {
    render(
      <CalibrationScene affectedSide="left" totalTrials={20} baselineMs={60000} onComplete={() => {}} />,
    );
    const root = screen.getByTestId("calibration");
    act(() => fireEvent.click(screen.getByTestId("framing-skip")));
    act(() => fireEvent.click(screen.getByTestId("ready-btn")));
    // Baseline holds through the full window, then hands off to trial 1 fixation.
    expect(root).toHaveAttribute("data-phase", "baseline");
    act(() => vi.advanceTimersByTime(30000));
    expect(root).toHaveAttribute("data-phase", "baseline");
    act(() => vi.advanceTimersByTime(30000)); // baseline complete → cued trials
    expect(root).toHaveAttribute("data-phase", "fixation");
    expect(screen.getByText(/trial 1 of 40/i)).toBeInTheDocument();
  });

  it("alternates the cue between affected and unaffected hand each trial (spec §6 step 2)", () => {
    render(
      <CalibrationScene affectedSide="left" totalTrials={20} baselineMs={1000} onComplete={() => {}} />,
    );
    const root = screen.getByTestId("calibration");
    act(() => fireEvent.click(screen.getByTestId("framing-skip")));
    act(() => fireEvent.click(screen.getByTestId("ready-btn")));
    act(() => vi.advanceTimersByTime(1000)); // baseline → trial 1 fixation
    act(() => vi.advanceTimersByTime(2000)); // fixation → cue (trial 1: affected = left)
    expect(root).toHaveAttribute("data-phase", "cue");
    expect(screen.getByText(/imagine closing your left hand/i)).toBeInTheDocument();
    // Step to trial 2's cue.
    act(() => vi.advanceTimersByTime(1250)); // cue → imagine
    act(() => vi.advanceTimersByTime(4000)); // imagine → rest
    act(() => vi.advanceTimersByTime(3000)); // rest → trial 2 fixation
    act(() => vi.advanceTimersByTime(2000)); // fixation → cue (trial 2: unaffected = right)
    expect(screen.getByText(/imagine closing your right hand/i)).toBeInTheDocument();
  });

  it("skips the block via the dev Skip button", () => {
    const onComplete = vi.fn();
    render(<CalibrationScene affectedSide="left" totalTrials={20} onComplete={onComplete} />);
    act(() => fireEvent.click(screen.getByTestId("skip-btn")));
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("calls onComplete after baseline plus every cued trial (2 classes × totalTrials)", () => {
    const onComplete = vi.fn();
    render(
      <CalibrationScene affectedSide="right" totalTrials={1} baselineMs={1000} onComplete={onComplete} />,
    );
    act(() => fireEvent.click(screen.getByTestId("framing-skip")));
    act(() => fireEvent.click(screen.getByTestId("ready-btn")));
    // BUG-FIX (task-7-report): each phase timer registers inside a useEffect that only runs
    // after React flushes; advancing the whole window in one shot leaves later timers
    // unregistered until after advanceTimersByTime returns. Step through each phase separately
    // so act() flushes React effects between steps.
    act(() => vi.advanceTimersByTime(1000)); // baseline → trial 1 fixation
    // trial 1 (affected)
    act(() => vi.advanceTimersByTime(2000)); // fixation → cue
    act(() => vi.advanceTimersByTime(1250)); // cue → imagine
    act(() => vi.advanceTimersByTime(4000)); // imagine → rest
    act(() => vi.advanceTimersByTime(3000)); // rest → trial 2 fixation
    // trial 2 (unaffected) — totalTrials=1 → 2 classes → 2 cued trials total
    act(() => vi.advanceTimersByTime(2000)); // fixation → cue
    act(() => vi.advanceTimersByTime(1250)); // cue → imagine
    act(() => vi.advanceTimersByTime(4000)); // imagine → rest
    act(() => vi.advanceTimersByTime(3000)); // rest done → onComplete
    expect(onComplete).toHaveBeenCalledOnce();
  });
});
