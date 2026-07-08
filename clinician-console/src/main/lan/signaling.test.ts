import { describe, it, expect } from "vitest";
import { isSignalingMessage } from "./signaling";

describe("isSignalingMessage", () => {
  it("accepts webrtc frames", () => {
    expect(isSignalingMessage({ type: "webrtc-offer", sdp: "x" } as any)).toBe(true);
    expect(isSignalingMessage({ type: "webrtc-answer", sdp: "x" } as any)).toBe(true);
    expect(isSignalingMessage({ type: "webrtc-ice", candidate: null } as any)).toBe(true);
  });

  it("rejects non-signaling frames", () => {
    expect(isSignalingMessage({ type: "pair" })).toBe(false);
    expect(isSignalingMessage({ type: "intent_score" })).toBe(false);
    expect(isSignalingMessage({})).toBe(false);
  });
});
