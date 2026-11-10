import { useLandscape } from "./useLandscape";
import { useId } from "react";
import { keeperStory } from "./keeperStory";

function Cutter({
  color = "#b55d47",
  rig = 0,
}: {
  color?: string;
  rig?: number;
}) {
  return (
    <g>
      <path
        d="M-42 1q38 8 87-4L30 15H-26Z"
        fill={color}
        stroke="#434e51"
        strokeWidth="2"
      />
      <path d="M4 1v-64" stroke="#715741" strokeWidth="3" />
      <path d={rig % 2 ? "M0-60-27-5H0Z" : "M0-55-32-8 0-4Z"} fill="#f4e7bd" />
      <path d="M8-52 33-8 8-6Z" fill="#c9ccc0" />
      <path d="M5-63 22-61 5-55Z" fill={color} />
    </g>
  );
}
export function LighthouseArt({
  work = 10,
  effort = 0,
  onWork,
}: {
  work?: number;
  effort?: number;
  onWork?: () => void;
}) {
  const landscape = useLandscape(570, 555);
  const id = useId(),
    { built, shipsHome, step } = keeperStory(work);
  const complete = built === 12,
    progress = work % 3;
  const piers = Math.min(3, built),
    steps = Math.min(3, Math.max(0, built - 3)),
    panes = Math.min(3, Math.max(0, built - 6));
  const hotspot =
    built < 3
      ? [425, 349]
      : built < 6
        ? [492, 296]
        : built < 9
          ? [494, 156]
          : built < 12
            ? [492, 145]
            : step === 0
              ? [718, 274]
              : step === 1
                ? [500, 149]
                : [434, 231];
  return (
    <svg
      className="adventure-art lighthouse-art"
      {...landscape}
      role="img"
      aria-label={`Lighthouse with ${built} of 12 repairs and ${shipsHome} ${shipsHome === 1 ? "boat" : "boats"} home`}
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
          <stop stopColor="#586a83" />
          <stop offset=".58" stopColor="#c29a8f" />
          <stop offset="1" stopColor="#f3cb9b" />
        </linearGradient>
        <linearGradient
          id={id + "sea"}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="260"
          x2="0"
          y2="560"
        >
          <stop stopColor="#96acb2" />
          <stop offset="1" stopColor="#405e71" />
        </linearGradient>
        <linearGradient id={id + "tower"}>
          <stop stopColor="#b7b4a2" />
          <stop offset=".44" stopColor="#faf0d5" />
          <stop offset="1" stopColor="#d4ceb8" />
        </linearGradient>
        <linearGradient id={id + "beam"}>
          <stop stopColor="#fff2ae" stopOpacity=".8" />
          <stop offset="1" stopColor="#ffe7a4" stopOpacity=".03" />
        </linearGradient>
      </defs>
      <rect y="-1400" width="960" height="3000" fill={`url(#${id}sky)`} />
      <circle cx="784" cy="93" r="27" fill="#ffdfb1" />
      <path
        d="M69 85q49-21 95-5m-63 10q56-11 94-2M656 51q40-12 81 0"
        fill="none"
        stroke="#e1c3b2"
        strokeWidth="5"
        opacity=".65"
        strokeLinecap="round"
      />
      <path
        d="M0 250 68 231 115 238 183 214 209 224 251 220 302 246 358 251 400 267H0Zm573 19 130-39 57 7 76-18 124 21v36H573Z"
        fill="#7f8b91"
      />
      <rect y="261" width="960" height="1500" fill={`url(#${id}sea)`} />
      {Array.from({ length: 33 }, (_, i) => (
        <path
          key={i}
          d={`M${((i * 113) % 970) - 16} ${270 + ((i * 29) % 178)}q19-4 49 0`}
          fill="none"
          stroke="#d4ded6"
          opacity=".44"
          strokeWidth={(i % 3) + 1}
        />
      ))}
      <path
        d="m0 357 121-20 91 5 72-42 107 12 64-22 72-13 42 21 74 21 29 26-102 19-74-5-92 30-161 10-91-13-152 48Z"
        fill="#788269"
      />
      <path
        d="m0 380 148-29 104 18 112-30 103-12 87-20 31 13 21 32-74 23-32-9-81 31-154 18-93-8L0 442Z"
        fill="#57616a"
      />
      <path
        d="m5 416 145-45 88 14m139-29 54-14m68-3 34-12"
        stroke="#91918a"
        strokeWidth="4"
        fill="none"
      />
      <g transform="translate(332 289)">
        <path d="M-49 13v-47h83v47Z" fill="#dac7a5" />
        <path d="m-59-31 44-32 61 31Z" fill="#875a51" />
        <path d="M0 11v-29h17v29" fill="#58716e" />
        <rect
          x="-36"
          y="-21"
          width="15"
          height="13"
          fill={complete ? "#ffdb85" : "#819494"}
        />
      </g>
      <path
        d="m453 299 17-126h46l22 126q-40 16-85 0"
        fill={`url(#${id}tower)`}
        stroke="#747474"
        strokeWidth="2"
      />
      <path d="m465 208 55-13 3 23-61 15Z" fill="#b05f4c" />
      <path d="m458 260 69-17 4 25-76 19Z" fill="#b05f4c" />
      <path d="M477 301v-22q0-20 20-17 12 0 12 16v24" fill="#596263" />
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          d={`M${474 - i * 3} ${301 + i * 5}h${36 + i * 6}l2 5h-${40 + i * 6}Z`}
          fill={i < steps ? "#d4c3a2" : "#747775"}
        />
      ))}
      <path d="M457 173h74v7h-74Z" fill="#505657" />
      <path
        d="M458 171v-15m11 15v-15m51 15v-15m10 15v-15m-74 1h76"
        fill="none"
        stroke="#505657"
        strokeWidth="2"
      />
      <path
        d="M471 163v-32h44v32Z"
        fill="#4c5b61"
        stroke="#444e51"
        strokeWidth="3"
      />
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={474 + i * 13}
          y="133"
          width="10"
          height="26"
          fill={i < panes ? (complete ? "#ffe898" : "#dbae74") : "#74848b"}
        />
      ))}
      <path
        d="m463 130 31-21 30 21Z"
        fill="#914d42"
        stroke="#594a46"
        strokeWidth="2"
      />
      <path d="M494 110V97" stroke="#4d5052" strokeWidth="3" />
      {built >= 9 && (
        <path
          d="M495 146 919 106 944 206Z"
          fill={`url(#${id}beam)`}
          opacity={complete ? 0.78 : 0.22 + 0.12 * progress}
          transform={`rotate(${(complete ? step - 1 : 0) * 7 + effort * 3} 495 146)`}
        />
      )}
      <path
        d="M372 343 468 328m-84 14v31m37-38v33m36-38v27"
        fill="none"
        stroke="#725d49"
        strokeWidth="7"
      />
      {Array.from({ length: piers * 3 }, (_, i) => (
        <path
          key={i}
          d={`m${373 + i * 11} ${342 - i * 1.55} 10-2 6 8-11 2Z`}
          fill="#c29d72"
          stroke="#896d51"
        />
      ))}
      <path d="M420 256v-39h28" fill="none" stroke="#6c5945" strokeWidth="5" />
      <path d="M426 237q4-30 16-17l5 18Z" fill="#c49c55" />
      <g
        transform={`translate(${complete ? 718 - step * 15 : 757} ${296 + effort * 2}) scale(.85)`}
      >
        <Cutter rig={shipsHome} />
      </g>
      {Array.from({ length: Math.min(shipsHome, 7) }, (_, i) => (
        <g
          key={i}
          transform={`translate(${90 + i * 42} ${345 - (i % 2) * 12}) scale(.42)`}
        >
          <Cutter rig={i} color={i % 2 ? "#576e83" : "#b26b50"} />
        </g>
      ))}
      <path
        d="M235 106q11-7 19 2 12-9 24-5m311-19q8-5 14 1 9-7 17-4"
        fill="none"
        stroke="#55636d"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <g
        transform={`translate(${hotspot.join(" ")})`}
        data-testid="keeper-task"
        onClick={onWork}
        style={{ cursor: onWork ? "pointer" : undefined }}
      >
        <circle
          r="31"
          fill="#fff6d8"
          fillOpacity=".18"
          stroke="#fff4c9"
          strokeWidth="3"
          strokeDasharray="5 5"
        />
        {effort > 0 && (
          <circle
            r="31"
            fill="none"
            stroke="#ffd87a"
            strokeWidth="5"
            pathLength="1"
            strokeDasharray={`${effort} 1`}
          />
        )}
        <circle r="34" fill="transparent" />
      </g>
    </svg>
  );
}
