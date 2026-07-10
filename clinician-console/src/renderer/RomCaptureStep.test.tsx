import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RomCaptureStep } from "./RomCaptureStep";

describe("RomCaptureStep", () => {
  it("fires begin on click", () => {
    const onBegin = vi.fn();
    render(<RomCaptureStep onBegin={onBegin} status="idle" onDone={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /capture range of motion/i }));
    expect(onBegin).toHaveBeenCalledOnce();
  });

  it("calls onDone when status becomes complete", () => {
    const onDone = vi.fn();
    const { rerender } = render(<RomCaptureStep onBegin={() => {}} status="collecting" onDone={onDone} />);
    expect(onDone).not.toHaveBeenCalled();
    rerender(<RomCaptureStep onBegin={() => {}} status="complete" onDone={onDone} />);
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("disables the button while collecting", () => {
    render(<RomCaptureStep onBegin={() => {}} status="collecting" onDone={() => {}} />);
    expect(screen.getByRole("button", { name: /capturing/i })).toBeDisabled();
  });
});
