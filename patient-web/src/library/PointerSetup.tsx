import { useEffect, useRef, useState, type ReactNode } from "react";
import type { useMotionCamera } from "../practice/useMotionCamera";
import type { Point } from "../practice/motion";

export type PointerRange = { rest: Point; topLeft: Point; bottomRight: Point };
export function pointerPosition(range: PointerRange, point: Point) {
  return {
    x: Math.max(
      0.01,
      Math.min(
        0.99,
        (point.x - range.topLeft.x) / (range.bottomRight.x - range.topLeft.x),
      ),
    ),
    y: Math.max(
      0.01,
      Math.min(
        0.99,
        (point.y - range.topLeft.y) / (range.bottomRight.y - range.topLeft.y),
      ),
    ),
  };
}
export function cameraDirection(range: PointerRange, point: Point) {
  const x =
    (2 * (point.x - range.rest.x)) / (range.bottomRight.x - range.topLeft.x);
  const y =
    (2 * (point.y - range.rest.y)) / (range.bottomRight.y - range.topLeft.y);
  return {
    level: Math.min(1, Math.max(Math.abs(x), Math.abs(y))),
    key:
      Math.abs(x) > Math.abs(y)
        ? x > 0
          ? "ArrowRight"
          : "ArrowLeft"
        : y > 0
          ? "ArrowDown"
          : "ArrowUp",
  };
}
export function PointerSetup({
  camera,
  ready,
  children,
}: {
  camera: ReturnType<typeof useMotionCamera>;
  ready: (range: PointerRange) => void;
  children: ReactNode;
}) {
  const [points, setPoints] = useState<Point[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const current = useRef(camera);
  current.current = camera;
  useEffect(() => {
    if (video.current) video.current.srcObject = camera.stream;
  }, [camera.stream]);
  useEffect(() => {
    if (count === null) return;
    const timer = window.setTimeout(() => {
      if (count > 1) {
        setCount(count - 1);
        return;
      }
      setCount(null);
      const point = current.current.steady()?.point;
      if (!point) {
        setError("Keep your shoulder, wrist and hip in view, then try again.");
        return;
      }
      if (points.length === 2) {
        if (
          Math.abs(point.x - points[1].x) < 0.12 ||
          Math.abs(point.y - points[1].y) < 0.12
        ) {
          setError(
            "Choose a different comfortable corner, farther across and down from the first one.",
          );
          return;
        }
        ready({ rest: points[0], topLeft: points[1], bottomRight: point });
      } else setPoints([...points, point]);
    }, 1000);
    return () => clearTimeout(timer);
  }, [count, points, ready]);
  const positions = [
    "resting position",
    "top-left reach",
    "bottom-right reach",
  ];
  return (
    <section className="practice-panel controller-setup">
      <h1>Set your pointer range</h1>
      <p>
        Choose a small, comfortable area for your hand. It will cover the whole
        game screen.
      </p>
      <video
        ref={video}
        autoPlay
        muted
        playsInline
        className="practice-preview"
        aria-label="Mirrored camera preview"
      />
      <p role="status">{camera.status}</p>
      <p>
        {points.length === 0
          ? "Rest your hand comfortably with room to move a little in all four directions."
          : points.length === 1
            ? "Move toward the top-left of your mirrored preview and hold comfortably."
            : "Move toward the bottom-right of your mirrored preview and hold comfortably."}
      </p>
      {count !== null && (
        <p role="status">
          Hold your {positions[points.length]} · {count}
        </p>
      )}
      <div className="button-row">
        <button
          className="primary"
          disabled={count !== null}
          onClick={() => {
            setError("");
            setCount(2);
          }}
        >
          {points.length === 0
            ? "Set resting position"
            : `Save ${positions[points.length]}`}
        </button>
        {points.length > 0 && (
          <button
            onClick={() => {
              setCount(null);
              setPoints([]);
              setError("");
            }}
          >
            Start calibration again
          </button>
        )}
        {children}
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
