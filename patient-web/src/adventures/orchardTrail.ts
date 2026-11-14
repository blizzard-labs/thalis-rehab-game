import { variation } from "./trail";

const stops = [
  {
    name: "Cider press",
    product: "cider bottles",
    fruit: ["apple", "pear", "apple"],
  },
  {
    name: "Jam kitchen",
    product: "jam jars",
    fruit: ["plum", "peach", "plum"],
  },
  {
    name: "Farm market",
    product: "market baskets",
    fruit: ["pear", "apple", "peach"],
  },
] as const;
export type FruitKind = (typeof stops)[number]["fruit"][number];
export const crateSize = 3;

export function orchardStop(seed: number, leg: number, alternate = false) {
  return stops[
    ((seed % stops.length) + leg + Number(alternate)) % stops.length
  ];
}

export function harvestAt(
  seed: number,
  count: number,
  forks: readonly number[],
) {
  const leg = Math.floor(count / crateSize);
  const stop = orchardStop(seed, leg, forks.includes(leg));
  const offset = Math.floor(variation(seed, leg, 9) * crateSize);
  return stop.fruit[(count + offset) % crateSize];
}
