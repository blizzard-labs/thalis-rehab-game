import { useEffect, useRef, useState } from "react";
import type { PointerEvent, ReactNode } from "react";
import { StarField } from "../reach/StarField";
import {
  armAt,
  shoulder,
  starGoals,
  withinNet,
  type Point,
} from "../reach/starGeometry";
import type { PracticeRound, Side } from "./session";

export type CameraAim = { wrist: Point | null; goal: Point };
const skies = [
  {
    name: "The Kite",
    dots: [
      [12, 35],
      [57, 7],
      [94, 33],
      [53, 61],
      [40, 74],
      [22, 80],
    ],
  },
  {
    name: "The Sailboat",
    dots: [
      [8, 52],
      [94, 52],
      [75, 75],
      [27, 75],
      [51, 52],
      [51, 7],
    ],
  },
  {
    name: "The Crown",
    dots: [
      [8, 21],
      [26, 48],
      [53, 8],
      [78, 48],
      [97, 21],
      [84, 75],
      [22, 75],
    ],
  },
];

function constellation(rewards: number) {
  let remaining = rewards;
  const cycleLength = skies.reduce((n, sky) => n + sky.dots.length, 0);
  remaining = remaining === 0 ? 0 : ((remaining - 1) % cycleLength) + 1;
  for (const sky of skies) {
    if (remaining <= sky.dots.length) return { sky, lit: remaining };
    remaining -= sky.dots.length;
  }
  return { sky: skies[0], lit: 0 };
}

export function StarChart({ rewards }: { rewards: number }) {
  const { sky, lit } = constellation(rewards);
  return (
    <figure className="star-chart">
      <svg
        role="img"
        aria-label={`${sky.name}, ${lit} of ${sky.dots.length} stars`}
        viewBox="0 0 106 85"
      >
        <polyline
          points={sky.dots.map((p) => p.join(",")).join(" ")}
          fill="none"
          stroke="#9992b4"
          strokeDasharray="2 5"
        />
        <polyline
          points={sky.dots
            .slice(0, lit)
            .map((p) => p.join(","))
            .join(" ")}
          fill="none"
          stroke="#ffdc75"
          strokeWidth="2"
        />
        {sky.dots.map(([x, y], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={i < lit ? 3.3 : 1.8}
            fill={i < lit ? "#ffdf93" : "#aaa5bd"}
          />
        ))}
      </svg>
      <figcaption>
        {sky.name} · {lit}/{sky.dots.length}
      </figcaption>
    </figure>
  );
}

function pointerPosition(e: PointerEvent<SVGSVGElement>): Point | null {
  const matrix = e.currentTarget.getScreenCTM();
  if (!matrix) return null;
  return new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
}

export function StarPlay({
  round,
  side,
  camera,
  aim,
  scan,
  redraw,
}: {
  round: PracticeRound;
  side: Side;
  camera?: ReactNode;
  aim: CameraAim | null;
  scan: Point;
  redraw: () => void;
}) {
  const [drag, setDrag] = useState<Point | null>(null);
  const pointer = useRef<number | null>(null);
  const manual = round.source === "button";
  const celebrate = round.celebrating;
  const positions = starGoals(side);
  // Keep the captured star in the hoop for a beat before presenting the next target.
  const slot = celebrate
    ? ((round.record.rewards - 1) * 2 + 1) % 3
    : round.target;
  const goal = aim?.goal ?? positions[slot];
  let wrist: Point;
  if (aim) wrist = aim.wrist ?? shoulder;
  else if (celebrate) wrist = goal;
  else if (manual) wrist = drag ?? scan;
  else
    wrist = {
      x: shoulder.x + (goal.x - shoulder.x) * round.effortReach,
      y: shoulder.y + (goal.y - shoulder.y) * round.effortReach,
    };
  const distance = Math.hypot(wrist.x - goal.x, wrist.y - goal.y);
  const reach = Math.max(0, 1 - distance / 200);
  function release() {
    pointer.current = null;
    setDrag(null);
  }
  useEffect(() => {
    if (round.paused || !manual) release();
  }, [round.paused, manual]);
  return (
    <StarField
      side={side}
      goalPt={goal}
      target={wrist}
      celebrate={celebrate}
      reach={reach}
      pct={Math.round(100 * (manual ? reach : round.level))}
      meterLabel={manual ? "Aim" : "Reach power"}
      cue={celebrate ? "Star caught" : "Golden star"}
      camera={camera}
      guides={
        <>
          {manual &&
            positions.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r="48"
                fill="none"
                stroke="#b6aed0"
                strokeWidth="2"
                strokeDasharray="5 12"
              />
            ))}
          {celebrate && (
            <g
              className="catch-rays"
              transform={`translate(${goal.x} ${goal.y})`}
              aria-hidden="true"
            >
              {Array.from({ length: 8 }, (_, i) => (
                <path
                  key={i}
                  d="M0 -57 L0 -73"
                  transform={`rotate(${45 * i})`}
                  stroke="#ffe7a8"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              ))}
            </g>
          )}
        </>
      }
      pointer={
        manual
          ? {
              onPointerDown: (e) => {
                if (
                  round.paused ||
                  celebrate ||
                  pointer.current !== null ||
                  e.button !== 0
                )
                  return;
                pointer.current = e.pointerId;
                e.currentTarget.setPointerCapture(e.pointerId);
                setDrag(pointerPosition(e));
              },
              onPointerMove: (e) => {
                if (pointer.current === e.pointerId && !round.paused)
                  setDrag(pointerPosition(e));
              },
              onPointerUp: (e) => {
                if (pointer.current !== e.pointerId) return;
                const point = pointerPosition(e);
                if (point && !round.paused && !celebrate)
                  round.press(withinNet(armAt(point, side).wrist, goal));
                release();
                redraw();
              },
              onPointerCancel: release,
              onLostPointerCapture: release,
            }
          : undefined
      }
    />
  );
}
