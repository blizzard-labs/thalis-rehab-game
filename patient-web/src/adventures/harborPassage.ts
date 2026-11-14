import { variation } from "./trail";

const watches = [
  {
    title: "Sunset approach",
    weather: "clear",
    tasks: [
      ["Sight sail", "Find the returning sail beyond the breakwater.", "boat"],
      [
        "Aim lantern",
        "Light the channel buoy to show the skipper the way in.",
        "buoy",
      ],
      ["Ring bell", "Ring the brass bell to call the boat alongside.", "bell"],
    ],
  },
  {
    title: "Through the fog",
    weather: "fog",
    tasks: [
      [
        "Sound fog bell",
        "Sound the bell so the skipper can find the harbor mouth.",
        "bell",
      ],
      [
        "Light fog buoy",
        "Light the buoy in the gap between the fog banks.",
        "buoy",
      ],
      [
        "Pilot to berth",
        "Guide the boat through the clearing to the marked berth.",
        "guide",
      ],
    ],
  },
  {
    title: "The tide gate",
    weather: "tide",
    tasks: [
      [
        "Read tide gauge",
        "Check the water level beside the striped gate.",
        "gate",
      ],
      [
        "Lift tide gate",
        "Lift the gate to let the boat into the inner basin.",
        "gate",
      ],
      [
        "Bring boat through",
        "Bring the boat through the open gate to its berth.",
        "guide",
      ],
    ],
  },
  {
    title: "Ferry crossing",
    weather: "ferry",
    tasks: [
      [
        "Hail the ferry",
        "Signal the crossing ferry to clear the fairway.",
        "ferry",
      ],
      [
        "Mark the crossing",
        "Light the marker once the ferry is clear.",
        "buoy",
      ],
      [
        "Guide boat across",
        "Guide the boat across the ferry lane and into port.",
        "guide",
      ],
    ],
  },
  {
    title: "The reef passage",
    weather: "reef",
    tasks: [
      [
        "Mark the reef",
        "Mark the exposed rocks at the harbor entrance.",
        "reef",
      ],
      [
        "Lead around reef",
        "Guide the boat around the reef to the channel marker.",
        "guide",
      ],
      [
        "Secure mooring",
        "Secure the mooring line as the boat comes alongside.",
        "berth",
      ],
    ],
  },
  {
    title: "Night pilot",
    weather: "night",
    tasks: [
      [
        "Wake the beacon",
        "Light the lantern for the boat waiting offshore.",
        "lamp",
      ],
      [
        "Light leading mark",
        "Light the second mark to line up the night approach.",
        "buoy",
      ],
      [
        "Escort to quay",
        "Follow the lights and guide the boat to the quay.",
        "guide",
      ],
    ],
  },
] as const;

const names = [
  "Wren",
  "Sea Fern",
  "Marigold",
  "North Star",
  "Blue Petrel",
  "Dawn",
];
const firstNames = [
  "Copper",
  "Silver",
  "Golden",
  "Little",
  "Coral",
  "Morning",
  "Pearl",
  "Windward",
];
const lastNames = [
  "Wren",
  "Tern",
  "Gull",
  "Merlin",
  "Petrel",
  "Dove",
  "Piper",
  "Finch",
];
const hulls = [
  "#a75948",
  "#526e82",
  "#587f72",
  "#ba824e",
  "#82738d",
  "#537c88",
];
export type HarborPoint = { x: number; y: number };
export function harborPassage(boatIndex: number) {
  // Address a passage by the saved boat count. Returning to a half-finished
  // watch restores its weather, vessel and channel without saving a second map.
  const cycle = Math.floor(boatIndex / watches.length);
  const slot = boatIndex % watches.length;
  const order = cycle % 2 === 0 ? slot : watches.length - 1 - slot;
  const watch = watches[(order + cycle * 2) % watches.length];
  const ship =
    boatIndex < names.length
      ? names[boatIndex]
      : firstNames[
          Math.floor(variation(19, boatIndex, 3) * firstNames.length)
        ] +
        " " +
        lastNames[boatIndex % lastNames.length];
  const approach = variation(31, boatIndex),
    channel = variation(45, boatIndex, 2);
  const outer = { x: 729 + approach * 40, y: 287 + channel * 23 };
  const inner = { x: 674 + channel * 18, y: 353 + approach * 13 };
  const berth = { x: 420 + (boatIndex % 4) * 38, y: 406 - (boatIndex % 4) * 4 };
  return {
    ...watch,
    ship,
    cargo: (["mailbags", "fish baskets", "sailcloth", "provisions"] as const)[
      boatIndex % 4
    ],
    color: hulls[boatIndex % hulls.length],
    rig: boatIndex % 3,
    route: [
      { x: 793 + channel * 15, y: 266 + approach * 12 },
      outer,
      inner,
      berth,
    ],
    outer,
    inner,
    berth,
  };
}
export type HarborPassage = ReturnType<typeof harborPassage>;

export function passagePosition(route: HarborPoint[], progress: number) {
  const t = Math.max(0, Math.min(3, progress)),
    segment = Math.min(2, Math.floor(t));
  const a = route[segment],
    b = route[segment + 1],
    f = t - segment;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}
