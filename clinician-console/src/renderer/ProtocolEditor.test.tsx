import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProtocolEditor } from "./ProtocolEditor";
import { PatientStore } from "../data/store";

describe("ProtocolEditor (C5)", () => {
  let store: PatientStore;
  beforeEach(() => {
    store = new PatientStore();
  });

  it("reflects the patient's current protocol", () => {
    render(<ProtocolEditor store={store} patientId="#0421" />);
    expect((screen.getByLabelText(/trials per block/i) as HTMLInputElement).value).toBe("20");
    // mode segmented control: Blended active
    const blended = screen.getByRole("button", { name: "Blended" });
    expect(blended.className).toContain("active");
  });

  it("shows the calibration auto-switch note when present", () => {
    render(<ProtocolEditor store={store} patientId="#0421" />);
    expect(screen.getByText(/Auto-switched to Blended/i)).toBeTruthy();
  });

  it("saves edits back to the store", () => {
    render(<ProtocolEditor store={store} patientId="#0421" />);
    fireEvent.change(screen.getByLabelText(/trials per block/i), { target: { value: "28" } });
    fireEvent.click(screen.getByRole("button", { name: "Active" }));
    fireEvent.click(screen.getByText(/Save protocol/i));
    const proto = store.get("#0421")!.protocol;
    expect(proto.trialsPerBlock).toBe(28);
    expect(proto.mode).toBe("Active");
  });

  it("toggles an enabled mini-game", () => {
    render(<ProtocolEditor store={store} patientId="#0421" />);
    // River Rowing starts disabled for Margaret; enable it
    fireEvent.click(screen.getByLabelText("River Rowing"));
    fireEvent.click(screen.getByText(/Save protocol/i));
    expect(store.get("#0421")!.protocol.enabledGames).toContain("River Rowing");
  });
});
