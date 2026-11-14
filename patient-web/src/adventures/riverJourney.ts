import { variation } from "./trail";

export type Channel = "reed" | "stone";
export type Landfall = { bend: number; channel: Channel };
export const strokesPerBend = 4;

const places = {
  reed: [
    "Willow Reach",
    "Heron Marsh",
    "Reedwater Mill",
    "Kingfisher Bend",
    "Waterlily Pool",
    "Sailmaker’s Quay",
  ],
  stone: [
    "Slate Narrows",
    "The Old Bridge",
    "Copper Cliffs",
    "Pebble Cove",
    "Silver Falls",
    "The Ferry Steps",
  ],
};
const prefixes = [
  "Amber",
  "Alder",
  "Foxglove",
  "Juniper",
  "Silver",
  "Fern",
  "Rowan",
  "Meadow",
  "Hazel",
  "Copper",
];
const suffixes = {
  reed: ["Reach", "Marsh", "Mill", "Bend", "Pool", "Quay"],
  stone: ["Narrows", "Bridge", "Cliffs", "Cove", "Falls", "Steps"],
};
const discoveries = {
  reed: [
    "Ducklings",
    "Heron",
    "Waterwheel",
    "Kingfisher",
    "Water lilies",
    "Sailboat",
  ],
  stone: [
    "River cairn",
    "Stone arch",
    "Copper bluff",
    "River otter",
    "Waterfall",
    "Ferry",
  ],
};

export function riverLanding(seed: number, channel: Channel, bend: number) {
  // Every group visits all six types. Later groups change their starting point
  // and pair a fresh name with the bank geometry drawn for that stretch.
  const cycle = Math.floor(bend / 6);
  const shift =
    cycle === 0
      ? 0
      : Math.floor(variation(seed, cycle, channel === "reed" ? 1 : 2) * 6);
  const motif = (bend + shift) % 6;
  const prefix =
    prefixes[Math.floor(variation(seed, bend, 4) * prefixes.length)];
  return {
    name:
      cycle === 0
        ? places[channel][motif]
        : prefix + " " + suffixes[channel][motif],
    motif,
    discovery: discoveries[channel][motif],
  };
}
