import type { KeeperProp } from "./keeperStory";

/** Task objects share the warm brass, wood and glass of the original harbor. */
export function KeeperObject({
  kind,
  done = false,
}: {
  kind: KeeperProp;
  done?: boolean;
}) {
  switch (kind) {
    case "key":
      return (
        <g stroke="#bf974f" strokeWidth="7" fill="none">
          <circle cx="-15" cy="-8" r="14" />
          <path d="m-4 2 30 30m-9-9 8-8m-1 17 8-8" />
        </g>
      );
    case "rope":
      return (
        <g fill="none" stroke="#c8a477" strokeWidth="7" strokeLinecap="round">
          <ellipse rx="32" ry="13" />
          <ellipse cy="-8" rx="30" ry="13" />
          <path d={done ? "M-24-15q7-27 26-9t29 8" : "M-25-18q-26-16-39 0"} />
        </g>
      );
    case "plank":
      return (
        <g transform={done ? "rotate(-4)" : "rotate(-13)"}>
          <path
            d="M-58-12h116v24H-58Z"
            fill="#c8a377"
            stroke="#82684f"
            strokeWidth="2"
          />
          <path d="M-48-3h92m-76 9h45" stroke="#a58059" strokeWidth="2" />
          <circle cx="-46" r="2" fill="#746d63" />
          <circle cx="46" r="2" fill="#746d63" />
        </g>
      );
    case "letter":
      return (
        <g>
          <path
            d="M-39-43h62l19 19v68h-81Z"
            fill="#f5e5bd"
            stroke="#bda37b"
            strokeWidth="2"
          />
          <path
            d="M23-43v19h19"
            fill="#dfc793"
            stroke="#bda37b"
            strokeWidth="2"
          />
          <path
            d="M-27-23H9m-36 11h55m-55 11h51m-51 11h39"
            stroke="#a28a67"
            strokeWidth="2"
          />
          <circle cx="23" cy="27" r="9" fill="#aa6554" />
          <path
            d="m19 28 4-7 4 7-4 4Z"
            fill="none"
            stroke="#d8ac83"
            strokeWidth="1.5"
          />
        </g>
      );
    case "journal":
    case "chart":
      return (
        <g>
          <path
            d="M-55-29q28-9 55 0 28-9 55 0v65q-30-9-55 0-27-8-55 0Z"
            fill={kind === "journal" ? "#aa7650" : "#e6ce9d"}
            stroke="#907554"
            strokeWidth="2"
          />
          <path
            d="M-49-27q25-7 49 1 24-7 49-1v54q-27-6-49 1-23-6-49-1Z"
            fill="#f7e9c9"
          />
          <path d="M0-25v52" stroke="#c6af84" />
          {kind === "chart" ? (
            <>
              <path
                d="m-45-18 17 9-8 21 16 9m40-40-7 18 24 17"
                fill="none"
                stroke="#86a49b"
                strokeWidth="10"
              />
              <path
                d="m-21 15 19-27L27 8"
                fill="none"
                stroke="#ab6952"
                strokeWidth="2.5"
                strokeDasharray="4 4"
              />
              <circle cx="27" cy="8" r="4" fill="#bb8355" />
            </>
          ) : (
            <path
              d="M-41-12h28m-28 9h32m-32 9h24m23-18h29m-29 9h34m-34 9h26m-26 9h29"
              fill="none"
              stroke="#ab9371"
              strokeWidth="2"
            />
          )}
        </g>
      );
    case "radio":
      return (
        <g>
          <path
            d="M-42-26h84v57h-84Z"
            fill="#647d7c"
            stroke="#3d5659"
            strokeWidth="3"
          />
          <path
            d="M-20-27v-26h40v26m22-16 16-29"
            fill="none"
            stroke="#586064"
            strokeWidth="4"
          />
          <rect
            x="-31"
            y="-15"
            width="40"
            height="17"
            rx="2"
            fill={done ? "#efda9c" : "#b2b9a2"}
          />
          <path d="M-30 12h35m-35 7h35" stroke="#40595a" strokeWidth="3" />
          <circle cx="26" cy="13" r="10" fill="#d5b980" />
          <circle cx="27" cy="-12" r="4" fill={done ? "#f5c17a" : "#b0946d"} />
        </g>
      );
    case "gear":
      return (
        <g stroke="#b99552" strokeWidth="8" fill="#d6b66e">
          {Array.from({ length: 8 }, (_, i) => (
            <path key={i} d="M0-38v13" transform={`rotate(${i * 45})`} />
          ))}
          <circle r="27" />
          <circle r="11" fill="#776954" strokeWidth="4" />
        </g>
      );
    case "handle":
      return (
        <g strokeLinecap="round">
          <circle r="26" fill="#a17e53" stroke="#d1b17b" strokeWidth="5" />
          <path
            d={done ? "M0 0 23-24h14" : "M0 0 25 19h14"}
            fill="none"
            stroke="#465b60"
            strokeWidth="9"
          />
          <circle r="7" fill="#e2c18a" />
        </g>
      );
    case "glass":
    case "lens":
    case "reflector":
      return (
        <g>
          <path
            d="M-29-42h58v83h-58Z"
            fill={done ? "#e4dda4" : "#95b4b3"}
            stroke="#b59a67"
            strokeWidth="5"
          />
          {[-24, -12, 0, 12, 24].map((x) => (
            <path
              key={x}
              d={`M${x}-36v72`}
              stroke="#ecf1d6"
              strokeWidth="2"
              opacity=".65"
            />
          ))}
          <path
            d="m-21-30 29 57m-18-57 30 57"
            stroke="#fff9df"
            strokeWidth="3"
            opacity=".5"
          />
        </g>
      );
    case "oil":
      return (
        <g>
          <path
            d="M-25-17h48l8 47h-64Z"
            fill="#b58757"
            stroke="#7c634a"
            strokeWidth="2"
          />
          <path
            d="M-15-18v-14H7v14m17 6 20-17 3 7-18 24"
            fill="none"
            stroke="#bd965e"
            strokeWidth="7"
          />
          <path
            d="M-31-9q-27-7-25 13 1 17 25 14"
            fill="none"
            stroke="#97754f"
            strokeWidth="6"
          />
          <path d="M-18 19h37" stroke="#d9b985" strokeWidth="2" />
        </g>
      );
    case "lamp":
      return (
        <g>
          <path
            d="M-27 30h54l-7-7v-49h-40v49Z"
            fill="#deb56a"
            stroke="#8a7554"
            strokeWidth="3"
          />
          <path d="M-15-22h30v43h-30Z" fill={done ? "#ffe1a0" : "#b4bca5"} />
          {done && <path d="M0 15q-15-6 1-27 13 19-1 27" fill="#f2a84f" />}
          <path
            d="M-17-29q0-27 17-27t17 27"
            fill="none"
            stroke="#87725b"
            strokeWidth="4"
          />
        </g>
      );
    case "tools":
      return (
        <g>
          <path
            d="M-52-22h103v51H-52Z"
            fill="#ad8965"
            stroke="#7e664d"
            strokeWidth="2"
          />
          <path d="M-32-22v51m63-51v51" stroke="#665b4d" strokeWidth="6" />
          <path
            d="M-18-33v36m-7-37q-4-17 7-18l-1 10h7v-10q14 6 1 18M8-41V3m-4-47h9v14H4Z"
            fill="#939f9b"
            stroke="#5c6e70"
            strokeWidth="3"
          />
        </g>
      );
    case "bolt":
      return (
        <g fill="#bca069" stroke="#7c704f" strokeWidth="3">
          <path d="M-9-30H9v61H-9Z" />
          <path d="m-20-27 10-12H12l10 12-10 13h-22Z" />
          <path d="M-10-1h20m-20 9h20m-20 9h20" />
        </g>
      );
    case "shutter":
      return (
        <g>
          <path
            d="M-41-48h82v96h-82Z"
            fill="#73918b"
            stroke="#48676a"
            strokeWidth="5"
          />
          {[-30, -14, 2, 18, 34].map((y) => (
            <path key={y} d={`M-35 ${y}h70`} stroke="#526e6e" strokeWidth="5" />
          ))}
          <path
            d={done ? "M-40 0h80" : "m-31 19 62-38"}
            stroke="#b99e70"
            strokeWidth="8"
          />
          <circle r="5" fill="#5b6560" />
        </g>
      );
    case "flag":
      return (
        <g>
          <path d="M-23-47v100" stroke="#8d7457" strokeWidth="5" />
          <path
            d="m-21-43 68 8-20 15 20 19-68-8Z"
            fill="#bc7857"
            stroke="#875c4e"
            strokeWidth="2"
          />
          <path d="m-9-27 16-7 13 8-13 7Z" fill="#f0d6a0" />
        </g>
      );
  }
}
