import { describe, it, expect } from "vitest";
import { CameraFrameStore } from "./cameraFrameStore";

describe("CameraFrameStore", () => {
  it("holds the latest frame", () => {
    const s = new CameraFrameStore();
    expect(s.getState().latest).toBeNull();
    s.push({ jpeg: "x", landmarks: { pose: [], hands: { left: null, right: null } }, fps: 1, timestamp: 0 });
    expect(s.getState().latest?.jpeg).toBe("x");
  });

  it("notifies subscribers on push", () => {
    const s = new CameraFrameStore();
    let seen = 0;
    const unsub = s.subscribe(() => (seen += 1));
    s.push({ jpeg: "y", landmarks: { pose: [], hands: { left: null, right: null } }, fps: 1, timestamp: 0 });
    expect(seen).toBe(1);
    unsub();
    s.push({ jpeg: "z", landmarks: { pose: [], hands: { left: null, right: null } }, fps: 1, timestamp: 0 });
    expect(seen).toBe(1);
  });
});
