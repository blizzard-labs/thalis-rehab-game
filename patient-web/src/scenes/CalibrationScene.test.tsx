import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { CalibrationScene } from "./CalibrationScene";

describe("CalibrationScene", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows the affected-side cue and trial counter, and advances phases", () => {
    render(<CalibrationScene affectedSide="left" totalTrials={20} onComplete={() => {}} />);
    const root = screen.getByTestId("calibration");
    expect(root).toHaveAttribute("data-phase", "fixation");
    expect(screen.getByText(/trial 1 of 20/i)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(2000)); // fixation → cue
    expect(root).toHaveAttribute("data-phase", "cue");
    expect(screen.getByText(/imagine opening your left hand/i)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1250)); // cue → imagine
    expect(root).toHaveAttribute("data-phase", "imagine");
  });

  it("calls onComplete after the configured trial count", () => {
    const onComplete = vi.fn();
    render(<CalibrationScene affectedSide="right" totalTrials={1} onComplete={onComplete} />);
    // BUG-FIX (task-7-report): brief's original single act(advanceTimersByTime(total)) fails
    // because each phase timer is registered inside a useEffect that only runs after React
    // flushes; advancing the full window in one shot leaves subsequent timers unregistered
    // until after advanceTimersByTime returns, so they never fire within that call.
    // Fix: step through each phase separately so act() flushes React effects between steps.
    act(() => vi.advanceTimersByTime(2000)); // fixation done → cue
    act(() => vi.advanceTimersByTime(1250)); // cue done → imagine
    act(() => vi.advanceTimersByTime(4000)); // imagine done → rest
    act(() => vi.advanceTimersByTime(3000)); // rest done (max 3000 ms) → onComplete
    expect(onComplete).toHaveBeenCalledOnce();
  });
});
