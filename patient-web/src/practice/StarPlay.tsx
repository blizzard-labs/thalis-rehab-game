import {
  chartPath,
  completedConstellationCount,
  type StarLayout,
} from "./constellations";
import { CompletedSky } from "./CompletedSky";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent, ReactNode } from "react";
import { StarField } from "../reach/StarField";
import { armAt, shoulder, withinNet, type Point } from "../reach/starGeometry";
import type { PracticeRound, Side } from "./session";

export type CameraAim = { wrist: Point | null; goal: Point };
export function StarChart({
  layout,
  lit,
}: {
  layout: StarLayout;
  lit: number;
}) {
  const sky = layout;
  return (
    <figure className="star-chart">
      <svg
        role="img"
        aria-label={`${sky.name}, ${lit} of ${sky.dots.length} stars`}
        viewBox="0 0 106 85"
      >
        <path
          d={chartPath(sky)}
          fill="none"
          stroke="#9992b4"
          strokeDasharray="2 5"
        />
        <path
          d={chartPath(sky, lit)}
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
  layout,
  redraw,
}: {
  round: PracticeRound;
  side: Side;
  camera?: ReactNode;
  aim: CameraAim | null;
  scan: Point;
  layout: StarLayout;
  redraw: () => void;
}) {
  const [drag, setDrag] = useState<Point | null>(null);
  const pointer = useRef<number | null>(null);
  const manual = round.source === "button";
  const celebrate = round.celebrating;
  const goal = aim?.goal ?? layout.goal;
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
      background={
        <CompletedSky
          count={completedConstellationCount(round.record.rewards)}
        />
      }
      guides={
        <>
          {!aim && (
            <g aria-hidden="true" pointerEvents="none">
              <polyline
                points={layout.points
                  .slice(0, layout.index + 1)
                  .map((p) => `${p.x},${p.y}`)
                  .join(" ")}
                fill="none"
                stroke="#e4cd92"
                strokeWidth="2"
                strokeDasharray="5 6"
              />
              {layout.points.slice(0, layout.index).map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="6" fill="#ffdb81" />
              ))}
            </g>
          )}
          {manual &&
            layout.stops.map((p, i) => (
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
          {aim && !celebrate && round.catchProgress > 0 && (
            <circle
              cx={goal.x}
              cy={goal.y}
              r="54"
              pathLength="1"
              fill="none"
              stroke="#fff1aa"
              strokeWidth="5"
              transform={`rotate(-90 ${goal.x} ${goal.y})`}
              strokeDasharray={`${round.catchProgress} 1`}
              pointerEvents="none"
            />
          )}
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
