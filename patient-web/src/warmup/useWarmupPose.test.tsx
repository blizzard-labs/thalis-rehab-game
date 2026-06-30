import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWarmupPose } from "./useWarmupPose";
import { IMAGINE_DURATION_MS } from "./warmupMotion";
import { getPose } from "./handPoses";

const open = getPose("open");
const closed = getPose("closedGrasp");

let now = 0;
let rafCbs: FrameRequestCallback[] = [];

beforeEach(() => {
  now = 0;
  rafCbs = [];
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    rafCbs.push(cb);
    return rafCbs.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Advance the fake clock and flush one batch of scheduled RAF callbacks. */
function pump(ms: number) {
  now += ms;
  const batch = rafCbs.splice(0);
  act(() => {
    batch.forEach((cb) => cb(now));
  });
}

describe("useWarmupPose", () => {
  it("starts at the open pose for the imagine phase", () => {
    const { result } = renderHook(() => useWarmupPose("imagine"));
    expect(result.current.index.mcp).toBeCloseTo(open.index.mcp, 5);
  });

  it("reaches the closed pose at the end of the imagine phase", () => {
    const { result } = renderHook(() => useWarmupPose("imagine"));
    pump(IMAGINE_DURATION_MS);
    expect(result.current.index.mcp).toBeCloseTo(closed.index.mcp, 5);
  });
});
