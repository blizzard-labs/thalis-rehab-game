import type { Seed } from "./seeds";

// Garden geometry, in SVG user units (viewBox 0 0 480 600). The plant is
// rooted in the soil mound and grows straight up; everything below derives
// from `growth` (0..1) so a single number drives the whole illustration.
const GROUND_Y = 520;
const STEM_BASE_X = 240;
const STEM_MAX = 392; // full-height stem at growth = 1

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

// Eight petals laid out radially around the flower's center.
const PETALS = Array.from({ length: 8 }, (_, i) => i * 45);

export function FlowerHead({ seed = "Aster" }: { seed?: Seed }) {
  const poppy = seed === "Poppy",
    sunflower = seed === "Sunflower";
  const angles = poppy ? [45, 135, 225, 315] : PETALS;
  return (
    <>
      <g className="petals">
        {angles.map((deg) => (
          <ellipse
            key={deg}
            cx="0"
            cy={poppy ? -31 : -46}
            rx={poppy ? 44 : sunflower ? 15 : 22}
            ry={poppy ? 42 : 40}
            fill={poppy ? "#de6b53" : sunflower ? "#eeb839" : "var(--purple)"}
            transform={`rotate(${deg})`}
          />
        ))}
      </g>
      <circle
        r={sunflower ? 34 : 26}
        fill={sunflower ? "#704331" : poppy ? "#543e49" : "#f4c84a"}
      />
    </>
  );
}

export function Flower({
  growth,
  bloom,
  seed,
}: {
  growth: number;
  bloom: boolean;
  seed?: Seed;
}) {
  const stemLen = growth * STEM_MAX;
  const stemTop = GROUND_Y - stemLen;
  // Leaves sprout at fixed fractions up the *current* stem, so they ride the
  // plant as it grows. Each fades/scales in over a small growth window.
  const leafLowScale = clamp01((growth - 0.22) / 0.18);
  const leafHighScale = clamp01((growth - 0.48) / 0.18);
  const leafLowY = GROUND_Y - stemLen * 0.42;
  const leafHighY = GROUND_Y - stemLen * 0.68;
  // Flower head grows from a bud into an open flower; bloom snaps it to full.
  const headScale = bloom ? 1 : 0.34 + clamp01((growth - 0.1) / 0.6) * 0.42;
  return (
    <svg
      className={`garden-art flower${bloom ? " flower--bloom" : ""}`}
      data-testid="flower"
      data-growth={growth.toFixed(2)}
      viewBox="120 20 240 520"
      role="img"
      aria-label={
        bloom
          ? "The flower has fully bloomed"
          : `The plant has grown ${Math.round(growth * 100)} percent`
      }
      preserveAspectRatio="xMidYMax meet"
    >
      {/* the plant only — drawn bottom-up so the head sits on top */}
      <g className="plant">
        {/* stem */}
        <line
          x1={STEM_BASE_X}
          y1={GROUND_Y}
          x2={STEM_BASE_X}
          y2={stemTop}
          stroke="#4f9d4f"
          strokeWidth="16"
          strokeLinecap="round"
        />

        {/* lower leaf (left) */}
        <g
          className="leaf"
          style={{
            transform: `translate(${STEM_BASE_X}px, ${leafLowY}px) rotate(-32deg) scale(${leafLowScale})`,
          }}
        >
          <path
            d="M0 0 C -8 -34 -54 -42 -78 -18 C -52 6 -10 8 0 0 Z"
            fill="#5fb35f"
          />
          <path
            d="M-8 -6 C -28 -16 -50 -20 -70 -18"
            stroke="#3f8a3f"
            strokeWidth="3"
            fill="none"
          />
        </g>

        {/* upper leaf (right) */}
        <g
          className="leaf"
          style={{
            transform: `translate(${STEM_BASE_X}px, ${leafHighY}px) rotate(32deg) scale(${leafHighScale})`,
          }}
        >
          <path
            d="M0 0 C 8 -34 54 -42 78 -18 C 52 6 10 8 0 0 Z"
            fill="#6cbf6c"
          />
          <path
            d="M8 -6 C 28 -16 50 -20 70 -18"
            stroke="#3f8a3f"
            strokeWidth="3"
            fill="none"
          />
        </g>

        {/* flower head */}
        <g
          className="flower-headg"
          style={{
            transform: `translate(${STEM_BASE_X}px, ${stemTop}px) scale(${headScale})`,
          }}
        >
          {seed && !bloom && growth < 0.64 ? (
            <g aria-hidden="true">
              <path
                d="M0 8 C-32 -9 -30 -42 -9 -65 Q0 -75 9 -65 C30 -42 32 -9 0 8"
                fill="#60894d"
              />
              <path
                d="M0 5 Q-11 -15 -8 -59 Q12 -46 12 -25 Q9 -8 0 5"
                fill="#86a959"
              />
              {growth > 0.38 && (
                <path
                  d="M-9 -52 Q-20 -73 0 -93 Q20 -71 9 -52 Z"
                  fill={
                    seed === "Poppy"
                      ? "#de6b53"
                      : seed === "Sunflower"
                        ? "#eeb839"
                        : "var(--purple)"
                  }
                />
              )}
            </g>
          ) : (
            <FlowerHead seed={seed} />
          )}
        </g>
      </g>
    </svg>
  );
}
