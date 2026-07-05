import { describe, it, expect, vi, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useSession } from "./useSession";

const BASE = { patientFirstName: "Ana", affectedSide: "left" as const, mode: "garden" };

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

describe("useSession", () => {
  afterEach(() => {
    delete (window as any).neuroreach;
  });

  it("reports bridgeReady=false when no bridge is present", () => {
    const { result } = renderHook(() => useSession());
    expect(result.current.bridgeReady).toBe(false);
  });

  it("open() mints a code without arming; begin() arms with the chosen source", async () => {
    const bridge = installBridge();
    const { result } = renderHook(() => useSession());
    expect(result.current.bridgeReady).toBe(true);

    act(() => result.current.setSource("live"));
    await act(async () => { await result.current.open(BASE); });
    expect(bridge.open).toHaveBeenCalledWith({ ...BASE, source: "live" });
    expect(bridge.begin).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.code).toBe("ABC234"));
    expect(result.current.url).toBe("https://x/?c=ABC234");

    await act(async () => { await result.current.begin(); });
    expect(bridge.begin).toHaveBeenCalledWith("live");
  });

  it("flips connected when the patient-connected callback fires", async () => {
    const bridge = installBridge();
    let fire: () => void = () => {};
    bridge.onPatientConnected.mockImplementation((cb: () => void) => { fire = cb; });
    const { result } = renderHook(() => useSession());
    act(() => fire());
    await waitFor(() => expect(result.current.connected).toBe(true));
  });

  it("end() calls the bridge and setMode() forwards the mode", async () => {
    const bridge = installBridge();
    const { result } = renderHook(() => useSession());
    await act(async () => { await result.current.end(); });
    expect(bridge.end).toHaveBeenCalled();
    await act(async () => { await result.current.setMode("csp_lda_blend"); });
    expect(bridge.setMode).toHaveBeenCalledWith("csp_lda_blend");
  });
});
