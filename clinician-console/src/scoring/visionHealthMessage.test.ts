import { describe, it, expect } from "vitest";
import { parseVisionHealthMessage } from "./visionHealthMessage";

describe("parseVisionHealthMessage", () => {
  it("parses a well-formed frame", () => {
    const raw = JSON.stringify({
      type: "vision_health", connection: "connected", fps: 14.8,
      kinematic_active: true, degraded: false, timestamp: 123,
    });
    const r = parseVisionHealthMessage(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.frame.connection).toBe("connected");
      expect(r.frame.fps).toBe(14.8);
      expect(r.frame.kinematicActive).toBe(true);
      expect(r.frame.degraded).toBe(false);
    }
  });

  it("rejects a non-vision_health type", () => {
    const r = parseVisionHealthMessage(JSON.stringify({ type: "intent_score" }));
    expect(r.ok).toBe(false);
  });

  it("does not throw on malformed JSON", () => {
    const r = parseVisionHealthMessage("{not json");
    expect(r.ok).toBe(false);
  });

  it("defaults missing fields defensively", () => {
    const r = parseVisionHealthMessage(JSON.stringify({ type: "vision_health" }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.frame.connection).toBe("closed");
      expect(r.frame.fps).toBe(0);
      expect(r.frame.kinematicActive).toBe(false);
      expect(r.frame.degraded).toBe(false);
    }
  });
});
