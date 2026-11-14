import { variation, visibleTiles } from "./trail";

export function Horizon({
  seed,
  distance,
  base,
  height,
  color,
  crags = false,
}: {
  seed: number;
  distance: number;
  base: number;
  height: number;
  color: string;
  crags?: boolean;
}) {
  const width = 310;
  const ridge = (tile: number) =>
    Math.round(base - height * (0.4 + variation(seed, tile) * 0.6));
  return (
    <g
      pointerEvents="none"
      fill={color}
      transform={`translate(${-distance} 0)`}
    >
      {visibleTiles(distance, width).map((tile) => {
        const start = ridge(tile),
          end = ridge(tile + 1);
        const top = Math.round(
          base - height * (1.12 + variation(seed, tile, 6) * 0.6),
        );
        const peak = Math.round(80 + variation(seed, tile, 1) * 128);
        const skyline = crags
          ? `L${peak - 30} ${top + 20}l12-22 ${18 + variation(seed, tile, 2) * 19} 2 17 21L310 ${end}`
          : `C${peak * 0.55} ${start},${peak * 0.6} ${top},${peak} ${top}S254 ${end},310 ${end}`;
        return (
          <g key={tile} transform={`translate(${tile * width} 0)`}>
            <path d={`M0 ${start}${skyline}V${base + 22}H0Z`} />
            {crags && (
              <path
                d={`M${peak - 30} ${top + 20}l12-22 10 1-9 28-24 18Z`}
                fill="#f2d3ac"
                opacity=".34"
              />
            )}
          </g>
        );
      })}
    </g>
  );
}

export function TrailSky({
  distance,
  seed,
}: {
  distance: number;
  seed: number;
}) {
  const orbit = (distance * Math.PI) / 16,
    clouds = distance * 12;
  return (
    <g pointerEvents="none">
      <circle
        cx={540 + 218 * Math.cos(orbit)}
        cy={84 - 38 * Math.sin(orbit)}
        r="39"
        fill="#fff0c2"
      />
      <g transform={`translate(${-clouds} 0)`} fill="#fffbec" opacity=".58">
        {visibleTiles(clouds, 420).map((tile) => {
          const u = variation(seed, tile, 11);
          return (
            <path
              key={tile}
              transform={`translate(${420 * tile + 65 + u * 110} ${42 + u * 60}) scale(${0.6 + u * 0.5})`}
              d="M0 0q11-6 24-5 13-15 32-7 13-2 22 8 18-2 33 4Z"
            />
          );
        })}
      </g>
    </g>
  );
}
