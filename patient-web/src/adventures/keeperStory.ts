import { harborPassage } from "./harborPassage";
import type { PracticeRecord } from "../practice/session";

export const keeperCast = {
  elias: { name: "Elias", role: "Lighthouse keeper", color: "#587b80" },
  mara: { name: "Mara", role: "Harbor pilot", color: "#a56550" },
  nell: { name: "Nell", role: "Boatwright", color: "#827099" },
  finn: { name: "Finn", role: "Postboat skipper", color: "#a58248" },
} as const;
export type KeeperCharacter = keyof typeof keeperCast;
export type KeeperScene =
  | "landing"
  | "cottage"
  | "workshop"
  | "lantern"
  | "north"
  | "harbor";
export type KeeperProp =
  | "key"
  | "rope"
  | "plank"
  | "journal"
  | "chart"
  | "radio"
  | "gear"
  | "handle"
  | "glass"
  | "lens"
  | "oil"
  | "lamp"
  | "tools"
  | "reflector"
  | "bolt"
  | "shutter"
  | "flag"
  | "letter";
export type KeeperTask = {
  scene: KeeperScene;
  prop?: KeeperProp;
  action: string;
  cue: string;
  speaker: KeeperCharacter;
  line: string;
  reply: string;
  // Harbor tasks use the existing three-signal approach and gesture controls.
  harborWork?: number;
  arrival?: string;
};
export type KeeperChapter = {
  title: string;
  goal: string;
  memory: string;
  souvenir: string;
  weather: "dawn" | "day" | "fog" | "storm" | "night" | "golden";
  tasks: KeeperTask[];
};

export const keeperChapters: KeeperChapter[] = [
  {
    title: "The key to Greyhaven",
    weather: "dawn",
    goal: "Make a home at the abandoned lighthouse.",
    memory:
      "Elias opened Greyhaven. In the old keeper’s journal, he found a drawing of two lights guarding the bay.",
    souvenir: "The brass key",
    tasks: [
      {
        scene: "landing",
        prop: "key",
        action: "Take the key",
        cue: "Collect the brass key from the landing.",
        speaker: "mara",
        line: "Welcome to Greyhaven, Elias. The light has been dark all winter. I was beginning to think nobody would come.",
        reply: "Then let’s give them something to look for tonight.",
      },
      {
        scene: "landing",
        prop: "rope",
        action: "Tie the mooring",
        cue: "Secure Mara’s boat to the mooring post.",
        speaker: "mara",
        line: "My father knew every rock by the sound of the water. I prefer a light I can actually see.",
        reply: "I’ll keep one burning for you.",
      },
      {
        scene: "landing",
        prop: "plank",
        action: "Mend the landing",
        cue: "Fit the missing board in the landing.",
        speaker: "nell",
        line: "I brought a plank. You’ll find the whole place has a list of opinions about being left alone.",
        reply: "We’ll start with the one under our feet.",
      },
      {
        scene: "cottage",
        prop: "journal",
        action: "Open the journal",
        cue: "Open the previous keeper’s journal on the desk.",
        speaker: "elias",
        line: "The last keeper left this here. Every page ends with the same words. ‘Count the boats. Keep the light.’",
        reply:
          "Mara said there was a second light once. There’s a sketch of it here.",
      },
      {
        scene: "cottage",
        prop: "chart",
        action: "Unfold the chart",
        cue: "Spread the chart beside the journal.",
        speaker: "mara",
        line: "That mark is North Point. Its beacon disappeared from the new charts. Nobody goes there after dusk.",
        reply: "Two lights. One safe path. Why would anyone erase it?",
      },
      {
        scene: "cottage",
        prop: "radio",
        action: "Call the harbor",
        cue: "Use the radio to arrange the first delivery.",
        speaker: "finn",
        line: "Postboat Wren calling. I have your supplies and a letter with no stamp. I’ll bring both when your lamp is ready.",
        reply: "Greyhaven will be waiting, Finn.",
      },
    ],
  },
  {
    title: "First light",
    weather: "golden",
    goal: "Repair the mechanism and light the beacon.",
    memory:
      "With Nell’s help, Elias repaired the old mechanism. Greyhaven shone again, and Finn’s postboat answered from the bay.",
    souvenir: "The lantern flame",
    tasks: [
      {
        scene: "workshop",
        prop: "gear",
        action: "Fit the gear",
        cue: "Set the brass gear into the winding mechanism.",
        speaker: "nell",
        line: "This little wheel turns all that glass upstairs. Funny how the smallest thing can stop the whole harbor.",
        reply: "It deserves a proper seat, then.",
      },
      {
        scene: "workshop",
        prop: "handle",
        action: "Wind the mechanism",
        cue: "Turn the handle to test the repaired gears.",
        speaker: "nell",
        line: "There it is. Hear that steady tick? I’ve left a spare gear in the drawer. Old machines like a little insurance.",
        reply: "I’ll remember where you put it.",
      },
      {
        scene: "lantern",
        prop: "glass",
        action: "Set the pane",
        cue: "Fit the missing pane in the lantern room.",
        speaker: "mara",
        line: "From down here, you look like a firefly in a jam jar.",
        reply: "A very draughty jar. One more pane should help.",
      },
      {
        scene: "lantern",
        prop: "lens",
        action: "Polish the lens",
        cue: "Polish the salt from the great lens.",
        speaker: "elias",
        line: "Under the salt, the glass is beautiful. A hundred small prisms, all carrying the same light.",
        reply: "I can see Wren’s sail through them.",
      },
      {
        scene: "lantern",
        prop: "oil",
        action: "Fill the lamp",
        cue: "Fill the lamp reservoir for the evening watch.",
        speaker: "nell",
        line: "Full reservoir, clean wick, steady gears. The old keeper could say it in his sleep.",
        reply: "I think I’ll learn it soon enough.",
      },
      {
        scene: "lantern",
        prop: "lamp",
        action: "Light the beacon",
        cue: "Light Greyhaven’s beacon for the first time.",
        speaker: "finn",
        line: "Wren to Greyhaven. It’s getting dark out here, Keeper.",
        reply: "Look toward the headland, Finn. This one’s for you.",
      },
    ],
  },
  {
    title: "A voice in the fog",
    weather: "fog",
    goal: "Bring Wren and Sea Fern safely alongside.",
    memory:
      "Two boats reached home. Finn delivered a letter addressed to ‘the next keeper’. It asked Elias to find the missing light.",
    souvenir: "A letter without a stamp",
    tasks: [
      {
        scene: "harbor",
        harborWork: 12,
        action: "Sight sail",
        cue: "Find Wren beyond the breakwater.",
        speaker: "finn",
        line: "I see it! Your light’s reached the water. Now let’s see if you can pick out my terribly patched sail.",
        reply: "There you are. Welcome to Greyhaven, Wren.",
      },
      {
        scene: "harbor",
        harborWork: 13,
        action: "Aim lantern",
        cue: "Sweep the lantern to the channel buoy, or tap its marker.",
        speaker: "mara",
        line: "Bring the beam to the inner buoy. Finn will follow it past the rocks.",
        reply: "A steady light. A clear way home.",
      },
      {
        scene: "harbor",
        harborWork: 14,
        action: "Ring bell",
        cue: "Ring the bell to bring Wren alongside.",
        speaker: "finn",
        line: "Supplies delivered! And here’s that letter. It says, ‘For the next keeper, when the northern light goes missing.’",
        reply: "Someone knew we’d need it.",
        arrival: "Wren",
      },
      {
        scene: "harbor",
        harborWork: 15,
        action: "Sound fog bell",
        cue: "Sound the bell for the boat hidden in the fog.",
        speaker: "mara",
        line: "Sea Fern’s still outside. Fog’s swallowed the breakwater. Give her something to listen for.",
        reply: "Three clear notes. We’re here, Sea Fern.",
      },
      {
        scene: "harbor",
        harborWork: 16,
        action: "Light fog buoy",
        cue: "Sweep the lantern to the marked buoy, or tap it to light it.",
        speaker: "mara",
        line: "She heard you. I can make out her bow. Put the light on the inner mark.",
        reply: "There’s the gap. Let’s keep it open for her.",
      },
      {
        scene: "harbor",
        harborWork: 17,
        action: "Pilot to berth",
        cue: "Drag Sea Fern to the marked berth, or tap the marker.",
        speaker: "finn",
        line: "Sea Fern’s skipper says the north channel was completely dark. That old letter is starting to worry me.",
        reply: "We’ll read it together, once everyone’s home.",
        arrival: "Sea Fern",
      },
    ],
  },
  {
    title: "The missing light",
    weather: "day",
    goal: "Find and restore the forgotten northern beacon.",
    memory:
      "The letter revealed a second beacon hidden by years of ivy. Elias and Nell restored it. Two lights now marked the old channel.",
    souvenir: "The north-point reflector",
    tasks: [
      {
        scene: "cottage",
        prop: "letter",
        action: "Read the letter",
        cue: "Open the old keeper’s letter.",
        speaker: "elias",
        line: "‘The north light was never lost. Only forgotten. When the south channel closes, follow the two lights home.’",
        reply: "There’s a path drawn on the back.",
      },
      {
        scene: "cottage",
        prop: "chart",
        action: "Trace the old channel",
        cue: "Trace the safe channel on the old chart.",
        speaker: "mara",
        line: "That route goes behind the reef. With both beacons working, we could use it even at low tide.",
        reply: "Then we’d better find the second one.",
      },
      {
        scene: "landing",
        prop: "tools",
        action: "Pack the tools",
        cue: "Collect Nell’s tool roll before leaving the landing.",
        speaker: "nell",
        line: "I’ve brought the spanners. You bring the map. If this turns into a wild-goose chase, you owe me tea.",
        reply: "Tea either way. Let’s go.",
      },
      {
        scene: "north",
        prop: "reflector",
        action: "Set the reflector",
        cue: "Fit the reflector inside the small coastal beacon.",
        speaker: "nell",
        line: "Under all that ivy! Whoever built this meant it to last. The reflector just needs setting straight.",
        reply: "Greyhaven’s smaller twin. We found you.",
      },
      {
        scene: "north",
        prop: "bolt",
        action: "Secure the lens",
        cue: "Fasten the beacon’s lens to its frame.",
        speaker: "elias",
        line: "From here I can see our tower, and the narrow ribbon of water between the rocks.",
        reply: "This is what the old keeper wanted us to see.",
      },
      {
        scene: "north",
        prop: "lamp",
        action: "Light North Point",
        cue: "Light the second beacon and signal the harbor.",
        speaker: "mara",
        line: "I can see two lights from the quay. Elias, you’ve opened a way home we thought we’d lost.",
        reply: "Let’s hope we never need it in a hurry.",
      },
    ],
  },
  {
    title: "Before the weather turns",
    weather: "day",
    goal: "Bring in supplies and prepare both lights for rough weather.",
    memory:
      "Marigold delivered supplies through the tide gate. Mara marked the old channel before heading out to escort the fishing boats.",
    souvenir: "Mara’s marked chart",
    tasks: [
      {
        scene: "harbor",
        harborWork: 18,
        action: "Read tide gauge",
        cue: "Read the gauge beside the tide gate.",
        speaker: "mara",
        line: "The weather boat’s reporting wind from the west. Marigold has the last delivery. Is there enough water at the gate?",
        reply: "The gauge is rising. We have a way through.",
      },
      {
        scene: "harbor",
        harborWork: 19,
        action: "Lift tide gate",
        cue: "Raise the gate for the supply boat.",
        speaker: "nell",
        line: "Lamp oil, warm blankets and a box of biscuits. I argued that all three were essential.",
        reply: "For once, the harbor is in complete agreement.",
      },
      {
        scene: "harbor",
        harborWork: 20,
        action: "Bring boat through",
        cue: "Guide Marigold through the gate to the marked berth.",
        speaker: "finn",
        line: "That’s the last load. I’m taking Wren out to collect the island post. Back before the weather, I promise.",
        reply: "Keep your radio on, Finn.",
        arrival: "Marigold",
      },
      {
        scene: "workshop",
        prop: "shutter",
        action: "Brace the shutters",
        cue: "Secure the workshop shutters against the wind.",
        speaker: "nell",
        line: "Best do the quiet jobs while it’s quiet. Once the wind starts, even a loose hinge sounds dramatic.",
        reply: "Let’s give it less to complain about.",
      },
      {
        scene: "workshop",
        prop: "oil",
        action: "Ready the reserve",
        cue: "Set aside a full oil reserve for the night watch.",
        speaker: "nell",
        line: "Reserve oil here. Spare gear in the drawer. You won’t have to search for either in the dark.",
        reply: "Full reservoir, clean wick, steady gears. I remembered.",
      },
      {
        scene: "cottage",
        prop: "chart",
        action: "Mark the night route",
        cue: "Mark the northern approach on the harbor chart.",
        speaker: "mara",
        line: "I’m going out to meet the fishing boats. If the south channel closes, we’ll need your two lights.",
        reply: "I’ll be at the lantern. Call me when you turn for home.",
      },
    ],
  },
  {
    title: "The night watch",
    weather: "storm",
    goal: "Keep the beacon burning as the weather closes in.",
    memory:
      "The turning gear failed in the storm. Elias used Nell’s spare and the reserve oil to bring the light back. Mara found North Point.",
    souvenir: "The spare brass gear",
    tasks: [
      {
        scene: "lantern",
        prop: "shutter",
        action: "Latch the storm screen",
        cue: "Secure the storm screen beside the lantern.",
        speaker: "mara",
        line: "South channel’s closed. I have the fleet with me. We’re turning north, Elias.",
        reply: "North Point is lit. Greyhaven is waiting.",
      },
      {
        scene: "lantern",
        prop: "handle",
        action: "Check the mechanism",
        cue: "Check the handle beneath the great lens.",
        speaker: "elias",
        line: "The beam’s stopped turning. The flame is steady, but the mechanism has gone silent.",
        reply: "Nell’s spare gear. In the workshop drawer.",
      },
      {
        scene: "workshop",
        prop: "gear",
        action: "Replace the worn gear",
        cue: "Fit Nell’s spare gear into the mechanism.",
        speaker: "nell",
        line: "I’m here on the radio. You know this machine now. Seat the little wheel, just as we did the first evening.",
        reply: "Smallest thing in the room. Biggest job in the bay.",
      },
      {
        scene: "workshop",
        prop: "handle",
        action: "Restart the drive",
        cue: "Wind the repaired mechanism until it turns again.",
        speaker: "nell",
        line: "There’s that tick. I can hear it through the radio. Well done, Keeper.",
        reply: "Now let’s get its light back onto the water.",
      },
      {
        scene: "lantern",
        prop: "oil",
        action: "Top up the lamp",
        cue: "Use the reserve oil to keep the beacon burning.",
        speaker: "finn",
        line: "Wren here. I can see North Point, but I lost the main light. Mara says to wait by the outer mark.",
        reply: "You did the right thing. Stay together. I’m coming back.",
      },
      {
        scene: "lantern",
        prop: "lamp",
        action: "Set the leading light",
        cue: "Turn the restored beam toward the northern approach.",
        speaker: "mara",
        line: "Greyhaven! There you are. Two lights, in line. We can see the way.",
        reply: "Then let’s bring everyone home.",
      },
    ],
  },
  {
    title: "The way home",
    weather: "night",
    goal: "Guide the fleet through the reef and the final night crossing.",
    memory:
      "Elias marked the reef and held the leading light. Blue Petrel and Dawn brought the last fishing crews into the harbor.",
    souvenir: "The fleet’s signal pennant",
    tasks: [
      {
        scene: "harbor",
        harborWork: 24,
        action: "Mark the reef",
        cue: "Mark the exposed reef for Blue Petrel.",
        speaker: "mara",
        line: "Blue Petrel is first. The reef’s showing now. Put a light on its edge, and I’ll take the fleet around it.",
        reply: "There. Keep the rocks to your port side.",
      },
      {
        scene: "harbor",
        harborWork: 25,
        action: "Lead around reef",
        cue: "Guide Blue Petrel around the reef to the inner marker.",
        speaker: "mara",
        line: "We’re in the old channel. The water’s calm behind the rocks. The old keeper knew exactly what he was doing.",
        reply: "He left us a good map. You’re sailing it beautifully.",
      },
      {
        scene: "harbor",
        harborWork: 26,
        action: "Secure mooring",
        cue: "Secure Blue Petrel at the marked mooring.",
        speaker: "nell",
        line: "Blue Petrel alongside! I’ve got her line. One crew home, and the kettle’s on.",
        reply: "Keep it warm. There are more coming.",
        arrival: "Blue Petrel",
      },
      {
        scene: "harbor",
        harborWork: 27,
        action: "Wake the beacon",
        cue: "Strengthen the beacon for Dawn’s night approach.",
        speaker: "finn",
        line: "Dawn is just ahead of Wren. Her radio’s out, but she can see your lamp. Give her a good clear signal.",
        reply: "I see her running light. Follow this one, Dawn.",
      },
      {
        scene: "harbor",
        harborWork: 28,
        action: "Light leading mark",
        cue: "Sweep the beam to the inner leading mark.",
        speaker: "mara",
        line: "Hold it there. Both lights are lined up. She’s turning toward the quay.",
        reply: "Nearly home now.",
      },
      {
        scene: "harbor",
        harborWork: 29,
        action: "Escort to quay",
        cue: "Guide Dawn into the marked berth.",
        speaker: "nell",
        line: "Dawn’s line is in my hand. Every fishing boat is counted. Finn says he has one last thing to deliver.",
        reply: "Of course he does.",
        arrival: "Dawn",
      },
    ],
  },
  {
    title: "A harbor of lights",
    weather: "golden",
    goal: "Welcome the last boat and reopen the harbor.",
    memory:
      "The last boat returned. The harbor thanked its new keeper, and the old letter found its answer. Greyhaven would keep both lights burning.",
    souvenir: "The keeper’s pennant",
    tasks: [
      {
        scene: "landing",
        prop: "rope",
        action: "Welcome Finn home",
        cue: "Take the postboat’s mooring line.",
        speaker: "finn",
        line: "Last delivery. It’s tea, actually. Nell said you owed her some. I thought the whole harbor might join you.",
        reply: "I think there’s room.",
      },
      {
        scene: "cottage",
        prop: "letter",
        action: "Finish the letter",
        cue: "Read the final page of the old keeper’s letter.",
        speaker: "elias",
        line: "‘A lighthouse belongs to the people looking for it. Keep both lights burning, and you will never keep watch alone.’",
        reply: "I understand now.",
      },
      {
        scene: "north",
        prop: "flag",
        action: "Raise the pennant",
        cue: "Raise Greyhaven’s pennant beside the restored beacon.",
        speaker: "nell",
        line: "Two working lights. One stubborn keeper. And a landing you can walk on without falling through.",
        reply: "We make a good crew.",
      },
      {
        scene: "harbor",
        harborWork: 21,
        action: "Hail the ferry",
        cue: "Signal the ferry to open the harbor’s morning crossing.",
        speaker: "mara",
        line: "Morning ferry’s here, and North Star is behind it. Ordinary boats on an ordinary morning. A wonderful sight.",
        reply: "Let’s give them a proper welcome.",
      },
      {
        scene: "harbor",
        harborWork: 22,
        action: "Mark the crossing",
        cue: "Light the channel marker for North Star.",
        speaker: "finn",
        line: "You know they’ve started calling you ‘our keeper’ down at the quay?",
        reply: "That sounds like a job I’d like to keep.",
      },
      {
        scene: "harbor",
        harborWork: 23,
        action: "Guide boat across",
        cue: "Guide North Star into the reopened harbor.",
        speaker: "mara",
        line: "All clear, Keeper. The harbor’s yours.",
        reply: "The harbor’s ours. Let’s keep the light.",
        arrival: "North Star",
      },
    ],
  },
];
export const keeperStoryLength = keeperChapters.reduce(
  (sum, chapter) => sum + chapter.tasks.length,
  0,
);

export function keeperStory(work: number) {
  const completed = Math.max(0, Math.floor(work));
  const epilogue = completed >= keeperStoryLength;
  const chapterIndex = Math.min(
    keeperChapters.length - 1,
    Math.floor(completed / 6),
  );
  const chapter = keeperChapters[chapterIndex];
  const past = keeperChapters.flatMap((c) => c.tasks).slice(0, completed);
  const arrived = past.filter((task) => task.arrival);
  const arrivals = arrived.length;
  const watchWork = Math.max(0, completed - keeperStoryLength);
  const passage = harborPassage(6 + Math.floor(watchWork / 3));
  const [action, cue] = passage.tasks[watchWork % 3];
  const step = epilogue ? watchWork % 3 : completed % 6;
  const task: KeeperTask = epilogue
    ? {
        scene: "harbor",
        harborWork: 30 + watchWork,
        action,
        cue,
        speaker: (["mara", "finn", "nell"] as const)[step],
        line:
          step === 0
            ? `${passage.ship} is coming in with ${passage.cargo}. ${completed === keeperStoryLength ? "You brought Greyhaven back to life. There will always be another boat to welcome." : "Another watch, another familiar light on the headland."}`
            : step === 1
              ? `The ${passage.title.toLowerCase()} needs your guiding light. Everyone knows to look for Greyhaven now.`
              : `The quay is ready for ${passage.ship}. Bring her alongside, Keeper.`,
        reply:
          step === 0
            ? "Then the next watch begins."
            : step === 1
              ? "Let’s show them the way."
              : "Welcome home.",
      }
    : chapter.tasks[step];
  const shipsHome = arrivals + Math.floor(watchWork / 3);
  const continued = Math.floor(watchWork / 3);
  const fleet = [
    ...arrived.map((task) => Math.floor((task.harborWork! - 12) / 3)),
    ...Array.from(
      { length: Math.min(4, continued) },
      (_, i) => 6 + continued - Math.min(4, continued) + i,
    ),
  ].slice(-4);
  return {
    ...task,
    chapter,
    chapterIndex,
    step,
    epilogue,
    title: epilogue ? "Keeper of Greyhaven" : chapter.title,
    goal: epilogue
      ? `Welcome ${passage.ship} and keep the harbor thriving.`
      : chapter.goal,
    built: Math.min(12, completed),
    shipsHome,
    fleet,
    completed,
    length: epilogue ? 3 : chapter.tasks.length,
  };
}
export type KeeperStory = ReturnType<typeof keeperStory>;

// This view describes the existing harbor approach. Narrative chapters can
// visit it in story order while saved progress remains a single task count.
export function keeperHarborState(work: number) {
  const built = Math.min(12, work);
  const shipsHome = Math.floor(Math.max(0, work - 12) / 3);
  const step = work % 3;
  const passage = harborPassage(shipsHome);
  const [action, cue, target] = passage.tasks[step];
  return { built, shipsHome, step, passage, action, cue, target };
}
/** Other completed games bring up to three supplies per outing. An earlier
 * starting balance is never counted again. */
export function keeperWork(
  records: Pick<PracticeRecord, "game" | "rewards">[],
) {
  return records.reduce(
    (sum, r) =>
      sum + (r.game === "keeper" ? r.rewards : Math.min(3, r.rewards)),
    0,
  );
}
