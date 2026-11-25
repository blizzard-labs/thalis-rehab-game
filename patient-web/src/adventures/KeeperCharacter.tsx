import { keeperCast, type KeeperCharacter as Character } from "./keeperStory";

// The same faces appear in the dialogue and in the illustrated scenes.
export function KeeperFigure({
  character,
  working = false,
}: {
  character: Character;
  working?: boolean;
}) {
  const { color } = keeperCast[character];
  const skin =
    character === "mara"
      ? "#ac7454"
      : character === "nell"
        ? "#d39e79"
        : "#e0b08c";
  return (
    <g strokeLinejoin="round">
      <ellipse cx="60" cy="178" rx="32" ry="5" fill="#263f4926" />
      <path d="M41 117h39l4 53H65l-5-38-5 38H36Z" fill="#3d515e" />
      <path d="M35 167h21v10H29q-3-7 6-10Zm29 0h20l8 10H64Z" fill="#384048" />
      <path d="M32 82q28-12 56 0l6 48H26Z" fill={color} />
      <path d="M48 80l12 12 12-12-3 46H51Z" fill="#e9d9b7" />
      <path
        d="m49 79 10 13-12 10-7-21m31-2L61 92l12 10 8-21"
        fill={color}
        stroke="#293e4933"
        strokeWidth="2"
      />
      <path
        d={
          working
            ? "M32 86 18 108l24 7m44-29 14 18 16-11"
            : "M32 85 22 123m65-38 10 38"
        }
        fill="none"
        stroke={color}
        strokeWidth="14"
        strokeLinecap="round"
      />
      <path
        d={working ? "m42 115 5 1m69-23 4-3" : "m22 123-1 6m76-6 1 6"}
        stroke={skin}
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path d="M52 68h16v17q-8 10-16 0Z" fill={skin} />
      <ellipse cx="60" cy="50" rx="24" ry="29" fill={skin} />
      <path d="M37 51q-8-4-5 5t8 5m43-10q8-4 5 5t-8 5" fill={skin} />
      {character === "nell" ? (
        <>
          <circle cx="77" cy="21" r="12" fill="#a4a0a0" />
          <path
            d="M35 48q-8-27 18-30 35-5 33 31L72 32q-12 15-37 16"
            fill="#a4a0a0"
          />
          <path
            d="M41 52h14m10 0h14m-24 0h10"
            fill="none"
            stroke="#555660"
            strokeWidth="2"
          />
          <circle
            cx="48"
            cy="53"
            r="7"
            fill="none"
            stroke="#555660"
            strokeWidth="2"
          />
          <circle
            cx="72"
            cy="53"
            r="7"
            fill="none"
            stroke="#555660"
            strokeWidth="2"
          />
        </>
      ) : character === "mara" ? (
        <>
          <path
            d="M34 56V36q0-22 26-20 29 0 29 24v31l-12-5-1-28Q62 47 41 43l2 24Z"
            fill="#3f3b3c"
          />
          <path d="M35 36q12-20 45-7l5 12H35Z" fill="#c28c5f" />
          <path d="M34 38h52" stroke="#6d5d4c" strokeWidth="4" />
        </>
      ) : (
        <>
          <path
            d="M36 43q-3-26 24-27 28 0 25 30l-10-12-15 6-18-3v17h-6Z"
            fill={character === "finn" ? "#a26546" : "#66524a"}
          />
          <path
            d="M32 34q27-21 55 0l-3 9H33Z"
            fill={character === "finn" ? "#b29a65" : "#38586a"}
          />
          <path
            d="M31 42h55q-9 8-32 5"
            fill={character === "finn" ? "#8b794f" : "#304958"}
          />
          {character === "elias" && (
            <path
              d="M40 62q5 13 20 16 16-3 20-17-2 24-20 24-18-1-20-23"
              fill="#756054"
            />
          )}
        </>
      )}
      <path
        d="M47 52h3m19 0h3"
        stroke="#3c3d40"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="m60 54-2 8h4"
        fill="none"
        stroke="#9e6e55"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M54 69q6 4 12 0"
        fill="none"
        stroke="#865b4d"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {character === "mara" && (
        <path d="m46 79 13 9 14-9-5 18-9-7-11 7Z" fill="#e7bb73" />
      )}
      {character === "nell" && <path d="M43 95h34v32H43Z" fill="#b59a7a" />}
      {character === "finn" && (
        <path d="m34 85 43 42" stroke="#685543" strokeWidth="7" />
      )}
    </g>
  );
}

export function KeeperPortrait({ character }: { character: Character }) {
  return (
    <svg viewBox="20 7 80 86" className="keeper-portrait" aria-hidden="true">
      <rect
        x="20"
        y="7"
        width="80"
        height="86"
        rx="14"
        fill={keeperCast[character].color + "22"}
      />
      <KeeperFigure character={character} />
    </svg>
  );
}
