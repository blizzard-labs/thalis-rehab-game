import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { EegScope } from "./EegScope";
import { EegQualityStore } from "../scoring/eegQualityStore";

const LABELS = ["C3", "Cz", "C4", "Fz", "Pz", "P3", "P4", "Oz"];

function frame() {
  return {
    fs: 250,
    timestamp: 0,
    channels: LABELS.map((label) => ({ label, quality: "good" as const, p2p: 5 })),
    trace: Object.fromEntries(LABELS.map((l) => [l, [0, 1, -1, 0]])),
  };
}

describe("EegScope", () => {
  it("renders one row per channel once a frame arrives", () => {
    const store = new EegQualityStore();
    render(<EegScope qualityStore={store} />);
    act(() => store.push(frame()));
    expect(screen.getAllByTestId("eeg-scope-row").length).toBe(8);
  });

  it("shows a waiting state before any frame", () => {
    render(<EegScope qualityStore={new EegQualityStore()} />);
    expect(screen.getByText(/waiting for signal/i)).toBeTruthy();
  });
});
