import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  distinctDirection,
  maxReachDirections,
  reachProgress,
  type Point,
} from "./motion";
import type { useMotionCamera } from "./useMotionCamera";
import type { Side } from "./session";

export type ReachCalibration = { rest: Point; directions: Point[] };

function DirectionGuide({
  rest,
  saved,
  current,
}: {
  rest: Point;
  saved: Point[];
  current: Point | null;
}) {
  function tip(p: Point) {
    const dx = rest.x - p.x,
      dy = p.y - rest.y;
    const scale = 44 / Math.max(0.06, Math.hypot(dx, dy));
    return { x: 60 + dx * scale, y: 60 + dy * scale };
  }
  const live = current && tip(current);
  return (
    <svg
      className="direction-guide"
      viewBox="0 0 120 120"
      role="img"
      aria-label={`Your reach directions, ${saved.length} saved`}
    >
      <circle
        cx="60"
        cy="60"
        r="45"
        fill="none"
        stroke="var(--nr-control-line)"
        strokeDasharray="2 4"
      />
      {saved.map((point, i) => {
        const p = tip(point);
        return (
          <g key={i}>
            <line
              x1="60"
              y1="60"
              x2={p.x}
              y2={p.y}
              stroke="var(--nr-blue)"
              strokeWidth="2"
            />
            <circle cx={p.x} cy={p.y} r="9" fill="var(--nr-blue)" />
            <text
              x={p.x}
              y={p.y + 3.5}
              fontSize="10"
              textAnchor="middle"
              fill="white"
            >
              {i + 1}
            </text>
          </g>
        );
      })}
      {live && (
        <g stroke="#75508f" fill="none">
          <line x1="60" y1="60" x2={live.x} y2={live.y} strokeWidth="3" />
          <circle cx={live.x} cy={live.y} r="11" strokeWidth="2" />
        </g>
      )}
      <circle cx="60" cy="60" r="4" fill="var(--nr-ink)" />
    </svg>
  );
}

export function ReachSetup({
  camera,
  side,
  stars,
  onReady,
  children,
}: {
  camera: ReturnType<typeof useMotionCamera>;
  side: Side;
  stars: boolean;
  onReady: (calibration: ReachCalibration) => void;
  children: ReactNode;
}) {
  const [rest, setRest] = useState<Point | null>(null);
  const [saved, setSaved] = useState<Point[]>([]);
  const [hint, setHint] = useState("");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [current, setCurrent] = useState<Point | null>(null);
  const preview = useRef<HTMLVideoElement>(null);
  const liveCamera = useRef(camera);
  liveCamera.current = camera;
  useEffect(() => {
    if (preview.current) preview.current.srcObject = camera.stream;
  }, [camera.stream]);
  useEffect(() => {
    if (!stars || !rest) return;
    const id = window.setInterval(
      () => setCurrent(liveCamera.current.steady()?.point ?? null),
      140,
    );
    return () => window.clearInterval(id);
  }, [stars, rest]);

  function capture(point: Point | null) {
    if (!point) {
      setHint("Keep your shoulder, wrist and hip in view, then try again.");
      return;
    }
    if (!rest) {
      setRest(point);
      setHint("");
      return;
    }
    if (reachProgress(rest, point, point) === null) {
      setHint(
        "That reach was close to rest. Try a different comfortable position.",
      );
      return;
    }
    if (!stars) {
      onReady({ rest, directions: [point] });
      return;
    }
    const duplicate = saved.findIndex(
      (previous) => !distinctDirection(rest, previous, point),
    );
    if (duplicate >= 0) {
      setHint(
        `That matches direction ${duplicate + 1}. Aim the purple ring away from that number and try again.`,
      );
      return;
    }
    if (saved.length < maxReachDirections) setSaved([...saved, point]);
    setHint("");
  }
  // Read the pose at the end of the countdown so operating the control and
  // holding the reach can be done with the same hand.
  const finishCapture = useRef(capture);
  finishCapture.current = capture;
  useEffect(() => {
    if (countdown === null) return;
    const id = window.setTimeout(() => {
      if (countdown > 1) setCountdown(countdown - 1);
      else {
        finishCapture.current(liveCamera.current.steady()?.point ?? null);
        setCountdown(null);
      }
    }, 1000);
    return () => window.clearTimeout(id);
  }, [countdown]);

  function startCapture() {
    setHint("");
    if (stars) setCountdown(2);
    else capture(camera.latest());
  }
  return (
    <section className="practice-panel">
      <h1>Set your reach</h1>
      <p>
        Keep your {side} shoulder, wrist, and hip in view.{" "}
        {stars
          ? "Save one to four comfortable directions. Each capture gives you two seconds to move into position."
          : "Choose a movement that feels comfortable."}
      </p>
      <div className="reach-setup-preview">
        <video
          ref={preview}
          autoPlay
          playsInline
          muted
          className="practice-preview"
          aria-label="Mirrored camera preview"
        />
        {stars && rest && (
          <DirectionGuide rest={rest} saved={saved} current={current} />
        )}
      </div>
      <p role="status">{camera.status}</p>
      {stars && rest && (
        <strong>
          {saved.length} of {maxReachDirections} directions saved
        </strong>
      )}
      <p role="status">
        {countdown !== null
          ? `Hold your ${rest ? "reach" : "resting position"} · ${countdown}`
          : !rest
            ? "Let your arm rest in its starting position."
            : saved.length === maxReachDirections
              ? "Your four directions are ready."
              : stars
                ? `Aim in direction ${saved.length + 1}, then hold through the countdown.`
                : "Move your hand to a comfortable reach and hold it there."}
      </p>
      <div className="button-row">
        {countdown !== null ? (
          <button onClick={() => setCountdown(null)}>Cancel capture</button>
        ) : (
          <>
            {saved.length < maxReachDirections && (
              <button className="primary" onClick={startCapture}>
                {!rest
                  ? "Set resting position"
                  : stars
                    ? `Save direction ${saved.length + 1}`
                    : "Set comfortable reach"}
              </button>
            )}
            {rest && saved.length > 0 && (
              <>
                <button
                  className="primary"
                  onClick={() => onReady({ rest, directions: saved })}
                >
                  Play with {saved.length}{" "}
                  {saved.length === 1 ? "direction" : "directions"}
                </button>
                <button
                  onClick={() => {
                    setSaved(saved.slice(0, -1));
                    setHint("");
                  }}
                >
                  Undo last direction
                </button>
              </>
            )}
            {stars && rest && saved.length === 0 && (
              <button
                onClick={() => {
                  setRest(null);
                  setHint("");
                }}
              >
                Retake resting position
              </button>
            )}
          </>
        )}
        {children}
      </div>
      {hint && <p role="alert">{hint}</p>}
    </section>
  );
}
