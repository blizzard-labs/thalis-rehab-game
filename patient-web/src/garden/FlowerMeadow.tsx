import { memo, useId } from "react";
import { FlowerHead } from "./Flower";
import { seeds, type Seed } from "./seeds";

/** Each new terrace is farther up the hillside and holds twice as many smaller
 * flowers. Planting another flower never moves an existing one. */
export function meadowPlot(index: number) {
  const row = Math.floor(Math.log2(1 + index / 6));
  const depth = 2 ** -row;
  const slots = 6 / depth;
  const slot = index - (slots - 6);
  const column = slot % 2 === 0 ? slot / 2 : slots - 1 - Math.floor(slot / 2);
  const x = (100 * (column + 0.5)) / slots;
  const bottom =
    4 + (1 - depth) * 25 + (Math.sin(index * 2.6) + 1) * 1.2 * depth;
  const height = (16 + (Math.cos(index * 1.7) + 1) * 2) * depth;
  return { x, bottom, height, width: 72 / slots };
}

export const FlowerMeadow = memo(function FlowerMeadow({
  bed,
  total,
}: {
  bed: Seed[];
  total: number;
}) {
  const id = useId();
  const unknown = total - bed.length;
  return (
    <div
      className="flower-meadow"
      role="group"
      aria-label={`Flower meadow with ${total} blooms`}
    >
      <svg className="meadow-patterns" aria-hidden="true" width="0" height="0">
        <defs>
          {[...seeds, "Earlier bloom" as const].map((seed) => (
            <symbol
              key={seed}
              id={`${id}-${seed.replace(" ", "-")}`}
              viewBox="0 0 90 130"
              preserveAspectRatio="xMidYMax meet"
            >
              <path
                d="M45 130 Q53 86 45 52"
                fill="none"
                stroke="#376640"
                strokeWidth="5"
              />
              <path
                d="M48 103 Q24 100 20 82 Q40 80 48 103 M48 89 Q65 88 74 72 Q53 72 48 89"
                fill="#578649"
              />
              <g transform="translate(45 47) scale(.39)">
                {seed === "Earlier bloom" ? (
                  <>
                    {[0, 72, 144, 216, 288].map((deg) => (
                      <ellipse
                        key={deg}
                        rx="24"
                        ry="35"
                        cy="-32"
                        transform={`rotate(${deg})`}
                        fill="#eee6d0"
                      />
                    ))}
                    <circle r="20" fill="#dcab50" />
                  </>
                ) : (
                  <FlowerHead seed={seed} />
                )}
              </g>
            </symbol>
          ))}
        </defs>
      </svg>
      {Array.from({ length: total }, (_, i) => {
        // Paint the farthest rows first; stems in the foreground overlap naturally.
        const index = total - 1 - i;
        const seed = bed[index - unknown] ?? "Earlier bloom";
        const plot = meadowPlot(index);
        return (
          <svg
            key={index}
            role="img"
            aria-label={seed}
            className={index === total - 1 ? "meadow-flower meadow-flower--new" : "meadow-flower"}
            style={{
              left: `${plot.x}%`,
              bottom: `${plot.bottom}%`,
              width: `${plot.width}%`,
              height: `${plot.height}%`,
            }}
          >
            <use
              href={`#${id}-${seed.replace(" ", "-")}`}
              width="100%"
              height="100%"
            />
          </svg>
        );
      })}
    </div>
  );
});
