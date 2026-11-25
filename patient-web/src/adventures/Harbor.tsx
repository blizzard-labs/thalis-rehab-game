import {
  harborPassage,
  harborBerth,
  passagePosition,
  type HarborPassage,
} from "./harborPassage";

type Weather = HarborPassage["weather"];

const palettes = {
  clear: ["#687a95", "#d19f91", "#ffdaa0", "#9fbdb9", "#426877"],
  fog: ["#8e9fa8", "#c6cecb", "#e8e2c8", "#a0b5b5", "#546f7b"],
  tide: ["#80b8c6", "#c9d9ca", "#ffe2ab", "#8cc0b6", "#407982"],
  ferry: ["#9bbdce", "#ead2ae", "#ffdf9c", "#91b7b2", "#477480"],
  reef: ["#bb91a4", "#e5ac96", "#f9ce9b", "#91a9aa", "#496579"],
  night: ["#38445f", "#676887", "#b89a98", "#758899", "#394c66"],
} satisfies Record<Weather, string[]>;
export const harborColors = (weather: Weather) => palettes[weather];

export function Vessel({ color, rig }: { color: string; rig: number }) {
  return (
    <g strokeLinejoin="round">
      <path
        d="M-43 1q38 8 87-4L30 15H-26Z"
        fill={color}
        stroke="#434e51"
        strokeWidth="2"
      />
      <path d="M-34 5q28 4 65-1" fill="none" stroke="#f2d7a7" strokeWidth="2" />
      {rig === 2 ? (
        <>
          <path d="M-23 1v-15h39l6 15Z" fill="#e5cead" />
          <path d="M-25-14h44" stroke="#726558" strokeWidth="4" />
          <path d="M-17-10h9v6h-9Zm13 0H5v6h-9Z" fill="#688589" />
          <path
            d="M23-1v-33l16 31Z"
            fill="none"
            stroke="#79614d"
            strokeWidth="2"
          />
        </>
      ) : (
        <>
          <path d="M4 1v-64" stroke="#715741" strokeWidth="3" />
          <path
            d={rig === 1 ? "M0-60-27-5H0Z" : "M0-55-32-8 0-4Z"}
            fill="#f4e7bd"
          />
          <path d="M8-52 33-8 8-6Z" fill={rig === 1 ? "#c8a18b" : "#c9ccc0"} />
          <path d="M5-63 22-61 5-55Z" fill={color} />
        </>
      )}
    </g>
  );
}

export function HarborTown({ home }: { home: number }) {
  if (!home) return null;
  const cargo = harborPassage(home - 1).cargo;
  const buildings = Math.min(5, 1 + Math.floor(home / 2));
  return (
    <g pointerEvents="none" aria-hidden="true" data-harbor-town={buildings}>
      <g transform="translate(586 261) scale(.78)">
        <path d={`M0-2h${buildings * 54 + 22}v6H0Z`} fill="#856f5c" />
        {Array.from({ length: buildings }, (_, i) => (
          <g
            key={i}
            transform={`translate(${26 + i * 54} ${-3 - (i % 2) * 3})`}
          >
            <path
              d="M-20 0v-26h40V0Z"
              fill={["#dac2a4", "#ceac89", "#bf9992", "#d7c3a0", "#afb7ae"][i]}
            />
            <path
              d={i % 2 ? "M-24-25l9-15h33l9 15Z" : "M-26-25-4-45l30 20Z"}
              fill={i % 2 ? "#716f72" : "#936e5c"}
            />
            <path d="M-13-18h7v8h-7Zm15 0h7v8H2Z" fill="#ffdfa1" />
            <path d="M-1 0v-10h6V0" fill="#857967" />
          </g>
        ))}
        <path d="M4 0v-42" stroke="#6c645b" strokeWidth="3" />
        <path d="m5-42 16 4-16 6Z" fill="#c77954" />
        {Array.from({ length: buildings + 1 }, (_, i) => (
          <path
            key={i}
            d={`m${4 + i * 49} 3v10`}
            stroke="#786653"
            strokeWidth="3"
          />
        ))}
      </g>
      <g transform="translate(395 332)">
        <path d="m-27 1 48-7 3 5-48 8Z" fill="#987453" />
        {[-13, 0, 13].map((x, i) => (
          <g key={x} transform={`translate(${x} ${-i * 2})`}>
            {cargo === "mailbags" ? (
              <>
                <path d="m-3-12 7 0-1 3q9 13-3 12-11 0-4-11Z" fill="#b57750" />
                <path d="m-4-8 7-1" stroke="#f0d9a8" strokeWidth="2" />
              </>
            ) : cargo === "fish baskets" ? (
              <>
                <path d="m-7-5 8-5 5 4-5 2Z" fill="#91aaa7" />
                <path d="m-8-4 16-1-2 7H-6Z" fill="#b18a57" />
              </>
            ) : cargo === "sailcloth" ? (
              <>
                <rect
                  x="-7"
                  y="-6"
                  width="15"
                  height="8"
                  rx="3"
                  fill="#ecd6b1"
                />
                <path d="M-2-6v8" stroke="#8e795d" strokeWidth="2" />
              </>
            ) : (
              <>
                <rect x="-6" y="-10" width="13" height="12" fill="#bd945f" />
                <path d="m-5-8 11 7" stroke="#84694a" strokeWidth="2" />
              </>
            )}
          </g>
        ))}
      </g>
      {home >= 3 && (
        <g transform="translate(368 279)">
          <path d="M-7 0v-28h6v28m-5-26 29-13 2 5-26 12" fill="#8e7357" />
          <path
            d="M21-34v16q-4 4-5-1"
            fill="none"
            stroke="#685c4f"
            strokeWidth="2"
          />
          {Array.from({ length: 1 + (home % 4) }, (_, i) => (
            <rect
              key={i}
              x={i * 8}
              y={-5 - (i % 2) * 3}
              width="8"
              height="7"
              fill={i % 2 ? "#b68b60" : "#bf9f71"}
              stroke="#897356"
            />
          ))}
        </g>
      )}
      {home >= 5 && (
        <g stroke="#816c52" strokeWidth="2">
          <path d="M316 253q42 18 78 0" fill="none" />
          {[0, 1, 2, 3, 4].map((i) => (
            <path
              key={i}
              d={`m${321 + i * 15} ${255 + Math.sin((i * Math.PI) / 4) * 6} 9 1-5 9Z`}
              fill={["#cb8259", "#dfba72", "#6e9997"][(i + home) % 3]}
              stroke="none"
            />
          ))}
        </g>
      )}
    </g>
  );
}

export function ferryAt(progress: number) {
  const clear = Math.min(1, progress);
  return { x: 693 + clear * 109, y: 300 - clear * 25 };
}

export function ChannelMarks({
  passage,
  progress,
}: {
  passage: HarborPassage;
  progress: number;
}) {
  const { weather, outer, inner } = passage;
  const ferry = ferryAt(progress);
  return (
    <g pointerEvents="none">
      {weather === "reef" && (
        <g transform={`translate(${outer.x - 31} ${outer.y + 9})`}>
          <ellipse cy="2" rx="42" ry="6" fill="#dde0ce" />
          <path
            d="m-37 1 13-10 8 4L-4-19l11-3 8 16 12-4 8 10Z"
            fill="#756e71"
          />
          <path d="m-16-5 12-14 7-1-7 11Z" fill="#a7998a" />
        </g>
      )}
      {weather === "tide" && (
        <g transform={`translate(${inner.x} ${inner.y - 2})`}>
          <path d="M-26 3v-43m49 42v-43" stroke="#746e60" strokeWidth="5" />
          <path d="M-25-35h48" stroke="#a88e67" strokeWidth="5" />
          <g
            transform={`translate(0 ${-Math.max(0, Math.min(1, progress - 1)) * 26})`}
          >
            <path d="M-24-7h45v10h-45Z" fill="#bd9e75" />
            <path
              d="m-21-6 9 8m4-8 9 8m5-8 9 8"
              stroke="#825e50"
              strokeWidth="3"
            />
          </g>
          <path d="M-26-32h6m-6 8h4m-4 8h6" stroke="#f7dfb7" strokeWidth="2" />
        </g>
      )}
      {weather === "ferry" && (
        <g transform={`translate(${ferry.x} ${ferry.y}) scale(.71)`}>
          <path d="M-42 0h86l-9 13h-62Z" fill="#72667a" />
          <path d="M-32 0v-19h54l7 19Z" fill="#e7cfa6" />
          {[-24, -12, 0, 12].map((x) => (
            <rect key={x} x={x} y="-14" width="8" height="7" fill="#658590" />
          ))}
          <path d="M-23-19v-8h6v8" fill="#916753" />
        </g>
      )}
      {[outer, inner].map((p, i) => (
        <g key={i} transform={`translate(${p.x} ${p.y + 8})`}>
          <ellipse cy="1" rx="12" ry="3" fill="#b3cec6" />
          <path d="m-7 0 4-8h6l4 8Z" fill={i ? "#659595" : "#c27757"} />
          <path d="M0-7v-15" stroke="#685c54" strokeWidth="2" />
          <circle
            cy="-22"
            r={progress >= i + 1 ? 4 : 3}
            fill={progress >= i + 1 ? "#fff0a7" : "#a79b7b"}
          />
        </g>
      ))}
    </g>
  );
}

export function DockedBoats({
  home,
  visualHomeWork,
  fleet,
}: {
  home: number;
  visualHomeWork: number;
  fleet?: number[];
}) {
  const visible = Math.min(4, home);
  return (
    <g aria-hidden="true" pointerEvents="none">
      {Array.from({ length: visible }, (_, i) => {
        const boatIndex = fleet?.[i] ?? home - visible + i;
        const boat = harborPassage(boatIndex);
        const progress = fleet
          ? 3
          : Math.min(3, visualHomeWork - boatIndex * 3);
        const pos = fleet
          ? harborBerth(home - visible + i)
          : passagePosition(boat.route, progress);
        const scale = 0.42 + 0.34 * (3 - progress);
        return (
          <g
            key={boatIndex}
            transform={`translate(${pos.x} ${pos.y}) scale(${scale})`}
          >
            <Vessel color={boat.color} rig={boat.rig} />
          </g>
        );
      })}
    </g>
  );
}
