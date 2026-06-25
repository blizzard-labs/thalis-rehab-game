import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Setup } from "./Setup";
import { EegQualityStore } from "../scoring/eegQualityStore";
import { PatientStore } from "../data/store";

function storeWith(channels: { label: string; quality: "good" | "check" | "poor"; p2p: number }[]) {
  const s = new EegQualityStore();
  s.push({ fs: 250, channels, trace: { C3: [1, 2, 1, 3], Cz: [0, 1], C4: [2, 1] }, timestamp: 1 });
  return s;
}

const margaret = new PatientStore().get("#0421")!;

describe("Setup (C2)", () => {
  it("renders an electrode for each channel with its quality class", () => {
    const q = storeWith([
      { label: "Cz", quality: "poor", p2p: 200 },
      { label: "C3", quality: "good", p2p: 10 },
    ]);
    const { container } = render(<Setup qualityStore={q} patient={margaret} onProceed={() => {}} onBack={() => {}} />);
    const poor = container.querySelector(".electrode.poor");
    expect(poor?.textContent).toBe("Cz");
    expect(container.querySelector(".electrode.good")?.textContent).toBe("C3");
  });

  it("shows a plain-language contact alert when a channel is not good", () => {
    const q = storeWith([{ label: "Cz", quality: "poor", p2p: 200 }]);
    const { container } = render(<Setup qualityStore={q} patient={margaret} onProceed={() => {}} onBack={() => {}} />);
    const alert = container.querySelector(".alert");
    expect(alert?.textContent).toMatch(/Cz/);
    expect(alert?.textContent).toMatch(/contact/i);
  });

  it("advances to calibration", () => {
    const onProceed = vi.fn();
    const q = storeWith([{ label: "C3", quality: "good", p2p: 10 }]);
    render(<Setup qualityStore={q} patient={margaret} onProceed={onProceed} onBack={() => {}} />);
    fireEvent.click(screen.getByText(/Next: Calibration/i));
    expect(onProceed).toHaveBeenCalled();
  });

  it("waits for signal when no quality frame has arrived", () => {
    render(<Setup qualityStore={new EegQualityStore()} patient={margaret} onProceed={() => {}} onBack={() => {}} />);
    expect(screen.getAllByText(/waiting for headset/i).length).toBeGreaterThan(0);
  });
});
