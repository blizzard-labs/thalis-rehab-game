import { memo, useId, type CSSProperties } from "react";
import { chartPath, skies } from "./constellations";

function skyCell(index: number, columns: number) {
  const slot = index % columns;
  // Fill alternately from the left and right so the first few charts frame the game.
  const column = slot % 2 === 0 ? 1 + slot / 2 : columns - Math.floor(slot / 2);
  return { column, row: Math.floor(index / columns) + 1 };
}

export const CompletedSky = memo(function CompletedSky({
  count,
}: {
  count: number;
}) {
  const id = useId();
  if (!count) return null;
  const wide = Math.max(5, Math.ceil(Math.sqrt(count * 3)));
  const narrow = Math.max(3, Math.ceil(Math.sqrt(count * 1.5)));
  return (
    <div
      className="completed-sky"
      role="group"
      aria-label={`${count} completed ${count === 1 ? "constellation" : "constellations"}`}
      style={{ "--sky-wide": wide, "--sky-narrow": narrow } as CSSProperties}
    >
      <svg className="sky-patterns" width="0" height="0" aria-hidden="true">
        <defs>
          {skies.map((sky, shape) => (
            <symbol
              key={sky.name}
              id={`${id}-sky-${shape}`}
              viewBox="-4 -4 114 93"
            >
              <path
                d={chartPath(sky)}
                fill="none"
                stroke="#a9bad6"
                strokeWidth="1.6"
              />
              {sky.dots.map(([x, y], i) => (
                <g key={i} transform={`translate(${x} ${y})`}>
                  <circle r={i === 0 ? 6 : 4} fill="#e7efff" opacity=".14" />
                  {i === 0 ? (
                    <path
                      d="M0 -5 L1.4 -1.4 5 0 1.4 1.4 0 5 -1.4 1.4 -5 0 -1.4 -1.4Z"
                      fill="#f1f5ff"
                    />
                  ) : (
                    <circle r="2" fill="#e1e9f6" />
                  )}
                </g>
              ))}
            </symbol>
          ))}
        </defs>
      </svg>
      {Array.from({ length: count }, (_, index) => {
        const shape = index % skies.length;
        const desktop = skyCell(index, wide),
          phone = skyCell(index, narrow);
        return (
          <svg
            key={index}
            className="finished-constellation"
            role="img"
            aria-label={`${skies[shape].name}, completed constellation ${index + 1}`}
            style={
              {
                "--wide-col": desktop.column,
                "--wide-row": desktop.row,
                "--narrow-col": phone.column,
                "--narrow-row": phone.row,
                alignSelf: (
                  ["start", "center", "end", "start", "end"] as const
                )[index % 5],
                "--tilt": `${[-8, 7, -3, 12, 2, -10][index % 6]}deg`,
              } as CSSProperties
            }
            viewBox="-4 -4 114 93"
          >
            <use
              href={`#${id}-sky-${shape}`}
              x="-4"
              y="-4"
              width="114"
              height="93"
            />
          </svg>
        );
      })}
    </div>
  );
});
