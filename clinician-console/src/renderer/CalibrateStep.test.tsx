import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CalibrateStep } from "./CalibrateStep";

describe("CalibrateStep", () => {
  it("advances on Skip", () => {
    const onNext = vi.fn();
    render(<CalibrateStep onNext={onNext} onBack={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    expect(onNext).toHaveBeenCalled();
  });

  it("advances on Continue and labels itself as abbreviated", () => {
    const onNext = vi.fn();
    render(<CalibrateStep onNext={onNext} onBack={() => {}} />);
    expect(screen.getByText(/abbreviated/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onNext).toHaveBeenCalled();
  });

  it("emits fusion mode, affected side, and calibrate pose", () => {
    const onFusionMode = vi.fn();
    const onAffectedSide = vi.fn();
    const onCalibratePose = vi.fn();
    render(
      <CalibrateStep
        onNext={() => {}} onBack={() => {}}
        onFusionMode={onFusionMode} onAffectedSide={onAffectedSide}
        onCalibratePose={onCalibratePose} defaultSide="right"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /mode c/i }));
    expect(onFusionMode).toHaveBeenCalledWith("C");
    fireEvent.click(screen.getByRole("button", { name: /^left$/i }));
    expect(onAffectedSide).toHaveBeenCalledWith("left");
    fireEvent.click(screen.getByRole("button", { name: /calibrate rest pose/i }));
    expect(onCalibratePose).toHaveBeenCalled();
  });
});
