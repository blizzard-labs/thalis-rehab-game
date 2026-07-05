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
});
