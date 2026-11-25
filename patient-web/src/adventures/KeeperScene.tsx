import { useId } from "react";
import { useLandscape } from "./useLandscape";
import { KeeperFigure } from "./KeeperCharacter";
import { KeeperObject } from "./KeeperProps";
import { LighthouseArt } from "./Lighthouse";
import type { KeeperStory, KeeperScene, KeeperProp } from "./keeperStory";

export const keeperPlaces: Record<KeeperScene, string> = {
  landing: "The old landing",
  cottage: "The keeper’s cottage",
  workshop: "Nell’s workshop",
  lantern: "The lantern room",
  north: "North Point",
  harbor: "Greyhaven harbor",
};

function objectPosition(scene: KeeperScene, prop: KeeperProp) {
  if (scene === "landing")
    return prop === "rope"
      ? { x: 686, y: 379 }
      : prop === "plank"
        ? { x: 460, y: 385 }
        : { x: 564, y: 335 };
  if (scene === "cottage")
    return prop === "radio" ? { x: 735, y: 293 } : { x: 571, y: 298 };
  if (scene === "workshop")
    return prop === "shutter"
      ? { x: 664, y: 174 }
      : prop === "oil"
        ? { x: 700, y: 295 }
        : { x: 540, y: 293 };
  if (scene === "lantern")
    return prop === "shutter"
      ? { x: 715, y: 207 }
      : prop === "oil"
        ? { x: 684, y: 344 }
        : prop === "glass"
          ? { x: 715, y: 207 }
          : prop === "handle"
            ? { x: 490, y: 352 }
            : { x: 540, y: 218 };
  return prop === "flag"
    ? { x: 654, y: 230 }
    : prop === "bolt"
      ? { x: 594, y: 255 }
      : { x: 543, y: 215 };
}

function Seabirds() {
  return (
    <path
      d="M164 72q9-8 18 0 8-9 18-2m502 33q9-8 18 0 8-9 18-2"
      fill="none"
      stroke="#536c76"
      strokeWidth="3"
      strokeLinecap="round"
      opacity=".75"
    />
  );
}
function Sea({
  storm = false,
  night = false,
}: {
  storm?: boolean;
  night?: boolean;
}) {
  return (
    <>
      <path
        d="M0 226 111 208 187 219 272 191 358 214 465 203 578 226 717 202 814 217 960 195v72H0Z"
        fill={night ? "#4c6273" : "#8b9a92"}
      />
      <rect
        x="-100"
        y="240"
        width="1160"
        height="1400"
        fill={storm ? "#516c7c" : night ? "#50687e" : "#8fbbb6"}
      />
      {Array.from({ length: 22 }, (_, i) => (
        <path
          key={i}
          d={`M${((i * 173) % 1000) - 50} ${257 + ((i * 31) % 191)}q20-${storm ? 8 : 3} 57 0`}
          fill="none"
          stroke={night ? "#a7b3ba" : "#d2dfce"}
          strokeWidth={(i % 3) + 1}
          opacity=".45"
        />
      ))}
    </>
  );
}

function Landing({ progress }: { progress: number }) {
  return (
    <>
      <Sea />
      <Seabirds />
      <path
        d="M0 318 113 282 265 296 393 255 556 279 727 265 835 302 960 319 800 345 700 355 593 340 460 360 360 386 240 375 0 430Z"
        fill="#9aa17b"
      />
      <path
        d="M0 374 170 340 321 354 435 331 560 329 727 320 831 340 722 360 601 350 458 378 352 399 216 397 0 445Z"
        fill="#7c876c"
      />
      <path d="m360 320 205-62 62 11-168 63 37 57-55 13Z" fill="#c2b393" />
      <g transform="translate(640 53)">
        <path
          d="M-49 253-28 63h63l28 190Z"
          fill="#e6d8b7"
          stroke="#7b7a70"
          strokeWidth="2"
        />
        <path
          d="m-37 136 81-18 6 33-91 21Zm-11 83 103-24 6 33-113 26Z"
          fill="#b4735e"
        />
        <path
          d="M-36 63V22h79v41Z"
          fill={progress >= 12 ? "#e4ca85" : "#79969a"}
          stroke="#5f6b6b"
          strokeWidth="5"
        />
        <path d="m-45 20 50-27 46 27Z" fill="#946154" />
        <path
          d="M-34 71h81m-77-44v33m26-33v33m27-33v33"
          stroke="#586668"
          strokeWidth="3"
        />
        <path d="M-8 252v-42q0-23 22-23t23 23v42" fill="#587172" />
      </g>
      <g transform="translate(379 284)">
        <path d="M-78 0v-77h133V0Z" fill="#d8c4a2" />
        <path d="m-92-73 68-47 95 47Z" fill="#91695b" />
        <path d="M-7 0v-49h28V0" fill="#658484" />
        <path
          d="M-57-53h29v25h-29Z"
          fill="#e8d7a4"
          stroke="#806f57"
          strokeWidth="3"
        />
      </g>
      <path
        d="m358 367 386-35 90 87-431 51Z"
        fill="#a88b65"
        stroke="#7b6c52"
        strokeWidth="3"
      />
      {Array.from({ length: 10 }, (_, i) => (
        <path
          key={i}
          d={`m${369 + i * 38} ${369 - i * 3.6} 50 76`}
          stroke="#7e6e54"
          strokeWidth="2"
        />
      ))}
      <path
        d="M414 440v43m302-85v60m-23-113v49"
        stroke="#6c6251"
        strokeWidth="12"
      />
      <path
        d="m524 333 72-6v35l-72 6Z"
        fill="#bb976d"
        stroke="#826c50"
        strokeWidth="2"
      />
      <path d="m532 336 55 20m-55 5 55-32" stroke="#937852" strokeWidth="3" />
      {progress >= 3 && (
        <path
          d="m408 377 112-12 18 17-114 14Z"
          fill="#d6b98a"
          stroke="#907858"
          strokeWidth="2"
        />
      )}
    </>
  );
}

function Room({ workshop, storm }: { workshop: boolean; storm: boolean }) {
  return (
    <>
      <rect
        x="-100"
        y="-1400"
        width="1160"
        height="3200"
        fill={storm ? "#8b8985" : "#c9bca2"}
      />
      <path d="M0-100 480 25 960-100v50L480 61 0-50Z" fill="#7c6758" />
      <path d="M109-160v520m742-520v520" stroke="#8c7761" strokeWidth="18" />
      <rect
        x="172"
        y="92"
        width="181"
        height="155"
        rx="78"
        fill={storm ? "#536a7d" : "#9fbdba"}
        stroke="#e0d0ae"
        strokeWidth="13"
      />
      <path d="M183 174h160m-80-73v137" stroke="#dfd0b1" strokeWidth="6" />
      <path
        d="M184 207q43-13 78-2t78-4m-140 17h40m26-4h62"
        fill="none"
        stroke="#e6dbb8"
        strokeWidth="3"
        opacity=".6"
      />
      <rect
        x="423"
        y="102"
        width="137"
        height="99"
        fill="#a18a68"
        stroke="#766c56"
        strokeWidth="8"
      />
      <path
        d="m437 180 27-47 15 25 19-27 48 44"
        fill="none"
        stroke="#e6c793"
        strokeWidth="3"
      />
      <path d="M0 360H960v1500H0Z" fill={workshop ? "#9b8062" : "#ad9273"} />
      {Array.from({ length: 9 }, (_, i) => (
        <path
          key={i}
          d={`m480 359 ${-1100 + i * 280} 600`}
          stroke="#806e5a"
          strokeWidth="2"
          opacity=".45"
        />
      ))}
      <path d="M0 358H960" stroke="#806a52" strokeWidth="13" />
      <path
        d="M431 329v93m336-93v93M419 316h365v20H419Z"
        fill="#8c6a4f"
        stroke="#6f5b49"
        strokeWidth="3"
      />
      <path d="m416 313 17-20h335l17 20Z" fill="#bc9769" />
      {workshop ? (
        <>
          <g transform="translate(540 293)">
            <path
              d="M-47-48h94v71h-94Zm-8 71H55v7H-55Z"
              fill="#617572"
              stroke="#465b59"
              strokeWidth="3"
            />
            <path d="M4-48v-48" stroke="#7b7561" strokeWidth="7" />
            <circle r="31" fill="#b9a06c" stroke="#d4bb84" strokeWidth="5" />
            <path d="M0-25v50m-25-25h50" stroke="#746e55" strokeWidth="5" />
          </g>
          <path
            d="M614 112h100v119H614Z"
            fill="#738c83"
            stroke="#776d58"
            strokeWidth="9"
          />
          <path
            d="M620 137h88m-88 22h88m-88 22h88m-88 22h88"
            stroke="#536e6c"
            strokeWidth="10"
          />
          <path
            d="M403 227h165m-146-12v-11m29 11v-11m29 11v-11"
            stroke="#79654c"
            strokeWidth="6"
          />
          <path
            d="M422 215v38m-8-26h16m22-12 3 38m24-37v33"
            stroke="#61737a"
            strokeWidth="7"
          />
          <path
            d="M451 345h277v58H451Z"
            fill="#aa855e"
            stroke="#765f4b"
            strokeWidth="3"
          />
          <path
            d="M461 372h257m-176-20v38m90-38v38"
            stroke="#826b50"
            strokeWidth="2"
          />
          <path
            d="M481 358h27m56 0h27m57 0h27"
            stroke="#c8ac74"
            strokeWidth="4"
          />
          <g transform="translate(760 287) scale(.42)">
            <KeeperObject kind="tools" />
          </g>
        </>
      ) : (
        <>
          <g transform="translate(734 293) scale(.8)">
            <KeeperObject kind="radio" />
          </g>
          <path d="M619 182h146v9H619Z" fill="#887055" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <rect
              key={i}
              x={628 + i * 17}
              y={137 + (i % 3) * 5}
              width="14"
              height={44 - (i % 3) * 5}
              fill={["#8d9c8d", "#a87359", "#d1b17b"][i % 3]}
            />
          ))}
          <path d="M187 361h148v14H187Z" fill="#ad8e69" />
          <path d="M197 371v44m124-44v44" stroke="#80654b" strokeWidth="8" />
          <ellipse cx="721" cy="305" rx="17" ry="4" fill="#705e4822" />
          <path d="M710 281h18v21h-18Z" fill="#dbd3b4" />
          <path
            d="M728 285q14-2 10 10h-10"
            fill="none"
            stroke="#dbd3b4"
            strokeWidth="4"
          />
        </>
      )}
    </>
  );
}

function LanternRoom({ lit, storm }: { lit: boolean; storm: boolean }) {
  return (
    <>
      <Sea storm={storm} night={storm} />
      <path
        d="M134-300 134 325m174-625v625m340-625v625m175-625v625"
        stroke="#567075"
        strokeWidth="15"
      />
      <path d="M0 80H960M0 286H960" stroke="#597478" strokeWidth="13" />
      <path d="M0-200H960V31L480 97 0 31Z" fill="#786b62" />
      <path d="M0 316h960v1300H0Z" fill={storm ? "#8b8780" : "#b7ad94"} />
      <path
        d="M0 316q480-22 960 0"
        stroke="#607477"
        strokeWidth="15"
        fill="none"
      />
      <path
        d="M134 325v39m174-41v41m340-41v41m175-41v41"
        stroke="#6e7771"
        strokeWidth="8"
      />
      <path d="M442 365h194v16H442Z" fill="#6b756f" />
      <path
        d="M483 359V285h114v74Z"
        fill="#bd9e68"
        stroke="#827657"
        strokeWidth="4"
      />
      <path d="M477 329h126m-126 22h126" stroke="#866e4f" strokeWidth="4" />
      {lit && <path d="M540 218 950 118v162Z" fill="#ffe6a0" opacity=".2" />}
      <ellipse cx="540" cy="285" rx="99" ry="15" fill="#807759" />
      <path
        d="M451 281V155q89-38 178 0v126Z"
        fill={lit ? "#ddcd88" : "#97b1aa"}
        stroke="#aa955e"
        strokeWidth="5"
      />
      {[462, 488, 514, 540, 566, 592, 618].map((x, i) => (
        <path
          key={x}
          d={`M${x} ${143 + Math.abs(3 - i) * 4}v132`}
          stroke="#e7ecd1"
          strokeWidth="3"
          opacity=".65"
        />
      ))}
      <path
        d="M452 177q88-27 176 0m-176 29q88-25 176 0m-176 28q88-20 176 0m-176 27q88-15 176 0"
        fill="none"
        stroke="#e4e1b9"
        strokeWidth="3"
      />
      <ellipse
        cx="540"
        cy="144"
        rx="91"
        ry="16"
        fill="#c6ab75"
        stroke="#847955"
        strokeWidth="3"
      />
      <path d="M527 129v-24h27v24" fill="#857b63" />
      <g transform="translate(694 344) scale(.66)">
        <KeeperObject kind="oil" />
      </g>
      <g transform="translate(490 352) scale(.5)">
        <KeeperObject kind="handle" />
      </g>
    </>
  );
}

function NorthPoint({
  lit,
  celebration,
}: {
  lit: boolean;
  celebration: boolean;
}) {
  return (
    <>
      <Sea />
      <Seabirds />
      <path
        d="M0 350 96 305 200 341 345 281 456 309 572 277 699 295 811 326 960 315v900H0Z"
        fill="#89947c"
      />
      <path
        d="M0 410 174 355 351 382 467 338 624 359 774 340 960 390v900H0Z"
        fill="#757d6f"
      />
      <path
        d="m259 452 104-49 139-39 68-27 22 15-68 37-151 40-60 23Z"
        fill="#bbb19a"
      />
      <path
        d="M493 348 507 235h71l18 113Z"
        fill="#b4b2a0"
        stroke="#768076"
        strokeWidth="3"
      />
      <path
        d="M495 310h95m-91-38h84m-66-35v35m35 0v38m-30 0v36"
        stroke="#8d9484"
        strokeWidth="3"
      />
      <path
        d="M500 239v-68h86v68Z"
        fill={lit ? "#e8d495" : "#91a7a0"}
        stroke="#757a62"
        strokeWidth="7"
      />
      <path
        d="m486 169 57-43 57 43Z"
        fill="#a77959"
        stroke="#76694e"
        strokeWidth="3"
      />
      <path
        d="M516 176v57m28-57v57m26-57v57"
        stroke="#c5ba8a"
        strokeWidth="3"
      />
      {lit && <path d="M541 203 900 120v154Z" fill="#ffe7a2" opacity=".23" />}
      <path
        d="M494 346q-29-38-1-67m-1 30q-21-14-36-2m39-19q-3-22-27-21"
        fill="none"
        stroke="#667c59"
        strokeWidth="7"
      />
      {[0, 1, 2, 3, 4].map((i) => (
        <ellipse
          key={i}
          cx={475 + (i % 2) * 19}
          cy={273 + i * 16}
          rx="13"
          ry="6"
          fill="#7c9163"
          transform={`rotate(${i % 2 ? -35 : 25} ${475 + (i % 2) * 19} ${273 + i * 16})`}
        />
      ))}
      <path d="M654 329V189" stroke="#8e795b" strokeWidth="5" />
      {celebration && (
        <g transform="translate(677 235)">
          <KeeperObject kind="flag" />
        </g>
      )}
      <g transform="translate(830 205) scale(.3)">
        <path d="M-36 100-18 0h36l18 100Z" fill="#d6c9ab" />
        <path d="M-25 45h50v20h-50Z" fill="#aa775f" />
        <path d="M-23 0v-30h46V0Z" fill="#e9d399" />
        <path d="m-32-30 32-20 32 20Z" fill="#865e54" />
      </g>
      <path
        d="M694 365q30-19 56 0m-609 38q31-17 58-7"
        fill="none"
        stroke="#a3a17c"
        strokeWidth="8"
      />
    </>
  );
}

export function KeeperSceneArt({
  story,
  effort,
  visualWork,
  onWork,
}: {
  story: KeeperStory;
  effort: number;
  visualWork: number;
  onWork?: () => void;
}) {
  const landscape = useLandscape(480, 760);
  const id = useId();
  const { scene, prop, completed } = story;
  if (scene === "harbor")
    return (
      <LighthouseArt
        work={story.harborWork!}
        visualWork={story.harborWork! - Math.max(0, completed - visualWork)}
        effort={effort}
        onWork={onWork}
        home={story.shipsHome}
        fleet={story.fleet}
        northLight={completed >= 24}
        night={story.chapter.weather === "night" && !story.epilogue}
      />
    );
  const storm = story.chapter.weather === "storm";
  const gold = story.chapter.weather === "golden";
  const target = objectPosition(scene, prop!);
  const moving = completed > 0 && completed - visualWork > 0.025;
  const done =
    scene === "lantern"
      ? completed >= 12
      : scene === "north"
        ? completed >= 24
        : false;
  return (
    <svg
      {...landscape}
      className="adventure-art keeper-interior"
      role="img"
      aria-label={`${keeperPlaces[scene]}. ${story.cue}`}
    >
      <defs>
        <linearGradient
          id={id + "sky"}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="0"
          x2="0"
          y2="300"
        >
          <stop stopColor={storm ? "#4e6175" : gold ? "#b6b1af" : "#a9c5c2"} />
          <stop offset="1" stopColor={storm ? "#9ba9ab" : "#f4dfb3"} />
        </linearGradient>
        <clipPath id={id + "rain"}>
          {scene === "lantern" ? (
            <path d="M143 87h156v191H143Zm174 0h125v191H317Zm322 0h175v191H639Z" />
          ) : (
            <rect x="179" y="99" width="167" height="141" rx="70" />
          )}
        </clipPath>
      </defs>
      <rect
        x="-100"
        y="-1500"
        width="1160"
        height="3200"
        fill={`url(#${id}sky)`}
      />
      <circle
        cx="735"
        cy="85"
        r="29"
        fill={storm ? "#c0c6be" : "#ffe6b1"}
        opacity={storm ? 0.3 : 0.85}
      />
      {scene === "landing" && <Landing progress={completed} />}
      {(scene === "cottage" || scene === "workshop") && (
        <Room workshop={scene === "workshop"} storm={storm} />
      )}
      {scene === "lantern" && <LanternRoom lit={done} storm={storm} />}
      {scene === "north" && (
        <NorthPoint lit={done} celebration={completed > 44} />
      )}
      {storm && (
        <g
          clipPath={`url(#${id}rain)`}
          pointerEvents="none"
          opacity=".24"
          stroke="#dae3db"
          strokeWidth="2"
        >
          <g className="keeper-rain">
            {Array.from({ length: 24 }, (_, i) => (
              <path
                key={i}
                d={`m${140 + ((i * 79) % 680)} ${70 + ((i * 37) % 190)} -10 24`}
              />
            ))}
          </g>
        </g>
      )}
      <g transform="translate(235 218)">
        <KeeperFigure character="elias" working={effort > 0.35 || moving} />
      </g>
      {((story.speaker === "nell" && !storm) ||
        (scene === "north" && completed < 24)) && (
        <g transform="translate(110 210) scale(.96)">
          <KeeperFigure character="nell" />
        </g>
      )}
      {scene === "landing" && story.speaker === "mara" && (
        <g transform="translate(124 212)">
          <KeeperFigure character="mara" />
        </g>
      )}
      {scene === "landing" && story.speaker === "finn" && (
        <g transform="translate(129 219)">
          <KeeperFigure character="finn" />
        </g>
      )}
      <g transform={`translate(${target.x} ${target.y})`}>
        <g
          transform={
            prop === "gear" || prop === "handle"
              ? `rotate(${effort * 40})`
              : undefined
          }
        >
          <KeeperObject kind={prop!} done={done || effort > 0.6} />
        </g>
        <g
          data-testid="keeper-task"
          onClick={onWork}
          className="keeper-hotspot"
          style={{ cursor: onWork ? "pointer" : undefined }}
        >
          <circle
            r="49"
            fill="#fff1bd"
            fillOpacity=".12"
            stroke="#fff4d0"
            strokeWidth="3"
            strokeDasharray="4 6"
          />
          <circle
            r="45"
            fill="none"
            stroke="#615a48"
            strokeWidth="1"
            strokeOpacity=".55"
          />
          {effort > 0 && (
            <circle
              r="49"
              fill="none"
              stroke="#f9cc70"
              strokeWidth="5"
              pathLength="1"
              strokeDasharray={`${effort} 1`}
              transform="rotate(-90)"
            />
          )}
          <circle r="50" fill="transparent" />
        </g>
      </g>
    </svg>
  );
}
