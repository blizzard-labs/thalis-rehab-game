import type { ReactNode, RefObject } from "react";
import { gameDetails, gameNames } from "../practice/catalog";
import {
  sourceNames,
  type PracticeRound,
  type Side,
} from "../practice/session";
import type { CameraAim } from "../practice/StarPlay";
import { LighthouseArt } from "./Lighthouse";
import { keeperStory } from "./keeperStory";
import { OrchardArt, fruitName } from "./Orchard";
import { RiverArt, landingName } from "./River";
import "./adventures.css";

export function AdventurePlay({
  round,
  side,
  sourceLabel,
  aim,
  status,
  controls,
  camera,
  action,
  redraw,
  onEnd,
  lockedPause,
  clock,
}: {
  round: PracticeRound;
  side: Side;
  sourceLabel?: string;
  aim: CameraAim | null;
  status?: string;
  controls?: ReactNode;
  camera?: ReactNode;
  action: RefObject<HTMLButtonElement>;
  redraw: () => void;
  onEnd: () => void;
  lockedPause: boolean;
  clock: string;
}) {
  const { game, rewards } = round.record;
  const manual = round.source === "button",
    channel = round.record.channel ?? "reed";
  const phase = manual ? round.strokePhase : round.level;
  const pull = () => {
    if (manual && !round.paused) {
      round.press(true);
      redraw();
    }
  };
  const riverCue = manual
    ? "Pull down on the boat or press Row to take a stroke."
    : round.needsRest
      ? "Ease back to rest between strokes."
      : round.source === "eeg"
        ? "Imagine pulling the oar, then relax."
        : "Pull toward your calibrated position, then ease back.";
  const fruit = game === "fruit";
  let cue = riverCue;
  if (fruit) {
    if (round.carryingFruit)
      cue = manual
        ? "Place the fruit in the basket."
        : "Return to your resting position and relax to basket the fruit.";
    else if (round.catchProgress > 0) cue = "Hold here to pick the fruit.";
    else
      cue = manual
        ? `Pick the ripe ${fruitName(rewards)} with the ring.`
        : round.source === "eeg"
          ? "Imagine reaching for the ripe fruit, then relax."
          : "Guide your hand to the ripe fruit and hold briefly.";
  }
  const keeper = game === "keeper";
  const work = (round.record.harborBase ?? 0) + rewards;
  const story = keeperStory(work);
  if (keeper)
    cue = manual
      ? story.cue
      : round.needsRest
        ? "Relax before the next task."
        : round.source === "eeg"
          ? "Imagine moving your hand to help the keeper."
          : "Reach to help the keeper, then rest.";
  if (round.celebrating) {
    if (game === "river" && rewards % 4 === 0)
      cue = `Landfall at ${landingName(channel, rewards)}!`;
    if (fruit && !round.carryingFruit && rewards % 6 === 0)
      cue = `Harvest basket ${rewards / 6} is full!`;
    if (keeper && work > 12 && work % 3 === 0)
      cue = `${keeperStory(work - 1).ship} is safely home.`;
  }
  return (
    <section className="live-game adventure" data-paused={round.paused}>
      <header className="game-heading">
        <div>
          <h1>{gameNames[game]}</h1>
          <span>
            {sourceLabel ?? sourceNames[round.source]} · {clock}
          </span>
        </div>
        <strong className="game-score" aria-live="polite">
          {rewards}{" "}
          {rewards === 1 ? gameDetails[game].unit : gameDetails[game].units}
        </strong>
      </header>
      <p className="game-cue" role="status">
        {round.paused ? "Paused" : cue}
      </p>
      {keeper ? (
        <div className="adventure-scene keeper-stage">
          <LighthouseArt
            work={work}
            effort={phase}
            onWork={manual && !round.paused ? pull : undefined}
          />
          <span className="scene-caption">
            {story.title} · {story.step + 1} of 3
          </span>
        </div>
      ) : fruit ? (
        <div className="adventure-scene orchard-stage">
          <OrchardArt
            count={rewards}
            held={round.carryingFruit}
            side={side}
            aim={aim}
            effort={round.effortReach}
            hold={round.catchProgress}
            onPick={
              manual && !round.paused && !round.carryingFruit ? pull : undefined
            }
            onDeposit={
              manual && !round.paused && round.carryingFruit ? pull : undefined
            }
          />
          <span className="scene-caption">
            Basket {1 + Math.floor(rewards / 6)} · {rewards % 6} of 6 fruit
          </span>
        </div>
      ) : (
        <div className="adventure-scene river-stage">
          <RiverArt
            distance={round.rowDistance}
            strokes={rewards}
            phase={phase}
            side={side}
            paired={round.record.rowing === "paired"}
            channel={channel}
            onPull={manual ? pull : undefined}
          />
          <span className="scene-caption">
            {landingName(channel, rewards)} · {4 - (rewards % 4)} strokes to
            next landing
          </span>
        </div>
      )}
      <footer className="game-dock adventure-dock">
        {camera && <div className="adventure-camera">{camera}</div>}
        {game === "river" && (
          <fieldset className="route-choices" disabled={round.paused}>
            <legend>Choose your channel</legend>
            {(["reed", "stone"] as const).map((c) => (
              <button
                key={c}
                aria-pressed={channel === c}
                onClick={() => {
                  round.record.channel = c;
                  redraw();
                }}
              >
                {c === "reed" ? "Reed marsh" : "Stone narrows"}
              </button>
            ))}
          </fieldset>
        )}
        {keeper && (
          <div className="keeper-log" aria-live="polite">
            <strong>Keeper’s log</strong> · {story.built}/12 repairs ·{" "}
            {story.shipsHome} {story.shipsHome === 1 ? "boat" : "boats"} home
          </div>
        )}
        <div className="button-row">
          {manual && (
            <button
              ref={action}
              className="primary"
              disabled={round.paused}
              onKeyDown={(e) => {
                if (e.repeat) e.preventDefault();
              }}
              onClick={pull}
            >
              {!keeper && (
                <span aria-hidden="true">
                  {fruit ? (round.carryingFruit ? "🧺 " : "🍎 ") : "🚣 "}
                </span>
              )}
              {keeper ? (
                <>
                  <span aria-hidden="true">{story.icon} </span>
                  {story.action}
                </>
              ) : fruit ? (
                round.carryingFruit ? (
                  "Place in basket"
                ) : (
                  "Pick"
                )
              ) : (
                "Row"
              )}
            </button>
          )}
          <button
            disabled={lockedPause}
            onClick={() => {
              round.setPaused(!round.paused);
              redraw();
            }}
          >
            {round.paused ? "Resume" : "Pause"}
          </button>
          <button onClick={onEnd}>End session</button>
        </div>
        {status && <p role="status">{status}</p>}
        {controls}
      </footer>
    </section>
  );
}
