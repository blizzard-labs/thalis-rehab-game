import type { ReactNode, RefObject } from "react";
import { gameDetails, gameNames } from "../practice/catalog";
import {
  sourceNames,
  type PracticeRound,
  type Side,
} from "../practice/session";
import { RiverArt, landingName } from "./River";
import "./adventures.css";

export function AdventurePlay({
  round,
  side,
  sourceLabel,
  status,
  controls,
  action,
  redraw,
  onEnd,
  lockedPause,
  clock,
}: {
  round: PracticeRound;
  side: Side;
  sourceLabel?: string;
  status?: string;
  controls?: ReactNode;
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
  const cue = manual
    ? "Pull down on the boat or press Row to take a stroke."
    : round.needsRest
      ? "Ease back to rest between strokes."
      : round.source === "eeg"
        ? "Imagine pulling the oar, then relax."
        : "Pull toward your calibrated position, then ease back.";
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
      <div className="adventure-scene river-stage">
        <RiverArt
          strokes={rewards}
          phase={phase}
          side={side}
          paired={round.record.rowing === "paired"}
          channel={channel}
          onPull={manual ? pull : undefined}
        />
        <span className="scene-caption">
          {landingName(channel, rewards)} · {4 - (rewards % 4)} strokes to next
          landing
        </span>
      </div>
      <footer className="game-dock adventure-dock">
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
              Row
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
