import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const startSpy = vi.fn();
const stopSpy = vi.fn();

vi.mock("./cameraPublisher", () => ({
  createCameraPublisher: () => ({
    start: async () => {
      startSpy();
    },
    handleSignaling: vi.fn(),
    stop: stopSpy,
  }),
}));

import { useCameraPublish } from "./useCameraPublish";

let lastSignalingHandler: ((m: any) => void) | null = null;

function fakeLink(overrides: any = {}) {
  return {
    store: {} as any,
    conn: "open",
    session: { patientFirstName: "M", affectedSide: "left", mode: "band_power_only" },
    error: null,
    sendSignaling: vi.fn(),
    subscribeSignaling: (fn: any) => {
      lastSignalingHandler = fn;
    },
    ...overrides,
  };
}

describe("useCameraPublish", () => {
  beforeEach(() => {
    startSpy.mockClear();
    stopSpy.mockClear();
    lastSignalingHandler = null;
  });

  it("starts publishing when enabled", () => {
    renderHook(() => useCameraPublish(fakeLink() as any, true));
    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it("does not start when disabled", () => {
    renderHook(() => useCameraPublish(fakeLink() as any, false));
    expect(startSpy).not.toHaveBeenCalled();
  });

  it("stops publishing on unmount", () => {
    const { unmount } = renderHook(() => useCameraPublish(fakeLink() as any, true));
    unmount();
    expect(stopSpy).toHaveBeenCalled();
  });

  it("subscribes so inbound signaling reaches the publisher", () => {
    renderHook(() => useCameraPublish(fakeLink() as any, true));
    expect(lastSignalingHandler).toBeTypeOf("function");
  });
});
