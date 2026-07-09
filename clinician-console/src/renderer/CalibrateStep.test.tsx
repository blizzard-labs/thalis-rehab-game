import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { CalibrateStep } from "./CalibrateStep";
import { VisionHealthStore } from "../scoring/visionHealthStore";

function renderStep(props: Partial<React.ComponentProps<typeof CalibrateStep>> = {}) {
  const store = props.visionHealthStore ?? new VisionHealthStore();
  render(
    <CalibrateStep
      onNext={() => {}} onBack={() => {}} defaultSide="right"
      waitingForPatient={false} onGoLive={() => {}}
      {...props} visionHealthStore={store}
    />,
  );
  return store;
}

describe("CalibrateStep", () => {
  it("advances on Skip", () => {
    const onNext = vi.fn();
    renderStep({ onNext });
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    expect(onNext).toHaveBeenCalled();
  });

  it("advances on Continue and labels itself as abbreviated", () => {
    const onNext = vi.fn();
    renderStep({ onNext });
    expect(screen.getByText(/abbreviated/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onNext).toHaveBeenCalled();
  });

  it("emits fusion mode, affected side, and calibrate pose", () => {
    const onFusionMode = vi.fn();
    const onAffectedSide = vi.fn();
    const onCalibratePose = vi.fn();
    renderStep({ onFusionMode, onAffectedSide, onCalibratePose, defaultSide: "right" });
    fireEvent.click(screen.getByRole("button", { name: /mode c/i }));
    expect(onFusionMode).toHaveBeenCalledWith("C");
    fireEvent.click(screen.getByRole("button", { name: /^left$/i }));
    expect(onAffectedSide).toHaveBeenCalledWith("left");
    fireEvent.click(screen.getByRole("button", { name: /calibrate rest pose/i }));
    expect(onCalibratePose).toHaveBeenCalled();
  });

  it("pushes the patient's affected side to the engine on mount (no click needed)", () => {
    const onAffectedSide = vi.fn();
    renderStep({ onAffectedSide, defaultSide: "left" });
    expect(onAffectedSide).toHaveBeenCalledWith("left");
  });

  it("reflects the live affected side + calibration state from vision_health", () => {
    const store = new VisionHealthStore();
    renderStep({ visionHealthStore: store, defaultSide: "right" });
    // Before frames: waiting for camera.
    expect(screen.getByTestId("calibration-status")).toHaveTextContent(/waiting for the patient camera/i);
    act(() => store.push({
      connection: "connected", fps: 15, kinematicActive: true, degraded: false,
      affectedSide: "left", calibration: "complete", restCalibrated: true, timestamp: 0,
    }));
    expect(screen.getByTestId("calibration-status")).toHaveTextContent(/calibrated/i);
    // Live side (left) wins over the local default (right).
    expect(screen.getByRole("button", { name: /^left$/i }).className).toMatch(/btn-primary/);
  });

  it("disables 'Continue to live' and shows the spinner while waiting for calibration", () => {
    renderStep({ waitingForPatient: true });
    expect(screen.getByRole("button", { name: /continue to live/i })).toBeDisabled();
    expect(screen.getByTestId("waiting-spinner")).toHaveTextContent(/waiting for patient/i);
  });

  it("fires go-live from both Continue to live and Skip", () => {
    const onGoLive = vi.fn();
    const onNext = vi.fn();
    renderStep({ waitingForPatient: false, onGoLive, onNext });
    fireEvent.click(screen.getByRole("button", { name: /continue to live/i }));
    fireEvent.click(screen.getByRole("button", { name: /^skip$/i }));
    expect(onGoLive).toHaveBeenCalledTimes(2);
    expect(onNext).toHaveBeenCalledTimes(2);
  });

  it("keeps Skip enabled even while waiting", () => {
    renderStep({ waitingForPatient: true });
    expect(screen.getByRole("button", { name: /^skip$/i })).not.toBeDisabled();
  });
});
