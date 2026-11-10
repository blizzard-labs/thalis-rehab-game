import { useId, useState } from "react";
import { armAt, shoulder, type Point } from "../reach/starGeometry";
import type { CameraAim } from "../practice/StarPlay";
import type { Side } from "../practice/session";

const harvest = ["apple", "pear", "plum"] as const;
export const fruitName = (n: number) => harvest[n % harvest.length];
export function orchardGoal(n: number, side: Side): Point {
  // Every fruit is inside the reach of the same two-bone rig as Star Catcher.
  const spots = [
    [130, -125],
    [-90, -155],
    [170, 45],
    [44, -195],
    [-137, -45],
    [135, -65],
  ];
  const [x, y] = spots[n % spots.length];
  return { x: shoulder.x + (side === "left" ? -1 : 1) * x, y: shoulder.y + y };
}
function Fruit({ kind }: { kind: ReturnType<typeof fruitName> }) {
  const pear = kind === "pear",
    plum = kind === "plum";
  return (
    <g strokeLinejoin="round">
      <path d="M0-15q0-12 6-18" stroke="#594c34" fill="none" strokeWidth="3" />
      <path d="M2-21q-17 0-19-12 15-2 19 12" fill="#56714a" />
      <path
        d={
          pear
            ? "M-3-20c-8 2-6 14-15 23-11 17 0 28 14 28s27-10 19-25C7-7 9-22-3-20Z"
            : plum
              ? "M-2-16c-21-5-26 17-18 31 10 20 26 14 34 0 12-18 5-33-16-31Z"
              : "M0-12c-17-13-30 0-23 21 6 19 14 25 23 20 13 7 23-10 26-24 4-16-12-28-26-17Z"
        }
        fill={pear ? "#dcad44" : plum ? "#77527d" : "#c85a48"}
        stroke={pear ? "#967139" : plum ? "#52395b" : "#943f36"}
        strokeWidth="2"
      />
      <path
        d="M-12-2q-5 5-3 12"
        fill="none"
        stroke="#fff1c9"
        strokeWidth="3"
        strokeLinecap="round"
        opacity=".75"
      />
    </g>
  );
}
export function OrchardArt({
  count = 0,
  held = false,
  side = "right",
  aim,
  effort = 0,
  hold = 0,
  onPick,
  onDeposit,
}: {
  count?: number;
  held?: boolean;
  side?: Side;
  aim?: CameraAim | null;
  effort?: number;
  hold?: number;
  onPick?: () => void;
  onDeposit?: () => void;
}) {
  const id = useId(),
    [hand, setHand] = useState<Point | null>(null);
  const goal = aim?.goal ?? orchardGoal(count, side);
  const target = aim
    ? (aim.wrist ?? shoulder)
    : (onPick || onDeposit) && hand
      ? hand
      : {
          x: shoulder.x + (goal.x - shoulder.x) * (held && onDeposit ? 1 : effort),
          y: shoulder.y + (goal.y - shoulder.y) * (held && onDeposit ? 1 : effort),
        };
  const { wrist, elbow } = armAt(target, side);
  const screen = (p: Point) => ({
    x: 480 + (p.x - shoulder.x) * 0.85,
    y: 257 + (p.y - shoulder.y) * 0.75,
  });
  const goalAt = screen(goal),
    tip = screen(wrist),
    bend = screen(elbow);
  const kind = fruitName(count);
  return (
    <svg
      className="adventure-art orchard-art"
      viewBox="0 0 960 460"
      role="img"
      aria-label={`Orchard with ${count} fruit gathered`}
      onPointerMove={(e) => {
        if (!onPick && !onDeposit) return;
        const matrix = e.currentTarget.getScreenCTM();
        if (!matrix) return;
        const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
          matrix.inverse(),
        );
        setHand({
          x: shoulder.x + (p.x - 480) / 0.85,
          y: shoulder.y + (p.y - 257) / 0.75,
        });
      }}
      onPointerLeave={() => setHand(null)}
    >
      <defs>
        <linearGradient id={id + "sky"} x2="0" y2="1">
          <stop stopColor="#c4d8c4" />
          <stop offset="1" stopColor="#fff1cc" />
        </linearGradient>
        <linearGradient id={id + "grass"} x2="0" y2="1">
          <stop stopColor="#b6bd76" />
          <stop offset="1" stopColor="#738453" />
        </linearGradient>
        <g id={id + "tree"}>
          <path d="m-5 0 2-69h8l2 69Z" fill="#806c4b" />
          <path
            d="M-41-56q-23-15-5-35-2-19 23-26 16-23 35-9 26-10 38 15 24 18 9 46-8 16-32 14-22 16-42-1Z"
            fill="#7d986b"
          />
          <path
            d="M-42-69q10 13 23 8 17 9 32 0 22 3 44-12-6 25-31 24-23 14-43 0-21 4-25-20Z"
            fill="#69885e"
          />
        </g>
        <g id={id + "leaf"}>
          <path d="M0 0Q5-16 29-15Q25-1 0 0" fill="#628354" />
          <path d="m1-1 24-11" stroke="#83915c" fill="none" />
        </g>
      </defs>
      <rect width="960" height="460" fill={`url(#${id}sky)`} />
      <circle cx="710" cy="85" r="43" fill="#fff1c5" />
      <path
        d="M0 263Q130 135 265 209T534 197q204-112 426 35v100H0Z"
        fill="#a1b69a"
      />
      <path
        d="M0 264q188-69 372 0t330-19q125-43 258 9v206H0Z"
        fill={`url(#${id}grass)`}
      />
      {[32, 104, 195, 290, 690, 764, 842, 934].map((x, i) => (
        <use
          key={x}
          href={"#" + id + "tree"}
          transform={`translate(${x} ${282 + (i % 3) * 17}) scale(${0.39 + (i % 3) * 0.13})`}
        />
      ))}
      <path d="M330 460q173-101 353-157-116 66-198 157" fill="#cfb587" />
      <path
        d="M83 406Q128 300 107 163L78 66l21-11 43 83q63-48 123-59l6 12q-80 31-106 80 25 95-29 239Z"
        fill="#876249"
      />
      <path
        d="M118 385q29-123 12-206m1 17q-16-64-30-91"
        fill="none"
        stroke="#a17e57"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M960 21q-148 36-234 82-47 23-107 14l-2-8q77 4 113-31 99-65 230-98Z"
        fill="#73533e"
      />
      <path
        d="M0 0h367q-16 27-42 28-4 34-45 36-24 36-77 26-10 35-65 26-39 23-74-2-39 11-64-16Z"
        fill="#577950"
      />
      <path
        d="M960 0H651q13 37 54 36 24 28 62 16 28 25 60 8 38 19 68 0 42 17 65-7Z"
        fill="#55794d"
      />
      {[28, 87, 139, 195, 244, 271, 735, 790, 837, 902].map((x, i) => (
        <use
          key={x}
          href={"#" + id + "leaf"}
          transform={`translate(${x} ${23 + ((i * 17) % 45)}) rotate(${i % 2 ? 25 : -18})`}
        />
      ))}
      {[0, 1, 2, 3].map((n) => (
        <g
          key={n}
          transform={`translate(${[63, 205, 820, 905][n]} ${[110, 88, 71, 63][n]}) scale(.45)`}
          opacity=".85"
        >
          <Fruit kind={fruitName(count + n + 1)} />
        </g>
      ))}
      <path
        d={`M${goalAt.x < 480 ? 165 : 755} ${goalAt.x < 480 ? 159 : 81}Q${goalAt.x} ${goalAt.y - 78} ${goalAt.x} ${goalAt.y - 19}`}
        fill="none"
        stroke="#83684b"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <use
        href={"#" + id + "leaf"}
        transform={`translate(${goalAt.x} ${goalAt.y - 31})`}
      />
      <path
        d={`M480 257 L${bend.x} ${bend.y} L${tip.x} ${tip.y}`}
        fill="none"
        stroke="#bd825e"
        strokeWidth="16"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d={`M480 257L${480 + (bend.x - 480) * 0.62} ${257 + (bend.y - 257) * 0.62}`}
        stroke="#5c7681"
        strokeWidth="23"
        strokeLinecap="round"
      />
      <ellipse cx={tip.x} cy={tip.y} rx="11" ry="9" fill="#cf9874" />
      {!held && (
        <g
          data-testid="ripe-fruit"
          transform={`translate(${goalAt.x} ${goalAt.y})`}
          onClick={onPick}
          style={{ cursor: onPick ? "pointer" : undefined }}
        >
          <circle
            r="36"
            fill="#fff4cc"
            fillOpacity=".35"
            stroke="#fff3c6"
            strokeWidth="3"
            strokeDasharray="5 5"
          />
          <Fruit kind={kind} />
          {hold > 0 && (
            <circle
              r="37"
              fill="none"
              stroke="#6a4932"
              strokeWidth="4"
              pathLength="1"
              strokeDasharray={`${hold} 1`}
            />
          )}
        </g>
      )}
      <g
        pointerEvents={held ? "auto" : "none"}
        data-testid="fruit-basket"
        transform="translate(480 275)"
        onClick={held ? onDeposit : undefined}
        style={{ cursor: held && onDeposit ? "pointer" : undefined }}
      >
        {held && (
          <ellipse
            rx="47"
            ry="38"
            fill="#fff4cc"
            fillOpacity=".5"
            stroke="#fff3ba"
            strokeWidth="3"
            strokeDasharray="5 4"
          />
        )}
        <path
          d="M-31-4q0-52 31-52t31 52"
          fill="none"
          stroke="#785638"
          strokeWidth="5"
        />
        {Array.from({ length: Math.min(count, 6) }, (_, i) => (
          <g
            key={i}
            transform={`translate(${-24 + (i % 3) * 21} ${-4 - Math.floor(i / 3) * 11}) scale(.34)`}
          >
            <Fruit kind={fruitName(Math.max(0, count - 6) + i)} />
          </g>
        ))}
        <path
          d="m-41-5 10 34h61l12-34Z"
          fill="#b78a56"
          stroke="#76573c"
          strokeWidth="3"
        />
        <path
          d="m-33 4 67 0m-63 8h59m-56 9h50m-43-25 5 30m13-29v30m18-31-5 30"
          fill="none"
          stroke="#88623f"
          strokeWidth="2"
        />
        <rect x="-48" y="-39" width="96" height="75" fill="transparent" />
      </g>
      {held && (
        <g
          pointerEvents="none"
          transform={`translate(${tip.x} ${tip.y - 5}) scale(.8)`}
        >
          <Fruit kind={kind} />
        </g>
      )}
      {Array.from({ length: Math.min(5, Math.floor(count / 6)) }, (_, i) => (
        <g key={i} transform={`translate(${48 + i * 47} 382)`}>
          <path d="m0 0 40-4v25l-40 4Z" fill="#be9464" stroke="#796243" />
          <path d="m3 9 35-3" stroke="#805f43" strokeWidth="2" />
        </g>
      ))}
    </svg>
  );
}
