import { useLandscape } from "./useLandscape";
import {
  useId,
  useMemo,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import {
  Vessel,
  DockedBoats,
  ferryAt,
  HarborTown,
  ChannelMarks,
  harborColors,
} from "./Harbor";
import {
  harborBerth,
  passagePosition,
  type HarborPoint,
} from "./harborPassage";
import { keeperHarborState } from "./keeperStory";

const lantern = { x: 495, y: 146 },
  bell = { x: 435, y: 229 };

function scenePoint(event: PointerEvent<SVGSVGElement>) {
  const transform = event.currentTarget.getScreenCTM();
  if (!transform) return null;
  return new DOMPoint(event.clientX, event.clientY).matrixTransform(
    transform.inverse(),
  );
}
export function LighthouseArt({
  work = 10,
  effort = 0,
  visualWork = work,
  onWork,
  home,
  fleet,
  northLight = false,
  night = false,
}: {
  work?: number;
  effort?: number;
  visualWork?: number;
  onWork?: () => void;
  home?: number;
  fleet?: number[];
  northLight?: boolean;
  night?: boolean;
}) {
  const landscape = useLandscape(570, 555);
  const id = useId(),
    { built, shipsHome, step, target, passage } = useMemo(() => {
      const harbor = keeperHarborState(work);
      if (home !== undefined) {
        const berth = harborBerth(home);
        harbor.passage = {
          ...harbor.passage,
          berth,
          route: [...harbor.passage.route.slice(0, 3), berth],
        };
      }
      return harbor;
    }, [work, home]);
  const complete = built === 12,
    progress = work % 3;
  const piers = Math.min(3, built),
    steps = Math.min(3, Math.max(0, built - 3)),
    panes = Math.min(3, Math.max(0, built - 6));
  const repairTargets = [
    { x: 425, y: 349 },
    { x: 492, y: 296 },
    { x: 494, y: 156 },
    lantern,
  ];
  const dragFinish = useRef<{
    work: number;
    kind: "boat" | "lamp";
    point: HarborPoint;
  } | null>(null);
  const landed = dragFinish.current?.work === work ? dragFinish.current : null;
  const visualHomeWork = Math.max(
    0,
    (landed?.kind === "boat" ? work : visualWork) - 12,
  );
  const stage = Math.max(0, Math.min(3, visualHomeWork - shipsHome * 3));
  const ship = passagePosition(passage.route, stage);
  const next = passage.route[step + 1];
  const buoy = step === 0 ? passage.outer : passage.inner;
  const ferry = ferryAt(stage);
  const targets = {
    boat: { x: ship.x, y: ship.y - 14 },
    buoy: { x: buoy.x, y: buoy.y - 10 },
    gate: passage.inner,
    guide: next,
    berth: passage.berth,
    reef: { x: passage.outer.x - 31, y: passage.outer.y + 4 },
    lamp: lantern,
    bell,
    ferry,
  };
  const hotspot = complete
    ? targets[target]
    : repairTargets[Math.floor(built / 3)];
  const isNight = night || passage.weather === "night";
  const colors = harborColors(
    isNight ? "night" : complete ? passage.weather : "clear",
  );
  const dragKind =
    complete &&
    (target === "guide" ? "boat" : target === "buoy" ? "lamp" : null);
  const pointer = useRef<{
    id: number;
    work: number;
    from: HarborPoint;
  } | null>(null);
  const [drag, setDrag] = useState<HarborPoint | null>(null);
  const guiding =
    drag && onWork && pointer.current?.work === work ? drag : null;
  const shownShip = guiding && dragKind === "boat" ? guiding : ship;
  const beamTarget =
    guiding && dragKind === "lamp"
      ? guiding
      : landed?.kind === "lamp"
        ? landed.point
        : shownShip;
  const beamAngle =
    (Math.atan2(beamTarget.y - lantern.y, beamTarget.x - lantern.x) * 180) /
    Math.PI;
  const endDrag = () => {
    pointer.current = null;
    setDrag(null);
  };
  const interactive = !!onWork;
  useEffect(() => {
    pointer.current = null;
    setDrag(null);
  }, [interactive, work]);
  return (
    <svg
      className={`adventure-art lighthouse-art${onWork && dragKind ? " gesture-art" : ""}`}
      onPointerDown={(e) => {
        if (!onWork || !dragKind || !e.isPrimary || e.button !== 0) return;
        const p = scenePoint(e),
          from = dragKind === "boat" ? ship : lantern;
        if (!p || Math.hypot(p.x - from.x, p.y - from.y) > 39) return;
        pointer.current = { id: e.pointerId, work, from };
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag(from);
      }}
      onPointerMove={(e) => {
        if (
          !onWork ||
          pointer.current?.id !== e.pointerId ||
          pointer.current.work !== work
        )
          return;
        const p = scenePoint(e);
        if (p && dragKind === "boat") {
          // The boat stays in the fairway even when a finger strays inland.
          const a = pointer.current.from,
            dx = next.x - a.x,
            dy = next.y - a.y;
          const f = Math.max(
            0,
            Math.min(
              1,
              ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy),
            ),
          );
          setDrag({ x: a.x + dx * f, y: a.y + dy * f });
        } else if (p) setDrag(p);
      }}
      onPointerUp={(e) => {
        if (pointer.current?.id !== e.pointerId) return;
        const p = scenePoint(e),
          same = pointer.current.work === work;
        endDrag();
        if (
          same &&
          onWork &&
          dragKind &&
          p &&
          Math.hypot(p.x - hotspot.x, p.y - hotspot.y) <= 40
        ) {
          dragFinish.current = {
            work: work + 1,
            kind: dragKind,
            point: hotspot,
          };
          onWork();
        }
      }}
      onLostPointerCapture={endDrag}
      {...landscape}
      role="img"
      aria-label={`Lighthouse with ${built} of 12 repairs and ${home ?? shipsHome} ${(home ?? shipsHome) === 1 ? "boat" : "boats"} home`}
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
          <stop stopColor={colors[0]} />
          <stop offset=".58" stopColor={colors[1]} />
          <stop offset="1" stopColor={colors[2]} />
        </linearGradient>
        <linearGradient
          id={id + "sea"}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="260"
          x2="0"
          y2="560"
        >
          <stop stopColor={colors[3]} />
          <stop offset="1" stopColor={colors[4]} />
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
        {complete && passage.weather === "fog" && (
          <linearGradient id={id + "mist"} x2="0" y2="1">
            <stop stopColor="#edf1e6" stopOpacity=".15" />
            <stop offset=".48" stopColor="#edf1e6" stopOpacity=".88" />
            <stop offset="1" stopColor="#edf1e6" stopOpacity="0" />
          </linearGradient>
        )}
      </defs>
      <rect y="-1400" width="960" height="3000" fill={`url(#${id}sky)`} />
      {complete && isNight && (
        <g fill="#f7ddb5">
          {Array.from({ length: 20 }, (_, i) => (
            <circle
              key={i}
              cx={(i * 113 + 59) % 960}
              cy={17 + ((i * 29) % 89)}
              r={i % 3 === 0 ? 1.8 : 1.1}
            />
          ))}
        </g>
      )}
      <circle
        cx={complete ? 635 + ((shipsHome * 73) % 200) : 784}
        cy={complete ? 67 + ((shipsHome * 17) % 45) : 93}
        r={isNight ? 19 : 27}
        fill="#ffdfb1"
      />
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
          d={`M${((i * 113 + (complete ? visualHomeWork * 5 : 0)) % 1000) - 26} ${270 + ((i * 29) % 178)}q19-4 49 0`}
          fill="none"
          stroke="#d4ded6"
          opacity=".44"
          strokeWidth={(i % 3) + 1}
        />
      ))}
      {complete && passage.weather === "fog" && (
        <g fill="#eff0df" opacity={0.78 - stage * 0.2} pointerEvents="none">
          <path
            d="M520 278q50-25 124-14 63-27 129-9 94-18 197-3v50H520Z"
            fill={`url(#${id}mist)`}
            transform={`translate(${stage * 37} 0)`}
          />
          {[0, 1, 2].map((i) => (
            <path
              key={i}
              transform={`translate(${353 + i * 196 + stage * (i - 1) * 25} ${256 + (i % 2) * 12})`}
              d="M-103 0q15-7 37-7 14-16 41-10 17-18 46-6 24-3 37 10 21 0 49 13Z"
            />
          ))}
        </g>
      )}
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
          d="M495 146 935 109 939 179Z"
          fill={`url(#${id}beam)`}
          opacity={
            complete
              ? passage.weather === "night"
                ? 0.98
                : 0.65
              : 0.22 + 0.12 * progress
          }
          transform={`rotate(${complete ? beamAngle : effort * 3} 495 146)`}
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
      {complete && (
        <g aria-hidden="true" strokeLinejoin="round">
          <path
            d="m451 334 11-2 32 51-12 4Z"
            fill="#b79b79"
            stroke="#846d58"
            strokeWidth="2"
          />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <path
              key={i}
              d={`m${455 + i * 5} ${339 + i * 8} 9-2`}
              stroke="#947e66"
              strokeWidth="2"
            />
          ))}
          <path
            d="m402 393 139-16 6 7-142 17Z"
            fill="#c6a782"
            stroke="#806b54"
            strokeWidth="2"
          />
          {[0, 1, 2, 3].map((i) => (
            <g
              key={i}
              transform={`translate(${411 + i * 41} ${393 - i * 4.7})`}
            >
              <path d="M0 5v7M0-6v7" stroke="#7b6753" strokeWidth="4" />
              <circle cy="-6" r="2.5" fill="#eed3a7" />
            </g>
          ))}
        </g>
      )}
      <HarborTown home={home ?? shipsHome} />
      {northLight && (
        <g transform="translate(826 236)" aria-hidden="true">
          <path d="m0 0-85 75 115-50Z" fill="#ffe6a0" opacity=".23" />
          <path
            d="M-10 23-7-9H7l6 32Z"
            fill="#c9c7ac"
            stroke="#718077"
            strokeWidth="1.5"
          />
          <path
            d="M-7-9v-14H7v14Z"
            fill="#ffdfa2"
            stroke="#7e8064"
            strokeWidth="2"
          />
          <path d="m-10-24 10-9 10 9Z" fill="#9a7560" />
        </g>
      )}
      <path d="M420 256v-39h28" fill="none" stroke="#6c5945" strokeWidth="5" />
      <path d="M426 237q4-30 16-17l5 18Z" fill="#c49c55" />
      {complete && (
        <>
          <path
            d={
              `M${passage.route[0].x} ${passage.route[0].y} ` +
              passage.route
                .slice(1)
                .map((p) => `L${p.x} ${p.y}`)
                .join(" ")
            }
            fill="none"
            stroke="#fff0bf"
            opacity=".66"
            strokeWidth="2.2"
            strokeDasharray="3 8"
            strokeLinecap="round"
          />
          <ChannelMarks passage={passage} progress={stage} />
          <DockedBoats
            home={home ?? shipsHome}
            visualHomeWork={visualHomeWork}
            fleet={fleet}
          />
          {target === "guide" && (
            <g transform={`translate(${next.x} ${next.y})`}>
              <ellipse
                rx="22"
                ry="6"
                fill="none"
                stroke="#fbe0a1"
                strokeWidth="2"
              />
              <path d="M0 1v-25" stroke="#796650" strokeWidth="2" />
              <path d="m1-25 15 4-15 6Z" fill="#f2c66d" />
            </g>
          )}
        </>
      )}
      <g
        data-keeper-vessel=""
        transform={`translate(${complete ? shownShip.x : 757} ${complete ? shownShip.y : 296 + effort * 2}) scale(${complete ? 0.76 : 0.85})`}
      >
        <path
          d="M-42 18q28 5 65 0m-43 5q18 2 38-1"
          fill="none"
          stroke="#cfdfd3"
          strokeWidth="2"
        />
        <Vessel color={passage.color} rig={passage.rig} />
      </g>
      <path
        d="M235 106q11-7 19 2 12-9 24-5m311-19q8-5 14 1 9-7 17-4"
        fill="none"
        stroke="#55636d"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <g
        transform={`translate(${hotspot.x} ${hotspot.y})`}
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
