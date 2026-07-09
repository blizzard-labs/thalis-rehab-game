import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { VisionHealthPanel } from "./VisionHealthPanel";
import { VisionHealthStore } from "../scoring/visionHealthStore";
import { ScoreStore } from "../scoring/scoreStore";

function scoreFrame(over: Partial<Record<string, unknown>> = {}) {
  return {
    intentScore: 50, erdScore: 40, classifierScore: null,
    kinematicScore: 70, compensationFlag: false, isArtifact: false,
    mode: "band_power_only", timestamp: 0, ...over,
  } as any;
}

describe("VisionHealthPanel", () => {
  it("shows connection state and fps", () => {
    const vh = new VisionHealthStore();
    vh.push({ connection: "connected", fps: 15, kinematicActive: true, degraded: false,
      affectedSide: "right", calibration: "complete", restCalibrated: true, timestamp: 0 });
    const sc = new ScoreStore();
    sc.push(scoreFrame());
    render(<VisionHealthPanel visionHealthStore={vh} scoreStore={sc} />);
    expect(screen.getByTestId("vision-health-panel")).toHaveTextContent("connected");
    expect(screen.getByTestId("vision-health-panel")).toHaveTextContent("15");
    expect(screen.queryByTestId("vision-degraded-banner")).toBeNull();
  });

  it("raises the degraded banner", () => {
    const vh = new VisionHealthStore();
    vh.push({ connection: "connected", fps: 0, kinematicActive: false, degraded: true,
      affectedSide: "right", calibration: "idle", restCalibrated: false, timestamp: 0 });
    render(<VisionHealthPanel visionHealthStore={vh} scoreStore={new ScoreStore()} />);
    expect(screen.getByTestId("vision-degraded-banner")).toHaveTextContent(/EEG-only/i);
  });

  it("shows the affected side and calibration state", () => {
    const vh = new VisionHealthStore();
    vh.push({ connection: "connected", fps: 15, kinematicActive: false, degraded: false,
      affectedSide: "left", calibration: "collecting", restCalibrated: false, timestamp: 0 });
    render(<VisionHealthPanel visionHealthStore={vh} scoreStore={new ScoreStore()} />);
    const side = screen.getByTestId("vision-affected-side");
    expect(side).toHaveTextContent(/left arm/i);
    expect(side).toHaveTextContent(/calibrating/i);
  });

  it("shows the compensation indicator when flagged", () => {
    const sc = new ScoreStore();
    sc.push(scoreFrame({ compensationFlag: true }));
    render(<VisionHealthPanel visionHealthStore={new VisionHealthStore()} scoreStore={sc} />);
    expect(screen.getByTestId("compensation-indicator")).toBeInTheDocument();
  });

  it("shows 'no camera link' when no frame has arrived", () => {
    render(<VisionHealthPanel visionHealthStore={new VisionHealthStore()} scoreStore={new ScoreStore()} />);
    expect(screen.getByTestId("vision-health-panel")).toHaveTextContent(/no camera link/i);
  });

  it("shows 'no camera link' (not a degraded alarm) when the connection is closed", () => {
    // Boot state: monitor frames arrive but no patient has connected yet.
    const vh = new VisionHealthStore();
    vh.push({ connection: "closed", fps: 0, kinematicActive: false, degraded: false,
      affectedSide: "right", calibration: "idle", restCalibrated: false, timestamp: 0 });
    render(<VisionHealthPanel visionHealthStore={vh} scoreStore={new ScoreStore()} />);
    expect(screen.getByTestId("vision-health-panel")).toHaveTextContent(/no camera link/i);
    expect(screen.queryByTestId("vision-degraded-banner")).toBeNull();
  });
});
