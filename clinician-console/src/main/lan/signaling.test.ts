import { describe, it, expect } from "vitest";
import { handleSignalingMessage, type SignalingMessage } from "./signaling";

describe("handleSignalingMessage (S1 stub)", () => {
  it("answers a webrtc-offer with a webrtc-answer echo", () => {
    const out: SignalingMessage[] = [];
    const handled = handleSignalingMessage({ type: "webrtc-offer", sdp: "OFFER" }, (m) => out.push(m));
    expect(handled).toBe(true);
    expect(out[0].type).toBe("webrtc-answer");
  });

  it("mirrors a webrtc-ice back to the patient", () => {
    const out: SignalingMessage[] = [];
    const handled = handleSignalingMessage({ type: "webrtc-ice", candidate: { foo: 1 } }, (m) => out.push(m));
    expect(handled).toBe(true);
    expect(out[0].type).toBe("webrtc-ice");
  });

  it("returns false for non-signaling messages", () => {
    const out: SignalingMessage[] = [];
    const handled = handleSignalingMessage({ type: "pair" } as any, (m) => out.push(m));
    expect(handled).toBe(false);
    expect(out).toHaveLength(0);
  });
});
