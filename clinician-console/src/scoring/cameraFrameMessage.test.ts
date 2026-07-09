import { describe, it, expect } from "vitest";
import { parseCameraFrameMessage } from "./cameraFrameMessage";

describe("parseCameraFrameMessage", () => {
  it("parses a valid camera_frame", () => {
    const raw = JSON.stringify({
      type: "camera_frame",
      jpeg: "AAAA",
      landmarks: { pose: [[0.1, 0.2, 0.9]], hands: { left: null, right: [[0.3, 0.4]] } },
      fps: 12.1,
      timestamp: 1,
    });
    const r = parseCameraFrameMessage(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.frame.jpeg).toBe("AAAA");
      expect(r.frame.landmarks.pose.length).toBe(1);
      expect(r.frame.landmarks.hands.left).toBeNull();
      expect(r.frame.landmarks.hands.right).toEqual([[0.3, 0.4]]);
      expect(r.frame.fps).toBe(12.1);
    }
  });

  it("rejects a non-camera_frame type", () => {
    expect(parseCameraFrameMessage(JSON.stringify({ type: "intent_score" })).ok).toBe(false);
  });

  it("never throws on malformed JSON", () => {
    expect(parseCameraFrameMessage("{not json").ok).toBe(false);
  });

  it("tolerates missing landmark fields", () => {
    const r = parseCameraFrameMessage(JSON.stringify({ type: "camera_frame", jpeg: "x" }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.frame.landmarks.pose).toEqual([]);
      expect(r.frame.landmarks.hands.left).toBeNull();
    }
  });
});
