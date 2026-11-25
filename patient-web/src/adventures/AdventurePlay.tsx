import { type ReactNode, type RefObject } from "react";
import { gameDetails, gameNames } from "../practice/catalog";
import {
  sourceNames,
  type PracticeRound,
  type Side,
} from "../practice/session";
import type { CameraAim } from "../practice/StarPlay";
import { crateSize, harvestAt, orchardStop } from "./orchardTrail";
import { trailSeed } from "./trail";
import { OrchardArt } from "./Orchard";
import { RiverArt } from "./River";
import { riverLanding, strokesPerBend } from "./riverJourney";
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
  reducedMotion,
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
  reducedMotion: boolean;
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
    ? "Pull down or press Row. Angle a stroke left for the marsh or right for the narrows."
    : round.needsRest
      ? "Ease back to rest between strokes."
      : round.source === "eeg"
        ? "Imagine pulling the oar, then relax."
        : "Pull toward your calibrated position, then ease back.";
  const fruit = game === "fruit";
  const seed = trailSeed(round.record.id);
  const leg = Math.floor(rewards / crateSize),
    packed = rewards % crateSize;
  const forks = round.record.orchardForks ?? [];
  const stop = orchardStop(seed, leg, forks.includes(leg));
  const bend = Math.floor(rewards / strokesPerBend);
  const strokes = rewards % strokesPerBend;
  const current = riverLanding(
    seed,
    round.record.landfalls?.find((entry) => entry.bend === bend)?.channel ??
      channel,
    bend,
  );
  const next = riverLanding(seed, channel, bend + 1);
  const selectedChannel = round.record.nextChannel ?? channel;
  const distance = reducedMotion ? rewards : round.travelDistance;
  let cue = riverCue;
  if (fruit) {
    if (round.carryingFruit)
      cue = manual
        ? "Place the fruit in the basket."
        : "Return to your resting position and relax to basket the fruit.";
    else if (round.catchProgress > 0) cue = "Hold here to pick the fruit.";
    else
      cue = manual
        ? `Tap the ripe ${harvestAt(seed, rewards, forks)} or drag it to the basket.`
        : round.source === "eeg"
          ? "Imagine reaching for the ripe fruit, then relax."
          : "Guide your hand to the ripe fruit and hold briefly.";
  }
  if (round.celebrating) {
    if (game === "river" && strokes === 0)
      cue = `Logged at ${current.name} · ${current.discovery}`;
    if (fruit && !round.carryingFruit && packed === 0) {
      const delivered = orchardStop(seed, leg - 1, forks.includes(leg - 1));
      cue = `${delivered.name} stocked with fresh ${delivered.product}!`;
    }
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
      {fruit ? (
        <div className="adventure-scene orchard-stage">
          <OrchardArt
            count={rewards}
            {...{ seed, distance, forks }}
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
          <div
            className="trail-sign"
            aria-label={`Delivery ${leg + 1} to the ${stop.name}, ${packed} of ${crateSize} fruit packed`}
          >
            <small>Delivery {leg + 1}</small>
            <strong>{stop.name}</strong>
            <span className="trail-meter" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <i key={i} className={i < packed ? "filled" : ""} />
              ))}
            </span>
            <span>
              {packed} of {crateSize} packed
            </span>
          </div>
        </div>
      ) : (
        <div className="adventure-scene river-stage">
          <RiverArt
            distance={distance}
            strokes={rewards}
            seed={seed}
            log={round.record.landfalls}
            nextChannel={selectedChannel}
            phase={phase}
            side={side}
            paired={round.record.rowing === "paired"}
            channel={channel}
            onPull={
              manual && !round.paused
                ? (route) => {
                    if (route) round.chooseChannel(route);
                    pull();
                  }
                : undefined
            }
          />
          <div className="trail-sign river-sign">
            <small>Bend {bend + 1} · downstream</small>
            <strong>{next.name}</strong>
            <span className="trail-meter" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <i key={i} className={i < strokes ? "filled" : ""} />
              ))}
            </span>
            <span>
              {strokesPerBend - strokes}{" "}
              {strokesPerBend - strokes === 1 ? "stroke" : "strokes"} to
              landfall
            </span>
          </div>
          {bend > 0 && (
            <div
              className="river-log"
              aria-label={`River log, ${bend} ${bend === 1 ? "landing" : "landings"}`}
            >
              <strong>River log · {bend}</strong>
              <span>
                {(round.record.landfalls?.length
                  ? round.record.landfalls
                  : [{ bend, channel }]
                )
                  .map(
                    (entry) =>
                      riverLanding(seed, entry.channel, entry.bend).discovery,
                  )
                  .join(" · ")}
              </span>
            </div>
          )}
        </div>
      )}
      <footer className="game-dock adventure-dock">
        {camera && <div className="adventure-camera">{camera}</div>}
        {fruit && (
          <fieldset
            className="route-choices"
            disabled={round.paused || packed > 0 || round.carryingFruit}
          >
            <legend>Deliver to</legend>
            {[false, true].map((alternate) => (
              <button
                key={Number(alternate)}
                aria-pressed={forks.includes(leg) === alternate}
                onClick={() => {
                  const recent = forks.filter((n) => n === leg - 1);
                  round.record.orchardForks = alternate
                    ? [...recent, leg]
                    : recent;
                  redraw();
                }}
              >
                {orchardStop(seed, leg, alternate).name}
              </button>
            ))}
          </fieldset>
        )}
        {game === "river" && (
          <fieldset className="route-choices" disabled={round.paused}>
            <legend>
              {strokes ? "At the next fork" : "Choose your channel"}
            </legend>
            {(["reed", "stone"] as const).map((c) => (
              <button
                key={c}
                aria-pressed={selectedChannel === c}
                onClick={() => {
                  round.chooseChannel(c);
                  redraw();
                }}
              >
                {c === "reed" ? "Reed marsh" : "Stone narrows"}
              </button>
            ))}
          </fieldset>
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
              <span aria-hidden="true">
                {fruit ? (round.carryingFruit ? "🧺 " : "🍎 ") : "🚣 "}
              </span>
              {fruit
                ? round.carryingFruit
                  ? "Place in basket"
                  : "Pick"
                : "Row"}
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
