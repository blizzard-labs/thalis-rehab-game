import { describe, it, expect, vi } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { LiveMonitor } from "./LiveMonitor";
import { ScoreStore } from "../scoring/scoreStore";
import { CameraFrameStore } from "../scoring/cameraFrameStore";
import { VisionHealthStore } from "../scoring/visionHealthStore";
import type { ScoreFrame } from "../scoring/intentScoreMessage";

function vhFrame(restCalibrated: boolean) {
  return {
    connection: "connected", fps: 15, kinematicActive: true, degraded: false,
    affectedSide: "right" as const, calibration: restCalibrated ? "complete" : "collecting",
    restCalibrated, timestamp: 0,
  };
}

function frame(intentScore: number, isArtifact = false): ScoreFrame {
  return { intentScore, erdScore: 61.2, classifierScore: null, kinematicScore: null, compensationFlag: false, joints: null, isArtifact, mode: "band_power_only", timestamp: 0 };
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

  it("End session button calls onEndSession", () => {
    const store = new ScoreStore();
    const onEnd = vi.fn();
    render(<LiveMonitor store={store} connectionState="open" sidecarState="ready" onEndSession={onEnd} />);
    fireEvent.click(screen.getByRole("button", { name: /end session/i }));
    expect(onEnd).toHaveBeenCalled();
  });

  it("disables Switch mode when no classifier score is present", () => {
    const store = new ScoreStore();
    act(() => store.push(frame(40)));
    render(<LiveMonitor store={store} connectionState="open" sidecarState="ready" onSwitchMode={() => {}} />);
    expect((screen.getByRole("button", { name: /switch mode/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the camera fps in the header when a frame is present", () => {
    const store = new ScoreStore();
    const cameraFrameStore = new CameraFrameStore();
    render(<LiveMonitor store={store} connectionState="open" sidecarState="ready" cameraFrameStore={cameraFrameStore} />);
    act(() => cameraFrameStore.push({ jpeg: "x", landmarks: { pose: [], hands: { left: null, right: null } }, fps: 12.3, timestamp: 0 }));
    expect(screen.getByTestId("conn-badge").textContent).toMatch(/12\.3 fps/);
  });

  it("shows 'not calibrated' for the kinematic graph when CV is uncalibrated", () => {
    const store = new ScoreStore();
    const visionHealthStore = new VisionHealthStore();
    render(<LiveMonitor store={store} connectionState="open" sidecarState="ready" visionHealthStore={visionHealthStore} />);
    act(() => visionHealthStore.push(vhFrame(false)));
    expect(screen.getByTestId("kinematic-graph").textContent).toMatch(/not calibrated/i);
  });

  it("flows the kinematic graph once CV is calibrated", () => {
    const store = new ScoreStore();
    const visionHealthStore = new VisionHealthStore();
    render(<LiveMonitor store={store} connectionState="open" sidecarState="ready" visionHealthStore={visionHealthStore} />);
    act(() => visionHealthStore.push(vhFrame(true)));
    expect(screen.getByTestId("kinematic-graph").textContent).not.toMatch(/not calibrated/i);
  });

  it("no longer renders the vision-health panel above the boxes", () => {
    const store = new ScoreStore();
    render(<LiveMonitor store={store} connectionState="open" sidecarState="ready" visionHealthStore={new VisionHealthStore()} />);
    expect(screen.queryByTestId("vision-health-panel")).toBeNull();
  });

  it("enables Switch mode and calls onSwitchMode when a classifier score is present", () => {
    const store = new ScoreStore();
    act(() => store.push({ intentScore: 55, erdScore: 40, classifierScore: 0.7, kinematicScore: null, compensationFlag: false, joints: null, isArtifact: false, mode: "csp_lda_blend", timestamp: 1 }));
    const onSwitch = vi.fn();
    render(<LiveMonitor store={store} connectionState="open" sidecarState="ready" onSwitchMode={onSwitch} />);
    const btn = screen.getByRole("button", { name: /switch mode/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onSwitch).toHaveBeenCalled();
  });
});
