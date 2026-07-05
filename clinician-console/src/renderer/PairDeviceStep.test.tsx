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
    ...over,
  };
  return { props, ...render(<PairDeviceStep {...props} />) };
}

describe("PairDeviceStep", () => {
  it("calls onOpen when Start Session is clicked", () => {
    const { props } = renderStep();
    fireEvent.click(screen.getByRole("button", { name: /start session/i }));
    expect(props.onOpen).toHaveBeenCalled();
  });

  it("shows the code and a QR once a code exists", async () => {
    renderStep({ code: "ABC234", url: "https://x/?c=ABC234" });
    expect(screen.getByText("ABC234")).toBeTruthy();
    await waitFor(() => expect(screen.getByAltText(/pairing qr/i)).toBeTruthy());
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
});
