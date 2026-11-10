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

export function RiverArt({
  strokes = 0,
  phase = 0,
  side = "right",
  paired = false,
  channel = "reed",
  onPull,
}: {
  strokes?: number;
  phase?: number;
  side?: Side;
  paired?: boolean;
  channel?: Channel;
  onPull?: () => void;
}) {
  const id = useId(),
    start = useRef<{ id: number; y: number } | null>(null);
  const stone = channel === "stone";
  const travel = (strokes + phase) * 18;
  const bankX = -(travel % 960);
  return (
    <svg
      className="adventure-art river-art"
      viewBox="0 0 960 460"
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
        <linearGradient id={id + "sky"} x2="0" y2="1">
          <stop stopColor="#edc89a" />
          <stop offset="1" stopColor="#fff0c7" />
        </linearGradient>
        <linearGradient id={id + "water"} x2="0.2" y2="1">
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
      <rect width="960" height="460" fill={`url(#${id}sky)`} />
      <circle cx="706" cy="88" r="42" fill="#fff1bb" />
      <path
        d="m0 169 109-57 88 35 134-76 114 84 140-72 89 47 101-66 185 101v65H0Z"
        fill="#acb2a1"
      />
      <path
        d="m0 181 121-45 132 47 176-71 125 61 130-53 150 47 126-38v90H0Z"
        fill="#869e8e"
      />
      <rect y="216" width="960" height="244" fill={`url(#${id}water)`} />
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
      <g transform={`translate(${120 - (travel % 140) * 0.3} 252)`}>
        <path d="m-48 3 32-9 42 4 16 8Z" fill="#7f8972" />
        <Heron />
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
