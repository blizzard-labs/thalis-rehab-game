import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PairDeviceStep } from "./PairDeviceStep";

function renderStep(over: Partial<Parameters<typeof PairDeviceStep>[0]> = {}) {
  const props = {
    code: null as string | null,
    url: null as string | null,
    connected: false,
    bridgeReady: true,
    onOpen: vi.fn().mockResolvedValue(undefined),
    onNext: vi.fn(),
    onBack: vi.fn(),
    waitingForPatient: false,
    ...over,
  };
  return { props, ...render(<PairDeviceStep {...props} />) };
}

describe("PairDeviceStep", () => {
  it("auto-mints the pairing code on mount when the bridge is ready", async () => {
    const { props } = renderStep();
    await waitFor(() => expect(props.onOpen).toHaveBeenCalled());
  });

  it("does not auto-mint once a code already exists", () => {
    const { props } = renderStep({ code: "ABC234", url: "https://x/?c=ABC234" });
    expect(props.onOpen).not.toHaveBeenCalled();
  });

  it("shows the code and a QR once a code exists", async () => {
    renderStep({ code: "ABC234", url: "https://x/?c=ABC234" });
    expect(screen.getByText("ABC234", { selector: ".pairing-code" })).toBeTruthy();
    await waitFor(() => expect(screen.getByAltText(/pairing qr/i)).toBeTruthy());
  });

  it("shows join instructions with the patient URL once a code exists", () => {
    renderStep({ code: "ABC234", url: "https://x/?c=ABC234" });
    expect(screen.getByText(/start on the patient's computer/i)).toBeTruthy();
    expect(screen.getByText("https://x/?c=ABC234")).toBeTruthy();
  });

  it("reflects patient-connected status", () => {
    renderStep({ code: "ABC234", url: "https://x/?c=ABC234", connected: true });
    expect(screen.getByText(/patient connected/i)).toBeTruthy();
  });

  it("can continue without a paired patient (not hard-gated)", () => {
    const { props } = renderStep({ code: "ABC234", url: "https://x/?c=ABC234", connected: false });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(props.onNext).toHaveBeenCalled();
  });

  it("shows a desktop-app notice when the bridge is absent", () => {
    renderStep({ bridgeReady: false });
    expect(screen.getByText(/desktop app/i)).toBeTruthy();
  });

  it("disables Continue and shows the spinner while waiting for the patient", () => {
    renderStep({ code: "ABC234", url: "https://x/?c=ABC234", waitingForPatient: true });
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
    expect(screen.getByTestId("waiting-spinner")).toHaveTextContent(/waiting for patient/i);
  });

  it("enables Continue and hides the spinner once the patient has begun", () => {
    renderStep({ code: "ABC234", url: "https://x/?c=ABC234", waitingForPatient: false });
    expect(screen.getByRole("button", { name: /continue/i })).not.toBeDisabled();
    expect(screen.queryByTestId("waiting-spinner")).toBeNull();
  });
});
