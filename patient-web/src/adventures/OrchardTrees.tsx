import { memo } from "react";
import { variation, visibleTiles } from "./trail";

export const treeTravel = 172;
const spacing = 388;

function treeRoot(seed: number, tile: number) {
  return tile * spacing + 96 + variation(seed, tile, 71) * 68;
}

// The fruit and its twig belong to the tree at the spot where the cart will stop.
export function branchAnchor(seed: number, fruitX: number) {
  const tile = Math.floor((fruitX - 96) / spacing);
  const left = treeRoot(seed, tile),
    right = treeRoot(seed, tile + 1);
  const root = fruitX - left < right - fruitX ? left : right;
  return { x: root + (fruitX < root ? -51 : 51), y: 92 };
}

const Tree = memo(function Tree({
  seed,
  tile,
  id,
}: {
  seed: number;
  tile: number;
  id: string;
}) {
  const x = treeRoot(seed, tile),
    foot = 354 + variation(seed, tile, 9) * 36;
  const flip = variation(seed, tile, 12) > 0.5 ? -1 : 1;
  const leaves = variation(seed, tile, 18) > 0.5 ? "#739256" : "#658758";
  return (
    <g transform={`translate(${x} 0) scale(${flip} 1)`}>
      <ellipse cy={foot + 1} rx="43" ry="5" fill="#536b47" opacity=".25" />
      <path
        d={`M-23 ${foot}Q5 249-9 155L-67 75l13-9 56 62 55-70 12 6-50 91Q32 252 9 ${foot - 2}l11 4-20-2-14 4Z`}
        fill="#89654b"
      />
      <path
        d={`M-6 ${foot - 12}Q15 244 4 167m1-26-31-37`}
        fill="none"
        stroke="#ac865d"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M-64 87q-37-22-73-24m180 27q31-24 70-29"
        fill="none"
        stroke="#876348"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <path
        d="M-145 42q-14-22 7-44 1-25 40-32 24-26 66-21 34-30 72-11 37-6 58 22 43 1 48 33 28 23 9 48-14 27-48 23-15 29-51 21-27 27-56 9-39 18-61-7-37 12-51-15-31 2-33-26Z"
        fill={leaves}
      />
      <path
        d="M-145 40q21 24 47 12 22 23 55 14 25 17 54 3 31 15 57-9 40 7 75-20-9 28-41 26-20 26-50 17-28 23-53 7-37 16-61-7-36 12-50-14-28 1-33-29Z"
        fill="#54764e"
      />
      {[-90, -42, 13, 68, 112].map((dx, i) => {
        const y = 43 + variation(seed, tile, i) * 30;
        return (
          <g key={dx} transform={`translate(${dx} ${y})`}>
            <use href={"#" + id + "leaf"} transform="rotate(-20) scale(.62)" />
            <path d="M0 0l-3 10" fill="none" stroke="#644f36" strokeWidth="2" />
            <circle
              cx="-3"
              cy="14"
              r="6"
              fill={i % 2 ? "#c98955" : "#cfab60"}
            />
          </g>
        );
      })}
    </g>
  );
});

export function OrchardTrees({
  distance,
  id,
  seed,
}: {
  distance: number;
  id: string;
  seed: number;
}) {
  const travel = distance * treeTravel;
  return (
    <g
      data-orchard-trees=""
      transform={`translate(${-travel} 0)`}
      pointerEvents="none"
    >
      {visibleTiles(travel, spacing).map((tile) => (
        <Tree key={tile} {...{ seed, tile, id }} />
      ))}
    </g>
  );
}
