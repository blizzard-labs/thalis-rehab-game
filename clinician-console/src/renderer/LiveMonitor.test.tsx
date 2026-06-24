import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { LiveMonitor } from "./LiveMonitor";
import { ScoreStore } from "../scoring/scoreStore";
import type { ScoreFrame } from "../scoring/intentScoreMessage";

function frame(intentScore: number, isArtifact = false): ScoreFrame {
  return { intentScore, erdScore: 61.2, classifierScore: null, isArtifact, mode: "band_power_only", timestamp: 0 };
}

describe("LiveMonitor", () => {
  it("renders the latest intent score", () => {
    const store = new ScoreStore();
    act(() => store.push(frame(64)));
    render(<LiveMonitor store={store} connectionState="open" sidecarState="ready" />);
    expect(screen.getByTestId("intent-score").textContent).toContain("64");
  });

  it("shows the mode and classifier placeholder when null", () => {
    const store = new ScoreStore();
    act(() => store.push(frame(30)));
    render(<LiveMonitor store={store} connectionState="open" sidecarState="ready" />);
    expect(screen.getByTestId("mode-tile").textContent).toContain("band_power_only");
    expect(screen.getByTestId("classifier-tile").textContent).toContain("—");
  });

  it("flags artifact in the signal tile", () => {
    const store = new ScoreStore();
    render(<LiveMonitor store={store} connectionState="open" sidecarState="ready" />);
    act(() => store.push(frame(20, true)));
    expect(screen.getByTestId("signal-tile").textContent).toContain("Artifact");
  });

  it("shows connection state when not open", () => {
    const store = new ScoreStore();
    render(<LiveMonitor store={store} connectionState="reconnecting" sidecarState="starting" />);
    expect(screen.getByTestId("conn-badge").textContent?.toLowerCase()).toContain("reconnect");
  });
});
