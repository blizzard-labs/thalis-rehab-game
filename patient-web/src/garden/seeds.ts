export const seeds = ["Aster", "Poppy", "Sunflower"] as const;
export type Seed = (typeof seeds)[number];

export function seedAt(index: number): Seed {
  return seeds[index % seeds.length];
}
