import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

// Garden opens a real WebSocket; stub it so the flow test stays offline.
beforeEach(() => {
  vi.stubGlobal("WebSocket", class {
    onopen: any = null; onclose: any = null; onmessage: any = null; onerror: any = null;
    close() {}
  });
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 0);
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("App flow", () => {
  it("advances Welcome → Calibration → Garden → Summary", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // Mock Math.random so CalibrationScene's rest phase is always 2000 ms
    // (not 2000–3000 ms) — deterministic step sizes for fake-timer advancement.
    vi.spyOn(Math, "random").mockReturnValue(0);

    // userEvent must be set up AFTER fake timers so it can advance them
    // internally when it delays pointer events.
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<App />);
    expect(screen.getByText(/ready to play/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /let's begin/i }));
    expect(screen.getByTestId("calibration")).toBeInTheDocument();

    // Clinician pre-calibration gate: the cue sequence is held until "I'm ready".
    await user.click(screen.getByTestId("ready-btn"));

    // CalibrationScene uses chained useEffect timeouts: each new timeout is
    // only registered after React flushes the previous state update, so a
    // single advanceTimersByTime(60000) misses every timer after the first.
    // Fix: step through each phase individually so act() flushes between steps.
    // App passes totalTrials={2} → 2 trials × 4 phases = 8 act() steps.
    // Phase durations (Math.random=0 ⟹ rest = 2000 ms exactly):
    //   fixation 2000 | cue 1250 | imagine 4000 | rest 2000  (×2 trials)
    const phases = [2000, 1250, 4000, 2000, 2000, 1250, 4000, 2000];
    for (const ms of phases) {
      act(() => { vi.advanceTimersByTime(ms); });
    }

    // Post-calibration popup: pick Garden Grow, then confirm with "I'm ready".
    expect(screen.getByTestId("modeselect")).toBeInTheDocument();
    await user.click(screen.getByTestId("mode-garden"));
    await user.click(screen.getByTestId("mode-ready"));

    expect(screen.getByTestId("flower")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /end session/i }));
    expect(screen.getByText(/great work today/i)).toBeInTheDocument();
    vi.useRealTimers();
  });
});
