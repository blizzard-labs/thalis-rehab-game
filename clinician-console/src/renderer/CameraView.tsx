import { useEffect, useRef } from "react";
import type { CameraFrameStore } from "../scoring/cameraFrameStore";
import type { CameraLandmarks } from "../scoring/cameraFrameMessage";
import { useCameraFrameStore } from "./useCameraFrameStore";

type Props = {
  store: CameraFrameStore;
  affectedSide: "left" | "right";
};

// MediaPipe BlazePose upper-body connections (indices into the 33-point pose).
// Arms + shoulder line — enough to read reach posture without a full skeleton.
const POSE_EDGES: [number, number][] = [
  [11, 13], [13, 15], // left shoulder→elbow→wrist
  [12, 14], [14, 16], // right shoulder→elbow→wrist
  [11, 12],           // shoulder line
  [11, 23], [12, 24], [23, 24], // torso box
];

// BlazePose left-arm landmark indices, so we can accent the affected side.
const LEFT_ARM = new Set([11, 13, 15]);
const RIGHT_ARM = new Set([12, 14, 16]);

const ACCENT = "#4ea1ff";
const MUTED = "#9aa4b2";

// C3/calibration camera mirror — draws the sidecar's JPEG frame + MediaPipe
// overlay on a canvas. Reused in the calibration and live tabs. jsdom returns a
// null 2D context, so every canvas call is guarded.
export function CameraView({ store, affectedSide }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const latest = useCameraFrameStore(store).latest;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !latest) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return; // jsdom / no 2D backend
    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth || canvas.clientWidth || 480;
      canvas.height = img.naturalHeight || canvas.clientHeight || 360;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      drawOverlay(ctx, latest.landmarks, canvas.width, canvas.height, affectedSide);
    };
    img.src = `data:image/jpeg;base64,${latest.jpeg}`;
  }, [latest, affectedSide]);

  if (!latest) {
    return (
      <div className="camera-view camera-view--idle" data-testid="camera-view-idle">
        no camera link
      </div>
    );
  }
  return (
    <div className="camera-view">
      <canvas ref={canvasRef} className="camera-view-canvas" />
    </div>
  );
}

function armColor(idx: number, affectedSide: "left" | "right"): string {
  const affectedSet = affectedSide === "left" ? LEFT_ARM : RIGHT_ARM;
  return affectedSet.has(idx) ? ACCENT : MUTED;
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  lm: CameraLandmarks,
  w: number,
  h: number,
  affectedSide: "left" | "right",
): void {
  const pose = lm.pose;
  ctx.lineWidth = 2;
  for (const [a, b] of POSE_EDGES) {
    const pa = pose[a];
    const pb = pose[b];
    if (!pa || !pb) continue;
    // Accent the edge if either endpoint is on the affected arm.
    const affectedSet = affectedSide === "left" ? LEFT_ARM : RIGHT_ARM;
    ctx.strokeStyle = affectedSet.has(a) || affectedSet.has(b) ? ACCENT : MUTED;
    ctx.beginPath();
    ctx.moveTo(pa[0] * w, pa[1] * h);
    ctx.lineTo(pb[0] * w, pb[1] * h);
    ctx.stroke();
  }
  pose.forEach((p, idx) => {
    if (!p) return;
    ctx.fillStyle = armColor(idx, affectedSide);
    ctx.beginPath();
    ctx.arc(p[0] * w, p[1] * h, 3, 0, Math.PI * 2);
    ctx.fill();
  });
  for (const side of ["left", "right"] as const) {
    const hand = lm.hands[side];
    if (!hand) continue;
    ctx.fillStyle = side === affectedSide ? ACCENT : MUTED;
    for (const p of hand) {
      ctx.beginPath();
      ctx.arc(p[0] * w, p[1] * h, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
