import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SignalCheckStep } from "./SignalCheckStep";
import { EegQualityStore } from "../scoring/eegQualityStore";
import { PatientStore } from "../data/store";

function storeWith(channels: { label: string; quality: "good" | "check" | "poor"; p2p: number }[]) {
  const s = new EegQualityStore();
  s.push({ fs: 250, channels, trace: { C3: [1, 2, 1, 3], Cz: [0, 1], C4: [2, 1] }, timestamp: 1 });
  return s;
}
const margaret = new PatientStore().get("#0421")!;

function renderStep(over: Partial<Parameters<typeof SignalCheckStep>[0]> = {}) {
  const props = {
    qualityStore: storeWith([{ label: "C3", quality: "good" as const, p2p: 10 }]),
    patient: margaret,
    source: "sim" as const,
    onSourceChange: vi.fn(),
    onNext: vi.fn(),
    onBack: vi.fn(),
    ...over,
  };
  return { props, ...render(<SignalCheckStep {...props} />) };
}

describe("SignalCheckStep", () => {
  it("renders an electrode per channel with its quality class", () => {
    const { container } = renderStep({
      qualityStore: storeWith([
        { label: "Cz", quality: "poor", p2p: 200 },
        { label: "C3", quality: "good", p2p: 10 },
      ]),
    });
    expect(container.querySelector(".electrode.poor")?.textContent).toBe("Cz");
    expect(container.querySelector(".electrode.good")?.textContent).toBe("C3");
  });

  it("defaults the source toggle to Simulated and reports changes", () => {
    const { props } = renderStep();
    expect((screen.getByRole("radio", { name: /simulated/i }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /live headset/i }));
    expect(props.onSourceChange).toHaveBeenCalledWith("live");
  });

  it("advances on Next", () => {
    const { props } = renderStep();
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(props.onNext).toHaveBeenCalled();
  });

  it("waits for signal when no quality frame has arrived", () => {
    renderStep({ qualityStore: new EegQualityStore() });
    expect(screen.getAllByText(/waiting for headset/i).length).toBeGreaterThan(0);
  });
});
