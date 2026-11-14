import { harborPassage } from "./harborPassage";
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
export function keeperStory(work: number) {
  const built = Math.min(12, work);
  const shipsHome = Math.floor(Math.max(0, work - 12) / 3);
  const step = work % 3;
  const passage = harborPassage(shipsHome);
  const [action, cue, target] = passage.tasks[step];
  const chapter =
    built < 12
      ? chapters[Math.floor(built / 3)]
      : {
          title: `${passage.ship} returns`,
          action,
          cue,
          icon: target === "bell" ? "♫" : target === "guide" ? "⚓" : "⚑",
        };
  return {
    ...chapter,
    built,
    shipsHome,
    step,
    ship: passage.ship,
    passage,
    target,
  };
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
