import { memo } from "react";
import { crateSize, orchardStop } from "./orchardTrail";
import { variation, visibleTiles } from "./trail";

const seasons = [
  {
    sky: "#bfded9",
    light: "#ffedc8",
    hill: "#a1b88f",
    turf: "#baca8a",
    grass: "#809857",
    tree: "#749962",
    shade: "#557b53",
  },
  {
    sky: "#c5dcea",
    light: "#ffedc3",
    hill: "#a8b99b",
    turf: "#c5c681",
    grass: "#949958",
    tree: "#8b9b55",
    shade: "#637b4b",
  },
  {
    sky: "#f2c4ad",
    light: "#ffe9c6",
    hill: "#baab92",
    turf: "#c4b67b",
    grass: "#958b58",
    tree: "#b08a53",
    shade: "#866b4c",
  },
  {
    sky: "#cfcbdf",
    light: "#f7ddc4",
    hill: "#abaaa2",
    turf: "#b4bb8c",
    grass: "#838c66",
    tree: "#889476",
    shade: "#627762",
  },
];
export const orchardLight = (count: number) =>
  seasons[Math.floor(count / 6) % seasons.length];

function FarmStop({ name, packed }: { name: string; packed: number }) {
  const market = name === "Farm market",
    kitchen = name === "Jam kitchen";
  return (
    <g strokeLinejoin="round">
      <ellipse cy="2" rx="57" ry="7" fill="#5c704b" opacity=".24" />
      {market ? (
        <>
          <path d="M-36-44v42m72-42v42" stroke="#7b553d" strokeWidth="5" />
          <path
            d="M-50-45l13-23h72l14 23v7q-5 7-12 0-6 7-13 0-6 7-13 0-6 7-13 0-6 7-13 0-7 7-13 0-7 7-12 0Z"
            fill="#f4deb0"
          />
          <path
            d="m-36-67-11 21h13l9-21Zm23 0-5 21h13l1-21Zm23 0 2 21h13l-5-21Zm22 0 8 21h9l-12-21Z"
            fill="#c56750"
          />
          <path d="M-42-16h84v17h-84z" fill="#a3744d" />
          <path d="M-44-17h88" stroke="#e6b775" strokeWidth="5" />
        </>
      ) : kitchen ? (
        <>
          <path d="M19-58v-24h10v26" fill="#9b6a56" />
          <path d="M-36 0v-51h72V0Z" fill="#efd2a6" />
          <path d="m-45-48 42-32 47 32-5 4-42-24-37 24Z" fill="#8e6065" />
          <path d="M-24-3v-22q10-14 19 0v22Z" fill="#946452" />
          <rect x="2" y="-38" width="22" height="18" rx="2" fill="#829e9b" />
          <path d="M13-38v18M2-30h22" stroke="#f0dbb6" strokeWidth="2" />
          <path d="M-3-12h43v13H-3Z" fill="#b18358" />
        </>
      ) : (
        <>
          <path d="M-41 0v-51h79V0Z" fill="#d5ad78" />
          <path d="m-47-50 21-23h46l26 23Z" fill="#778780" />
          <path d="M-29-4v-37H4v37Z" fill="#8c674a" />
          <path d="M-25-5v-14h24v14Z" fill="#ba8c50" />
          <path
            d="M-34-22H8m-20-18v17m-11-17h22"
            fill="none"
            stroke="#594d3d"
            strokeWidth="3"
          />
          <path d="M7-13h34v14H7Z" fill="#976c44" />
        </>
      )}
      {Array.from({ length: packed }, (_, i) => (
        <g
          key={i}
          transform={`translate(${(market ? -24 : 4) + i * (market ? 24 : 10)} ${market ? -20 : -15})`}
        >
          {market ? (
            <>
              <circle cy="-4" r="5" fill="#d99a55" />
              <circle cx="5" cy="-2" r="4" fill="#b75c48" />
              <path d="m-9-3 2 7H8l3-7Z" fill="#c59960" />
            </>
          ) : kitchen ? (
            <>
              <rect
                x="-3.5"
                y="-6"
                width="7"
                height="9"
                rx="2"
                fill="#975065"
              />
              <path d="M-4-6h8" stroke="#ece0a9" strokeWidth="3" />
            </>
          ) : (
            <path
              d="M-3 2v-8l2-2v-4h3v4l2 2v8Z"
              fill="#b27236"
              stroke="#f4d28b"
              strokeWidth="1.2"
            />
          )}
        </g>
      ))}
      {packed === crateSize && (
        <g stroke="#705842" strokeWidth="2">
          <path d="M38-48v-31" />
          <path d="m39-78 18 4-18 6Z" fill="#da9159" stroke="none" />
        </g>
      )}
    </g>
  );
}

const TreeRow = memo(function TreeRow({
  id,
  seed,
  tile,
}: {
  id: string;
  seed: number;
  tile: number;
}) {
  return (
    <g transform={`translate(${tile * 240} 0)`}>
      {[0, 1, 2].map((i) => {
        const value = variation(seed, tile, i);
        return (
          <use
            key={i}
            href={"#" + id + "tree"}
            transform={`translate(${i * 78 + 18 + value * 38} ${274 + value * 23}) scale(${0.32 + value * 0.36})`}
          />
        );
      })}
    </g>
  );
});

export function OrchardTrail({
  id,
  seed,
  count,
  distance,
  forks,
}: {
  id: string;
  seed: number;
  count: number;
  distance: number;
  forks: readonly number[];
}) {
  const travel = distance * 146,
    far = travel * 0.43;
  const leg = Math.floor(distance / crateSize);
  return (
    <g pointerEvents="none" aria-hidden="true">
      <g transform={`translate(${-far} 0)`}>
        {visibleTiles(far, 240).map((tile) => (
          <TreeRow key={tile} {...{ id, seed, tile }} />
        ))}
      </g>
      <path
        d="M0 342q210-30 461-18t499-21v10q-229 43-504 25T0 356Z"
        fill="#e3c998"
      />
      <g transform={`translate(${-travel} 0)`} data-orchard-travel="">
        {visibleTiles(travel, 240).map((tile) => {
          const x = tile * 240 + variation(seed, tile, 5) * 40;
          return (
            <g key={tile} transform={`translate(${x} 348)`}>
              <path
                d="m-4-6 135-6m-133 13 133-6"
                stroke="#c3a375"
                strokeWidth="3"
              />
              {[0, 66, 132].map((i) => (
                <path
                  key={i}
                  d={`m${i}-13 1 20`}
                  stroke="#917850"
                  strokeWidth="4"
                />
              ))}
              <path
                d="m161 7-3-9m3 9 4-11m0 10 5-4"
                stroke="#768b55"
                strokeWidth="2"
              />
              <g fill={tile % 2 ? "#e7c06b" : "#f0e3c3"}>
                <circle cx="158" cy="-2" r="3" />
                <circle cx="165" cy="-4" r="3" />
              </g>
            </g>
          );
        })}
        {[leg - 1, leg, leg + 1]
          .filter((n) => n >= 0)
          .map((n) => {
            const packed = Math.min(
              crateSize,
              Math.max(0, count - n * crateSize),
            );
            const stop = orchardStop(seed, n, forks.includes(n));
            return (
              <g
                key={n}
                transform={`translate(${(n + 1) * crateSize * 146 + 305} 304) scale(.88)`}
              >
                <FarmStop name={stop.name} packed={packed} />
              </g>
            );
          })}
      </g>
    </g>
  );
}
