import type { ReactNode, SVGProps } from "react";
import { armAt, netRadius, shoulder, type Point } from "./starGeometry";

// Five-pointed star path centered at (0,0), outer radius r.
function starPath(r: number): string {
  const inner = r * 0.42;
  let d = "";
  for (let i = 0; i < 10; i++) {
    const rad = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : inner;
    d += `${i === 0 ? "M" : "L"}${(Math.cos(rad) * rr).toFixed(2)} ${(Math.sin(rad) * rr).toFixed(2)} `;
  }
  return d + "Z";
}
const STAR = starPath(1); // unit star; scale per-use

export function StarField({
  side,
  target,
  goalPt,
  celebrate,
  cue,
  reach,
  pct,
  camera,
  guides,
  pointer,
  meterLabel = "Reach power",
}: {
  side: "left" | "right";
  target: Point;
  goalPt: Point;
  celebrate: boolean;
  cue: string;
  reach: number;
  pct: number;
  camera?: ReactNode;
  guides?: ReactNode;
  meterLabel?: string;
  pointer?: Pick<
    SVGProps<SVGSVGElement>,
    | "onPointerDown"
    | "onPointerMove"
    | "onPointerUp"
    | "onPointerCancel"
    | "onLostPointerCapture"
  >;
}) {
  const { elbow, wrist } = armAt(target, side);
  const netAngleDeg =
    (Math.atan2(-(wrist.x - elbow.x), wrist.y - elbow.y) * 180) / Math.PI;
  return (
    <div className="stars-row">
      <div className="stars-sky" aria-hidden="true" />
      <div className="stars-ground" aria-hidden="true" />

      {camera && <div className="stars-camera">{camera}</div>}

      <div className="stars-stage">
        <svg
          {...pointer}
          className={`stars-art${celebrate ? " stars-art--celebrate" : ""}`}
          data-testid="reach-scene"
          viewBox="0 0 600 660"
          role="img"
          aria-label={`${cue}: reach is ${Math.round(reach * 100)} percent toward the target`}
          preserveAspectRatio="xMidYMid meet"
        >
          {guides}
          {/* fixed goal star for the current cue — stays put; the net reaches to it */}
          <g
            data-testid="reach-goal"
            transform={`translate(${goalPt.x} ${goalPt.y})`}
          >
            <path
              d={STAR}
              transform={`scale(${34 + reach * 8})`}
              fill="#f4c84a"
              stroke="#fff"
              strokeWidth="0.06"
              opacity={0.55 + reach * 0.4}
            />
          </g>

          <g pointerEvents="none">
            {/* two-bone arm: shoulder → elbow → wrist, mirroring the real pose */}
            <line
              data-testid="arm-upper"
              x1={shoulder.x}
              y1={shoulder.y}
              x2={elbow.x}
              y2={elbow.y}
              stroke="#c98b6b"
              strokeWidth="22"
              strokeLinecap="round"
            />
            <line
              x1={shoulder.x}
              y1={shoulder.y}
              x2={shoulder.x + (elbow.x - shoulder.x) * 0.62}
              y2={shoulder.y + (elbow.y - shoulder.y) * 0.62}
              stroke="#628491"
              strokeWidth="28"
              strokeLinecap="round"
              pointerEvents="none"
            />
            <line
              data-testid="arm-fore"
              x1={elbow.x}
              y1={elbow.y}
              x2={wrist.x}
              y2={wrist.y}
              stroke="#c98b6b"
              strokeWidth="20"
              strokeLinecap="round"
            />
            <circle cx={shoulder.x} cy={shoulder.y} r="16" fill="#527584" />
            <circle cx={elbow.x} cy={elbow.y} r="12" fill="#b06a4c" />

            {/* net on the hand — handle held by the arm (points back to the elbow),
                hoop encircling the goal star; oriented along the forearm. */}
            <g
              data-testid="net"
              data-reach={reach.toFixed(2)}
              transform={`translate(${wrist.x} ${wrist.y}) rotate(${netAngleDeg.toFixed(1)})`}
            >
              {/* handle: from the hoop edge back toward the elbow (local -Y) */}
              <line
                x1="0"
                y1="-46"
                x2="0"
                y2="-74"
                stroke="#8a5a2b"
                strokeWidth="7"
                strokeLinecap="round"
              />
              {/* hoop encircling the star at the wrist */}
              <circle
                cx="0"
                cy="0"
                r={netRadius}
                fill="rgba(255,255,255,0.16)"
                stroke="#c9a24a"
                strokeWidth="6"
              />
              {/* mesh */}
              <path
                d="M-46 0 L46 0 M0 -46 L0 46 M-33 -33 L33 33 M33 -33 L-33 33 M-24 -40 L-24 40 M24 -40 L24 40 M-40 -24 L40 -24 M-40 24 L40 24"
                stroke="#c9a24a"
                strokeWidth="1.5"
                fill="none"
                opacity="0.6"
              />
            </g>
          </g>
        </svg>
      </div>

      {/* fused Reach Power meter — single number, no EEG/kinematic split */}
      <div className="reach-meter">
        <span className="reach-meter__label">{meterLabel}</span>
        <div
          className="reach-bar"
          data-testid="reach-bar"
          role="progressbar"
          aria-label={meterLabel}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div className="reach-bar-fill" style={{ height: `${pct}%` }} />
        </div>
        <span className="reach-meter__value">{pct}</span>
      </div>
    </div>
  );
}
