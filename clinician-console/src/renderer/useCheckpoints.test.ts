import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useCheckpoints } from "./useCheckpoints";

function installBridge() {
  let cb: ((c: string) => void) | null = null;
  const bridge = {
    getCheckpointState: vi
      .fn()
      .mockResolvedValue({ patientBegan: true, patientCalibrated: false, clinicianLive: false }),
    onPatientCheckpoint: vi.fn((fn: (c: string) => void) => {
      cb = fn;
    }),
    sendClinicianCheckpoint: vi.fn().mockResolvedValue(undefined),
  };
  (window as any).neuroreach = bridge;
  return { bridge, fire: (c: string) => cb?.(c) };
}

beforeEach(() => {
  delete (window as any).neuroreach;
});

describe("useCheckpoints", () => {
  it("is inactive with no bridge", () => {
    const { result } = renderHook(() => useCheckpoints());
    expect(result.current.active).toBe(false);
    expect(result.current.patientBegan).toBe(false);
  });

  it("hydrates from the snapshot and reacts to live checkpoints", async () => {
    const { fire } = installBridge();
    const { result } = renderHook(() => useCheckpoints());
    expect(result.current.active).toBe(true);
    await waitFor(() => expect(result.current.patientBegan).toBe(true));
    expect(result.current.patientCalibrated).toBe(false);
    act(() => fire("calibration-complete"));
    expect(result.current.patientCalibrated).toBe(true);
  });

  it("sends go-live through the bridge", () => {
    const { bridge } = installBridge();
    const { result } = renderHook(() => useCheckpoints());
    act(() => result.current.sendGoLive());
    expect(bridge.sendClinicianCheckpoint).toHaveBeenCalledWith("go-live");
  });
});
