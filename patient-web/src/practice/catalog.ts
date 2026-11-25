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
    description: "Follow the marsh or the narrows and fill your river log with discoveries at each landing.",
    unit: "stroke",
    units: "strokes",
  },
  fruit: {
    icon: "🍐",
    description:
      "Pick ripe fruit, fill your cart and make deliveries along an endless orchard lane.",
    unit: "fruit",
    units: "fruit",
  },
  keeper: {
    icon: "⚓",
    description:
      "Become the keeper of Greyhaven. Meet your crew, uncover a forgotten beacon and guide the harbor through eight story chapters.",
    unit: "task",
    units: "tasks",
  },
} satisfies Record<
  Game,
  { icon: string; description: string; unit: string; units: string }
>;
