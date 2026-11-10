export const games = ["garden", "stars", "river"] as const;
export type Game = (typeof games)[number];
export const gameNames: Record<Game, string> = {
  garden: "Garden Grow",
  stars: "Star Catcher",
  river: "River Rowing",
};
export const gameDetails = {
  garden: {
    icon: "🌱",
    description: "Grow a flower bed that attracts pollinators.",
    unit: "bloom",
    units: "blooms",
  },
  stars: {
    icon: "⭐",
    description: "Guide your net to golden stars to draw constellations.",
    unit: "star",
    units: "stars",
  },
  river: {
    icon: "🚣",
    description: "Pull the oars, choose a channel and discover the riverbank.",
    unit: "stroke",
    units: "strokes",
  },
} satisfies Record<
  Game,
  { icon: string; description: string; unit: string; units: string }
>;
