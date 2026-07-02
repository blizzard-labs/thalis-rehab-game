import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PairingPanel, type PairingApi } from "./PairingPanel";

function fakeApi(): PairingApi {
  return {
    startSession: vi.fn().mockResolvedValue({ code: "ABC234", url: "https://10.0.0.5:8443/?c=ABC234" }),
    endSession: vi.fn().mockResolvedValue(undefined),
    onPatientConnected: vi.fn(),
    onPatientDisconnected: vi.fn(),
  };
}

const SESSION = { patientFirstName: "Margaret", affectedSide: "left" as const, mode: "band_power_only" };

describe("PairingPanel", () => {
  it("mints and shows the code + URL on Start Session", async () => {
    const api = fakeApi();
    render(<PairingPanel api={api} session={SESSION} />);
    fireEvent.click(screen.getByRole("button", { name: /start session/i }));
    await waitFor(() => expect(screen.getByText("ABC234")).toBeInTheDocument());
    expect(api.startSession).toHaveBeenCalledWith(SESSION);
  });

  it("shows a connected indicator when a patient pairs", async () => {
    const api = fakeApi();
    let fire: () => void = () => {};
    (api.onPatientConnected as any).mockImplementation((cb: () => void) => { fire = cb; });
    render(<PairingPanel api={api} session={SESSION} />);
    fire();
    await waitFor(() => expect(screen.getByText(/patient connected/i)).toBeInTheDocument());
  });
});
