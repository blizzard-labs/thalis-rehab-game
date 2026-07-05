import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SessionFlow } from "./SessionFlow";
import { ScoreStore } from "../scoring/scoreStore";
import { EegQualityStore } from "../scoring/eegQualityStore";
import { PatientStore } from "../data/store";

const margaret = new PatientStore().get("#0421")!;

function installBridge() {
  const bridge = {
    open: vi.fn().mockResolvedValue({ code: "ABC234", url: "https://x/?c=ABC234" }),
    begin: vi.fn().mockResolvedValue(undefined),
    end: vi.fn().mockResolvedValue(undefined),
    setMode: vi.fn().mockResolvedValue(undefined),
    onPatientConnected: vi.fn(),
    onPatientDisconnected: vi.fn(),
  };
  (window as any).neuroreach = bridge;
  return bridge;
}

function renderFlow() {
  const onExit = vi.fn();
  render(
    <SessionFlow
      patient={margaret}
      scoreStore={new ScoreStore()}
      qualityStore={new EegQualityStore()}
      connectionState="open"
      sidecarState="ready"
      onExit={onExit}
    />,
  );
  return { onExit };
}

afterEach(() => { delete (window as any).neuroreach; });

describe("SessionFlow", () => {
  it("walks signal → pair → calibrate → live, arming on live, and ends back out", async () => {
    const bridge = installBridge();
    const { onExit } = renderFlow();

    // Step 1 signal check
    fireEvent.click(screen.getByRole("button", { name: /next: pair device/i }));
    // Step 2 pair
    fireEvent.click(screen.getByRole("button", { name: /start session/i }));
    await waitFor(() => expect(screen.getByText("ABC234")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    // Step 3 calibrate
    fireEvent.click(screen.getByRole("button", { name: /continue to live/i }));
    // Step 4 live — armed once
    await waitFor(() => expect(bridge.begin).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("intent-score")).toBeTruthy();
    // End session
    fireEvent.click(screen.getByRole("button", { name: /end session/i }));
    await waitFor(() => expect(bridge.end).toHaveBeenCalled());
    expect(onExit).toHaveBeenCalled();
  });

  it("shows a desktop-app notice and disables Start when the bridge is absent", () => {
    renderFlow(); // no bridge installed
    fireEvent.click(screen.getByRole("button", { name: /next: pair device/i }));
    expect(screen.getByText(/desktop app/i)).toBeTruthy();
    expect((screen.getByRole("button", { name: /start session/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
