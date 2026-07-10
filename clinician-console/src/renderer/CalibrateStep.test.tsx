import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { CalibrateStep } from "./CalibrateStep";
import { VisionHealthStore } from "../scoring/visionHealthStore";
import { CameraFrameStore } from "../scoring/cameraFrameStore";

function renderStep(props: Partial<React.ComponentProps<typeof CalibrateStep>> = {}) {
  const store = props.visionHealthStore ?? new VisionHealthStore();
  render(
    <CalibrateStep
      onNext={() => {}} onBack={() => {}} defaultSide="right"
      waitingForPatient={false} onGoLive={() => {}}
      cameraFrameStore={new CameraFrameStore()} calibrationStartedAt={null}
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

  it("emits fusion mode and affected side", () => {
    const onFusionMode = vi.fn();
    const onAffectedSide = vi.fn();
    renderStep({ onFusionMode, onAffectedSide, defaultSide: "right" });
    fireEvent.click(screen.getByRole("button", { name: /mode c/i }));
    expect(onFusionMode).toHaveBeenCalledWith("C");
    fireEvent.click(screen.getByRole("button", { name: /^left$/i }));
    expect(onAffectedSide).toHaveBeenCalledWith("left");
  });

  it("no longer renders a manual rest-pose calibrate button or status", () => {
    renderStep({});
    expect(screen.queryByText(/calibrate rest pose/i)).toBeNull();
    expect(screen.queryByTestId("calibration-status")).toBeNull();
  });

  it("shows the camera feed + three calibration status rows", () => {
    renderStep({});
    expect(screen.getByTestId("cal-status-inframe")).toBeTruthy();
    expect(screen.getByTestId("cal-status-cv")).toBeTruthy();
    expect(screen.getByTestId("cal-status-eeg")).toBeTruthy();
  });

  it("marks in-frame yes once pose landmarks arrive", () => {
    const cameraFrameStore = new CameraFrameStore();
    renderStep({ cameraFrameStore });
    expect(screen.getByTestId("cal-status-inframe").textContent).toMatch(/no/i);
    act(() =>
      cameraFrameStore.push({
        jpeg: "x",
        landmarks: { pose: [[0.5, 0.5, 0.95]], hands: { left: null, right: null } },
        fps: 10,
        timestamp: 0,
      }),
    );
    expect(screen.getByTestId("cal-status-inframe").textContent).toMatch(/yes/i);
  });

  it("pushes the patient's affected side to the engine on mount (no click needed)", () => {
    const onAffectedSide = vi.fn();
    renderStep({ onAffectedSide, defaultSide: "left" });
    expect(onAffectedSide).toHaveBeenCalledWith("left");
  });

  it("reflects the live affected side from vision_health", () => {
    const store = new VisionHealthStore();
    renderStep({ visionHealthStore: store, defaultSide: "right" });
    act(() => store.push({
      connection: "connected", fps: 15, kinematicActive: true, degraded: false,
      affectedSide: "left", calibration: "complete", restCalibrated: true, timestamp: 0,
    }));
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
