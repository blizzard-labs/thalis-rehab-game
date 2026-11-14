import { TrailSky, Horizon } from "./Horizon";
import { useLandscape } from "./useLandscape";
import { useId, useRef } from "react";
import type { Side } from "../practice/session";

import {
  riverLanding,
  strokesPerBend,
  type Channel,
  type Landfall,
} from "./riverJourney";
import { NearBank, RiverBank, riverLight } from "./RiverBank";

function Heron() {
  return (
    <g strokeLinejoin="round">
      <path d="M3 6l3 23m8-23 4 24" stroke="#685444" strokeWidth="2" />
      <path
        d="M-23 6q9-16 29-9l7-16q2-9 11-8l10 4-13 3-3 21q-6 15-41 5"
        fill="#c6d7d4"
      />
      <path d="M-21 6q12-12 27-8L-6 9Z" fill="#708f95" />
      <path d="m23-25 20 3-18 2" fill="#d5a44f" />
    </g>
  );
}

function RiverSighting({
  channel,
  leg,
  approach,
}: {
  channel: Channel;
  leg: number;
  approach: number;
}) {
  if (leg === 5)
    return (
      <g>
        <path
          d="M-54 5h103m-80 0v13m59-16v15"
          stroke="#8e7156"
          strokeWidth="5"
        />
        <g
          transform={`translate(${-18 + approach * 38} ${4 - Math.sin(approach * Math.PI) * 4})`}
        >
          <path d="M-25-3q25 6 53-1L17 8H-15Z" fill="#a46852" />
          <path d="M0-4v-39" stroke="#735e4c" strokeWidth="2.5" />
          <path
            d="M-2-40-21-7h19Zm5 8V-6h14Z"
            fill={channel === "stone" ? "#d8c395" : "#efd3ad"}
          />
        </g>
      </g>
    );
  if (leg === 4 && channel === "stone")
    return (
      <g>
        <path
          d="m-62 4 9-28 17-1 15-27 24 5 17-12 23 8 20 54Z"
          fill="#958d7e"
        />
        <path d="m-18-39 19-2q-4 24 7 43h-25q7-16-1-41Z" fill="#aed1c7" />
        <path
          d="M-12-34q7 21-1 35m9-35q-2 18 5 33"
          stroke="#e3e8d7"
          strokeWidth="3"
          fill="none"
        />
        <ellipse cy="4" rx={16 + approach * 11} ry="4" fill="#dce8d9" />
      </g>
    );
  if (leg === 4)
    return (
      <g>
        {[0, 1, 2, 3].map((i) => (
          <g key={i} transform={`translate(${i * 16 - 24} ${(i % 2) * 7})`}>
            <ellipse rx="13" ry="4" fill="#7a9b65" />
            <path
              d="M0 0q-10-1-10-8 6-1 10 5 4-10 9-8 2 9-9 11Z"
              fill={i % 2 ? "#e6ac9d" : "#f7d7bc"}
              transform={`scale(${0.65 + approach * 0.35})`}
            />
          </g>
        ))}
      </g>
    );

  if (channel === "stone") {
    if (leg === 1)
      return (
        <g fill="#8d7662">
          <path d="M-64 8v-37l128-5V8H33v-10a29 29 0 0 0-58 0V8Z" />
          <path d="m-69-31 139-6v6l-139 6Z" fill="#c5ac84" />
        </g>
      );
    if (leg === 3)
      return (
        <g transform={`translate(${approach * 19} 0)`}>
          <path d="m-43 6 19-15 22 4 20-11 29 15Z" fill="#7f8d84" />
          <path d="M-8-9q15-24 25-11 5 10-9 13Z" fill="#765747" />
          <circle cx="19" cy="-20" r="6" fill="#8c6d58" />
        </g>
      );
    return (
      <g fill={leg === 2 ? "#ab7758" : "#828479"}>
        <path d="m-36 5 11-24 25-3L16 5Z" />
        <path d="m-22-20 9-17 19 2 4 13Z" />
        <path d="m-10-37 8-11 12 11Z" />
      </g>
    );
  }
  if (leg === 1)
    return (
      <g transform={`translate(${approach * 48} ${-approach * 36})`}>
        <Heron />
        {approach > 0.12 && (
          <path
            d="M0 2q-15-23-38-24 12 19 30 25Z"
            fill="#9eb6b7"
            transform={`rotate(${Math.sin(approach * 12) * 16})`}
          />
        )}
      </g>
    );
  if (leg === 2)
    return (
      <g>
        <path d="M-49 4v-40h64V4Z" fill="#c29c72" />
        <path d="m-58-35 38-32 43 31Z" fill="#846556" />
        <path d="M-37 4v-24h12V4Z" fill="#77634f" />
        <rect x="-9" y="-28" width="11" height="11" fill="#a9c7bc" />
        <g
          transform={`translate(18 -8) rotate(${approach * 190})`}
          stroke="#77573d"
          strokeWidth="4"
          fill="none"
        >
          <circle r="20" />
          {[0, 45, 90, 135].map((a) => (
            <path key={a} d="M-20 0h40" transform={`rotate(${a})`} />
          ))}
        </g>
      </g>
    );
  if (leg === 3)
    return (
      <g
        transform={`translate(${approach * 56} ${-Math.sin(approach * Math.PI) * 23})`}
      >
        <path d="m-31 4 52-10" stroke="#72583e" strokeWidth="4" />
        <path d="m-19-4 14-15 19 4 8 9-23 5Z" fill="#437689" />
        <circle cx="14" cy="-17" r="8" fill="#457c8e" />
        <path d="m21-18 15 4-15 1Z" fill="#a97642" />
      </g>
    );
  return (
    <g>
      {[0, 1, 2].map((i) => (
        <g
          key={i}
          transform={`translate(${i * 20 + approach * 22} ${(i % 2) * 3}) scale(${i === 0 ? 1 : 0.64})`}
        >
          <path d="M-18 0q9-11 23-4l4-10 5 2-1 14Q0 13-18 0Z" fill="#dbd6b8" />
          <path d="m13-12 8 3-8 2Z" fill="#c7954a" />
        </g>
      ))}
    </g>
  );
}

export function RiverArt({
  strokes = 0,
  phase = 0,
  distance = strokes,
  side = "right",
  paired = false,
  channel = "reed",
  seed = 0,
  log = [],
  nextChannel = channel,
  onPull,
}: {
  strokes?: number;
  phase?: number;
  distance?: number;
  side?: Side;
  paired?: boolean;
  channel?: Channel;
  seed?: number;
  log?: readonly Landfall[];
  nextChannel?: Channel;
  onPull?: () => void;
}) {
  const landscape = useLandscape(480, 465);
  const id = useId(),
    start = useRef<{ id: number; y: number } | null>(null);
  const travel = distance * 106;
  const bend = Math.floor(strokes / strokesPerBend);
  const light = riverLight(strokes);
  const channelAt = (n: number) =>
    log.find((entry) => entry.bend === n)?.channel ??
    (n > bend + 1 ? nextChannel : channel);
  const landing = riverLanding(seed, channelAt(bend), bend);
  const lastChannel =
    log.find((entry) => entry.bend === bend)?.channel ?? channel;
  const approach = Math.max(
    0,
    Math.min(1, (distance - bend * strokesPerBend) / 1.5),
  );
  const bankLane =
    (lastChannel === "stone" ? 1 - approach : 0) +
    (channel === "stone" ? approach : 0);
  return (
    <svg
      className="adventure-art river-art"
      {...landscape}
      role="img"
      aria-label={`Rowboat at ${landing.name}`}
      onPointerDown={(e) => {
        if (!onPull || e.button !== 0) return;
        start.current = { id: e.pointerId, y: e.clientY };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerUp={(e) => {
        const down = start.current;
        start.current = null;
        if (
          onPull &&
          down?.id === e.pointerId &&
          e.clientY - down.y >
            Math.min(44, e.currentTarget.getBoundingClientRect().height * 0.12)
        )
          onPull();
      }}
      onPointerCancel={() => {
        start.current = null;
      }}
    >
      <defs>
        <linearGradient
          id={id + "sky"}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="0"
          x2="0"
          y2="265"
        >
          <stop stopColor={light[0]} />
          <stop offset="1" stopColor={light[1]} />
        </linearGradient>
        <linearGradient
          id={id + "water"}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="215"
          x2="25"
          y2="540"
        >
          <stop stopColor={light[4]} />
          <stop offset=".6" stopColor={light[5]} />
          <stop offset="1" stopColor={light[6]} />
        </linearGradient>
        <g id={id + "pine"}>
          <path d="M0 0v-82" stroke="#554d3f" strokeWidth="4" />
          <path
            d="m0-94-16 34h7l-16 27h9l-20 22h70l-20-22h9l-16-27h7Z"
            fill="#496b5b"
          />
        </g>
        <g id={id + "willow"}>
          <path d="M-4 0q7-26 1-49l6-3Q9-22 5 0" fill="#745e49" />
          <path
            d="M-35-23q-3-12 5-21-4-23 17-22 12-16 25-4 16-4 21 12 12 10 6 28-2-12-6-13l-2 22-8-20-4 14-9-8-13 9-5-12-10 14-3-11Z"
            fill="#789363"
          />
          <path
            d="M-24-48q12-14 19-10m7-3q13 2 18 17"
            fill="none"
            stroke="#9caf72"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </g>
        <g id={id + "rush"} stroke="#476d50" strokeWidth="2.5" fill="none">
          <path d="M0 0q-2-24-10-36 M0 0l2-43 M0 0q6-24 19-34" />
          <path d="m2-40 1-9m-14 14-2-7" stroke="#775537" strokeWidth="4" />
        </g>
      </defs>
      <rect y="-1400" width="960" height="3000" fill={`url(#${id}sky)`} />
      <TrailSky {...{ seed, distance }} />
      <Horizon
        seed={seed}
        distance={distance * 12}
        base={200}
        height={channel === "stone" ? 86 : 63}
        color={light[2]}
        crags={channel === "stone"}
      />
      <Horizon
        seed={seed + 13}
        distance={distance * 21}
        base={208}
        height={channel === "stone" ? 49 : 42}
        color={light[3]}
      />
      <rect y="216" width="960" height="1500" fill={`url(#${id}water)`} />
      <RiverBank {...{ seed, distance, channel, id }} />
      {Array.from({ length: 24 }, (_, i) => (
        <path
          key={i}
          d={`M${((((i * 137 + 1200 - travel * 0.65) % 1100) + 1100) % 1100) - 70} ${241 + ((i * 31) % 205)}q17-4 44 0`}
          fill="none"
          stroke="#c1d9c2"
          strokeWidth={(i % 3) + 1}
          opacity=".55"
        />
      ))}
      <g data-river-travel="" transform={`translate(${-travel} 0)`}>
        {[bend - 1, bend, bend + 1, bend + 2]
          .filter((n) => n >= 0)
          .map((n) => {
            const route = channelAt(n),
              place = riverLanding(seed, route, n);
            const x = 456 + n * strokesPerBend * 106;
            const approach = Math.max(
              0,
              Math.min(1, (distance - n * strokesPerBend + 1.7) / 2),
            );
            return (
              <g key={n}>
                <g transform={`translate(${x} 215)`}>
                  <RiverSighting
                    channel={route}
                    leg={place.motif}
                    approach={approach}
                  />
                </g>
                <g transform={`translate(${x + 66} 249)`}>
                  <ellipse cy="3" rx="13" ry="3" fill="#789f91" />
                  <path d="m-7 0 4-9h6l5 9Z" fill="#c48053" />
                  <path d="M0-8v-16" stroke="#755d4d" strokeWidth="2" />
                  <path
                    d="m1-24 13 3-13 6Z"
                    fill={n <= bend ? "#eeb46c" : "#ece5c2"}
                  />
                </g>
              </g>
            );
          })}
      </g>
      <g
        transform={`translate(475 ${302 + bankLane * 28 + phase * 4}) scale(${0.98 + bankLane * 0.07})`}
      >
        <g
          fill="none"
          stroke="#c3dfcf"
          strokeLinecap="round"
          opacity={0.32 + phase * 0.4}
          strokeWidth="3"
        >
          <path
            d={`M-65 42q-47 4 ${-82 - phase * 40} 0m76 8q-47 4 ${-86 - phase * 32} 0`}
          />
        </g>
        <ellipse cx="0" cy="58" rx="126" ry="10" fill="#245e64" opacity=".5" />
        <path
          d="M-132 17q84 8 247-14l-28 38q-92 41-174 2Z"
          fill="#945438"
          stroke="#674632"
          strokeWidth="3"
        />
        <path
          d="M-128 17q105-44 244-14-50 32-244 14"
          fill="#775440"
          stroke="#dbad75"
          strokeWidth="7"
        />
        <path d="M-48 10 39 3" stroke="#d2a271" strokeWidth="9" />
        <path d="m-26-28 24 1 18 37-29 3-10-23-18 8Z" fill="#3b5360" />
        <g transform={`rotate(${-9 + phase * 18} -17 -28)`}>
          <path d="m-27-70 27 2 7 46-38-2Z" fill="#dd8153" />
          <path d="m-25-65 9-3 7 38h-11Z" fill="#f3b65c" />
          <circle cx="-14" cy="-84" r="14" fill="#b97856" />
          <path d="M-30-83q-2-28 26-17l5 13-20-1-6 9Z" fill="#514237" />
        </g>
        {(paired ? [-1, 1] : [side === "left" ? -1 : 1]).map((sign) => (
          <g
            key={sign}
            transform={`translate(${sign * 13} -32) scale(${sign} 1) rotate(${-18 + phase * 45})`}
          >
            <path
              d="M-7-5 111 34"
              stroke="#dfba82"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <path
              d="m83 21 41 8q9 9-1 15l-44-16Z"
              fill="#efc17c"
              stroke="#765236"
              strokeWidth="2"
            />
            <path
              d="M-16-23q-2 17 26 19"
              fill="none"
              stroke="#b97856"
              strokeWidth="10"
              strokeLinecap="round"
            />
          </g>
        ))}
      </g>
      <NearBank {...{ seed, distance, channel, id }} />
    </svg>
  );
}
