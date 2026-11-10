import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { wristOffset } from "./motion";
import type { Side } from "./session";

let detector: PoseLandmarker | undefined;
self.onmessage = async ({
  data,
}: MessageEvent<{
  kind: "open" | "frame";
  frame: ImageBitmap;
  side: Side;
  time: number;
}>) => {
  try {
    if (data.kind === "open") {
      const files = await FilesetResolver.forVisionTasks(
        new URL("/vision-wasm/", self.location.origin).href,
      );
      detector = await PoseLandmarker.createFromOptions(files, {
        canvas: new OffscreenCanvas(1, 1),
        baseOptions: { modelAssetPath: "/models/pose_landmarker_lite.task" },
        runningMode: "VIDEO",
        numPoses: 1,
      });
      self.postMessage({ kind: "ready" });
    } else if (detector) {
      const pose =
        detector.detectForVideo(data.frame, data.time).landmarks[0] ?? [];
      self.postMessage({
        kind: "sample",
        point: wristOffset(pose, data.side),
        otherPoint: wristOffset(pose, data.side === "left" ? "right" : "left"),
        time: data.time,
      });
    }
  } catch {
    self.postMessage({
      kind: "error",
      message:
        "Local pose tracking could not start on this browser. Try another browser or use one button.",
    });
  } finally {
    data.frame?.close();
  }
};
