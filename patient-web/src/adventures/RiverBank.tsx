import { memo } from "react";
import { variation, visibleTiles } from "./trail";
import type { Channel } from "./riverJourney";

const skies = [
  ["#edc89a", "#fff0c7", "#afb7a1", "#899f8d", "#8bbba9", "#3d8584", "#296770"],
  ["#acceda", "#f6e8c9", "#a1b9b3", "#789a92", "#9acbc2", "#4a948f", "#326f79"],
  ["#edbdab", "#ffddb1", "#b9abac", "#a19191", "#b9b5a5", "#778f92", "#4e7384"],
  ["#b8b9d4", "#f8d9ba", "#a9a9bd", "#8891a2", "#a9b6bd", "#708e9c", "#526d81"],
];
export const riverLight = (strokes: number) =>
  skies[Math.floor(strokes / 8) % skies.length];

const BankTile = memo(function BankTile({
  seed,
  tile,
  channel,
  id,
}: {
  seed: number;
  tile: number;
  channel: Channel;
  id: string;
}) {
  const stone = channel === "stone";
  const h = (n: number) => 185 + Math.round(variation(seed, n, 1) * 17);
  const x = tile * 280;
  return (
    <g transform={`translate(${x} 0)`}>
      <path
        d={`M0 ${h(tile)} Q72 ${h(tile) - 24} 141 ${h(tile) + 2}T280 ${h(tile + 1)}V224H0Z`}
        fill={stone ? "#928879" : "#779171"}
      />
      {[0, 1, 2, 3, 4].map((i) => {
        const u = variation(seed, tile, i + 2),
          px = 12 + i * 52 + u * 24;
        if (stone && i % 2 === 0)
          return (
            <g
              key={i}
              transform={`translate(${px} 211) scale(${0.48 + u * 0.7})`}
            >
              <path
                d="m-35 0 4-16 15-3 8-25 18-6 16 14-3 13 20 23Z"
                fill={i === 2 ? "#ad8973" : "#888a81"}
              />
              <path d="m-26-13 15-3 14-27 7 5-10 26-13 7Z" fill="#c3b19a" />
            </g>
          );
        return (
          <use
            key={i}
            href={"#" + id + (stone || u < 0.4 ? "pine" : "willow")}
            transform={`translate(${px} ${202 + u * 11}) scale(${0.35 + u * 0.64})`}
          />
        );
      })}
      <path
        d={`M0 215q70 ${-5 - variation(seed, tile) * 8} 142-2t138 2v9H0Z`}
        fill={stone ? "#746f63" : "#536e55"}
      />
      <path
        d="M15 227q45 5 88 0m29 3q41 4 85-1"
        fill="none"
        stroke="#d4d9be"
        strokeWidth="2"
        opacity=".6"
      />
    </g>
  );
});

export function RiverBank({
  seed,
  distance,
  channel,
  id,
}: {
  seed: number;
  distance: number;
  channel: Channel;
  id: string;
}) {
  const far = distance * 32;
  return (
    <g pointerEvents="none" transform={`translate(${-far} 0)`}>
      {visibleTiles(far, 280).map((tile) => (
        <BankTile key={tile} {...{ id, tile, channel, seed }} />
      ))}
    </g>
  );
}

export function NearBank({
  seed,
  distance,
  id,
  channel,
}: {
  seed: number;
  distance: number;
  id: string;
  channel: Channel;
}) {
  const travel = distance * 142;
  return (
    <g pointerEvents="none" transform={`translate(${-travel} 0)`}>
      {visibleTiles(travel, 280).map((tile) => {
        const u = variation(seed, tile, 7);
        return (
          <g
            key={tile}
            transform={`translate(${tile * 280 + u * 90} ${440 + u * 20})`}
          >
            <ellipse rx="54" ry="5" fill="#285f63" opacity=".55" />
            {channel === "reed" ? (
              [0, 1, 2].map((i) => (
                <use
                  key={i}
                  href={"#" + id + "rush"}
                  transform={`translate(${i * 16} ${(i % 2) * 3}) scale(${0.65 + variation(seed, tile, i + 5) * 0.65})`}
                />
              ))
            ) : (
              <g>
                <path d="m-28 0 15-11 16 4 7 8Z" fill="#a6aaa0" />
                <path d="m-3 1 17-17 19-2 14 17Z" fill="#798a85" />
                <path d="m14-15 18-2 5 6-22 3Z" fill="#b8baab" />
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}
