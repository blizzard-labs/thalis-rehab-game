import { describe, it, expect, vi } from "vitest";
import { EegQualityStore } from "./eegQualityStore";
import type { EegQualityFrame } from "./eegQualityMessage";

const frame = (p2p: number): EegQualityFrame => ({
  fs: 250,
  channels: [{ label: "C3", quality: "good", p2p }],
  trace: { C3: [p2p] },
  timestamp: 1,
});

describe("EegQualityStore", () => {
  it("starts empty", () => {
    expect(new EegQualityStore().getState().latest).toBeNull();
  });

  it("holds the latest frame and notifies subscribers", () => {
    const s = new EegQualityStore();
    const cb = vi.fn();
    s.subscribe(cb);
    s.push(frame(10));
    expect(cb).toHaveBeenCalledTimes(1);
    expect(s.getState().latest?.channels[0].p2p).toBe(10);
  });

  it("keeps a stable snapshot reference between pushes", () => {
    const s = new EegQualityStore();
    const a = s.getState();
    expect(s.getState()).toBe(a); // no push -> same reference
  });
});
