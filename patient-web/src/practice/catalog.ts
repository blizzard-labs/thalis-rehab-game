export const games = ["garden", "stars", "river", "fruit", "keeper"] as const;
export type Game = (typeof games)[number];
export const gameNames: Record<Game, string> = {
  garden: "Garden Grow",
  stars: "Star Catcher",
  river: "River Rowing",
  fruit: "Fruit Picking",
  keeper: "Lighthouse Keeper",
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
  fruit: {
    icon: "🍐",
    description:
      "Reach for ripe orchard fruit and bring it back to your harvest basket.",
    unit: "fruit",
    units: "fruit",
  },
  keeper: {
    icon: "⚓",
    description:
      "Repair the lighthouse across visits and guide the harbor fleet home.",
    unit: "task",
    units: "tasks",
  },
} satisfies Record<
  Game,
  { icon: string; description: string; unit: string; units: string }
>;
