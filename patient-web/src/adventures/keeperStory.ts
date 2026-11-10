import type { PracticeRecord } from "../practice/session";

const chapters = [
  {
    title: "The broken landing",
    action: "Fit plank",
    cue: "Mend the landing so the supply boat can come ashore.",
    icon: "⚒",
  },
  {
    title: "The keeper’s stair",
    action: "Fix step",
    cue: "The tide is turning. Repair the stair up to the lantern room.",
    icon: "↟",
  },
  {
    title: "The lantern glass",
    action: "Set pane",
    cue: "Fit the amber panes to shelter the light from the sea wind.",
    icon: "◇",
  },
  {
    title: "First light",
    action: "Wind lamp",
    cue: "Turn the winding handle to bring the beacon back to life.",
    icon: "☀",
  },
];
const ships = [
  "Wren",
  "Sea Fern",
  "Marigold",
  "North Star",
  "Blue Petrel",
  "Dawn",
];
const signals = [
  {
    action: "Sight sail",
    icon: "⚑",
    cue: "Find the returning sail beyond the breakwater.",
  },
  {
    action: "Aim lantern",
    icon: "☀",
    cue: "Turn the beam toward the safe channel.",
  },
  {
    action: "Ring bell",
    icon: "♫",
    cue: "Sound the harbor bell to welcome the boat home.",
  },
];
export function keeperStory(work: number) {
  const built = Math.min(12, work),
    shipsHome = Math.floor(Math.max(0, work - 12) / 3);
  const step = work % 3,
    ship = ships[shipsHome % ships.length];
  const chapter =
    built < 12
      ? chapters[Math.floor(built / 3)]
      : { ...signals[step], title: `${ship} returns` };
  return { ...chapter, step, built, shipsHome, ship };
}
/** Other completed games bring up to three supplies per outing. A keeper task
 * contributes one unit. An earlier starting balance is never counted again. */
export function keeperWork(
  records: Pick<PracticeRecord, "game" | "rewards">[],
) {
  return records.reduce(
    (sum, r) =>
      sum + (r.game === "keeper" ? r.rewards : Math.min(3, r.rewards)),
    0,
  );
}
