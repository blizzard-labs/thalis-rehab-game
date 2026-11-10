import { useLandscape } from "./useLandscape";
import { useId, useRef } from "react";
import type { Side } from "../practice/session";

export type Channel = "reed" | "stone";
const landings = {
  reed: ["Willow Reach", "Heron Marsh", "Reedwater Mill", "Kingfisher Bend"],
  stone: ["Slate Narrows", "The Old Bridge", "Copper Cliffs", "Pebble Cove"],
};
export function landingName(channel: Channel, strokes: number) {
  return landings[channel][Math.floor(strokes / 4) % 4];
}

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

function RiverSighting({ channel, leg }: { channel: Channel; leg: number }) {
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
        <g>
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
  if (leg === 1) return <Heron />;
  if (leg === 2)
    return (
      <g stroke="#77573d" strokeWidth="4" fill="none">
        <circle r="22" />
        {[0, 45, 90, 135].map((a) => (
          <path key={a} d="M-20 0h40" transform={`rotate(${a})`} />
        ))}
      </g>
    );
  if (leg === 3)
    return (
      <g>
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
          transform={`translate(${i * 20} ${(i % 2) * 3}) scale(${i === 0 ? 1 : 0.64})`}
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
  onPull,
}: {
  strokes?: number;
  phase?: number;
  distance?: number;
  side?: Side;
  paired?: boolean;
  channel?: Channel;
  onPull?: () => void;
}) {
  const landscape = useLandscape(480, 465);
  const id = useId(),
    start = useRef<{ id: number; y: number } | null>(null);
  const stone = channel === "stone";
  const travel = distance * 38;
  const bankX = -(travel % 960);
  return (
    <svg
      className="adventure-art river-art"
      {...landscape}
      role="img"
      aria-label={`Rowboat at ${landingName(channel, strokes)}`}
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
          <stop stopColor="#edc89a" />
          <stop offset="1" stopColor="#fff0c7" />
        </linearGradient>
        <linearGradient
          id={id + "water"}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="215"
          x2="25"
          y2="540"
        >
          <stop stopColor="#8cbaa7" />
          <stop offset=".6" stopColor="#408a89" />
          <stop offset="1" stopColor="#27666e" />
        </linearGradient>
        <g id={id + "pine"}>
          <path d="M0 0v-82" stroke="#554d3f" strokeWidth="4" />
          <path
            d="m0-94-16 34h7l-16 27h9l-20 22h70l-20-22h9l-16-27h7Z"
            fill="#496b5b"
          />
        </g>
        <g id={id + "rush"} stroke="#476d50" strokeWidth="2.5" fill="none">
          <path d="M0 0q-2-24-10-36 M0 0l2-43 M0 0q6-24 19-34" />
          <path d="m2-40 1-9m-14 14-2-7" stroke="#775537" strokeWidth="4" />
        </g>
        <g id={id + "bank"}>
          <path
            d="M0 202q120-39 241-14t220 6q180-50 310-11t189 19v33H0Z"
            fill={stone ? "#918073" : "#779171"}
          />
          {[15, 58, 92, 276, 312, 698, 741, 778, 914].map((x, i) => (
            <use
              key={x}
              href={"#" + id + "pine"}
              transform={`translate(${x} ${204 + (i % 3) * 5}) scale(${0.45 + (i % 4) * 0.18})`}
            />
          ))}
          {stone ? (
            <g transform="translate(365 128)">
              <path
                d="M0 90V26l147-17v80h-30V67c0-39-49-39-49 0v22H39V62q-9-21-18 0v28Z"
                fill="#816d58"
              />
              <path d="m-5 27 158-18v8L-5 35Z" fill="#c7a787" />
            </g>
          ) : (
            <g transform="translate(427 160)">
              <path d="m-31 38 3-42 60-2 3 46" fill="#b38257" />
              <path d="m-39 0 37-29L39-1Z" fill="#715440" />
              <circle
                cx="29"
                cy="37"
                r="19"
                fill="none"
                stroke="#654d39"
                strokeWidth="5"
              />
              {[0, 45, 90, 135].map((a) => (
                <path
                  key={a}
                  d="M10 37h38"
                  transform={`rotate(${a} 29 37)`}
                  stroke="#654d39"
                  strokeWidth="2"
                />
              ))}
            </g>
          )}
          <path
            d="M0 217q177-22 324-2t354-5q160-7 282 7v10H0Z"
            fill="#435f50"
          />
        </g>
      </defs>
      <rect y="-1400" width="960" height="3000" fill={`url(#${id}sky)`} />
      <circle cx="706" cy="88" r="42" fill="#fff1bb" />
      <path
        d="m0 169 109-57 88 35 134-76 114 84 140-72 89 47 101-66 185 101v65H0Z"
        fill="#acb2a1"
      />
      <path
        d="m0 181 121-45 132 47 176-71 125 61 130-53 150 47 126-38v90H0Z"
        fill="#869e8e"
      />
      <rect y="216" width="960" height="1500" fill={`url(#${id}water)`} />
      <g transform={`translate(${bankX} 0)`}>
        <use href={"#" + id + "bank"} />
        <use x="960" href={"#" + id + "bank"} />
      </g>
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
      <g transform={`translate(${650 - (distance % 4) * 65} 234)`}>
        <RiverSighting channel={channel} leg={Math.floor(strokes / 4) % 4} />
      </g>
      <g transform={`translate(475 ${307 + phase * 4})`}>
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
      {[18, 42, 70, 881, 903, 944].map((x, i) => (
        <use
          key={x}
          href={"#" + id + "rush"}
          transform={`translate(${x} ${452 - (i % 2) * 9}) scale(${1 + (i % 3) * 0.3})`}
        />
      ))}
    </svg>
  );
}
