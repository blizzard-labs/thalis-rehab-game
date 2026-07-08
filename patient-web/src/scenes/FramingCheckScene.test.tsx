import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FramingCheckScene } from "./FramingCheckScene";

describe("FramingCheckScene", () => {
  it("always offers a skip path that advances (EEG-only fallback)", () => {
    const onConfirm = vi.fn();
    render(<FramingCheckScene onConfirm={onConfirm} />);
    fireEvent.click(screen.getByTestId("framing-skip"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("renders the framing guide overlay", () => {
    render(<FramingCheckScene onConfirm={() => {}} />);
    expect(screen.getByTestId("framing-guide")).toBeInTheDocument();
  });

  it("disables confirm until the heuristic passes", () => {
    // jsdom has no getUserMedia -> heuristic can't pass -> confirm disabled.
    render(<FramingCheckScene onConfirm={() => {}} />);
    expect(screen.getByTestId("framing-confirm")).toBeDisabled();
  });
});
