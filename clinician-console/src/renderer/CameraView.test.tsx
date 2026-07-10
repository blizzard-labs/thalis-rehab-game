import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { CameraView } from "./CameraView";
import { CameraFrameStore } from "../scoring/cameraFrameStore";

describe("CameraView", () => {
  it("shows an idle state with no frame", () => {
    render(<CameraView store={new CameraFrameStore()} affectedSide="right" />);
    expect(screen.getByTestId("camera-view-idle")).toBeTruthy();
  });

  it("renders a canvas once a frame arrives", () => {
    const store = new CameraFrameStore();
    render(<CameraView store={store} affectedSide="right" />);
    act(() =>
      store.push({
        jpeg: "AAAA",
        landmarks: { pose: [[0.5, 0.5, 0.9]], hands: { left: null, right: null } },
        fps: 10,
        timestamp: 0,
      }),
    );
    expect(document.querySelector("canvas")).toBeTruthy();
    expect(screen.queryByTestId("camera-view-idle")).toBeNull();
  });
});
