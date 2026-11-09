import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { GardenPlay, SeedTray } from "./GardenPlay";
import { CameraFeed } from "../scenes/CameraFeed";
import "./gameplay.css";
import { Flower } from "../garden/Flower";
import { gameNames, PracticeRound, sourceNames } from "./session";

export function duration(seconds: number) {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export function NightSky({ target, scan }: { target: number; scan?: number }) {
  return (
    <div className="night-sky" aria-label={`Star at position ${target + 1}`}>
      {[0, 1, 2].map((slot) => (
        <div
          key={slot}
          className={`sky-slot slot-${slot}`}
          data-scan={scan === slot}
        >
          <span>{slot === target ? "★" : "✧"}</span>
        </div>
      ))}
    </div>
  );
}

export function Garden({ growth, bloom }: { growth: number; bloom: boolean }) {
  return (
    <div className="plant-scene">
      <div className="garden-sun" />
      <div className="plant-bed" />
      <Flower growth={growth} bloom={bloom} />
    </div>
  );
}

export function Play({
  round,
  onEnd,
  observation = () => null,
  status,
  lockedPause = false,
  stream,
}: {
  round: PracticeRound;
  onEnd: () => void;
  observation?: () => number | null;
  status?: string;
  lockedPause?: boolean;
  stream?: MediaStream | null;
}) {
  const [, redraw] = useState(0);
  const finish = useRef(onEnd);
  finish.current = onEnd;
  const observe = useRef(observation);
  observe.current = observation;
  const action = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      round.tick((now - last) / 1000, observe.current());
      last = now;
      if (round.scheduleFinished) {
        clearInterval(timer);
        finish.current();
        return;
      }
      redraw((n) => n + 1);
    }, 80);
    const visibility = () => {
      if (document.hidden) round.setPaused(true);
    };
    document.addEventListener("visibilitychange", visibility);
    action.current?.focus();
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [round]);
  useLayoutEffect(() => {
    if (round.inputSampleMs === null) return;
    const id = requestAnimationFrame(() => round.recordPaint(Date.now()));
    return () => cancelAnimationFrame(id);
  });
  const manual = round.source === "button";
  const garden = round.record.game === "garden";
  let instruction = manual
    ? garden
      ? round.record.rewards && !round.progress
        ? "A bee found your flower! Water to start the next one."
        : "Water your seed and watch it grow."
      : "Press Catch when the ring reaches the filled star."
    : "Reach to your comfortable position, then return to rest.";
  if (!manual && round.needsRest)
    instruction = "Return to rest before the next action.";
  else if (round.source === "eeg")
    instruction = "Imagine moving your selected hand, then relax.";
  else if (round.source === "blended")
    instruction = "Imagine moving your hand as you reach, then relax.";
  const redrawRound = () => redraw((n) => n + 1);
  const press = () => { round.press(); redrawRound(); };
  const rewards = round.record.rewards;
  const noun = garden ? "bloom" : "star";
  const count = `${rewards} ${noun}${rewards === 1 ? "" : "s"}`;
  const camera = stream && <CameraFeed recording sourceStream={stream} />;
  return (
    <section className={`live-game scene scene--${garden ? "garden" : "stars"}`} data-paused={round.paused}>
      <header className="game-heading">
        <div><h1>{gameNames[round.record.game]}</h1><span>{sourceNames[round.source]} · {duration(round.record.elapsed)}</span></div>
        <strong className="game-score" aria-live="polite">{count}</strong>
      </header>
      <p className="game-cue" role="status">{round.paused ? "Paused" : instruction}</p>
      {garden ? (
        <GardenPlay round={round} water={press} camera={camera} />
      ) : (
        <div className="play-stage"><NightSky target={round.target} scan={manual ? round.scanSlot : undefined} /></div>
      )}
      <footer className="game-dock">
        {garden && <SeedTray round={round} select={redrawRound} />}
        {status && <p role="status">{status}</p>}
        {!garden && manual && (
          <span className="sr-only" aria-live="polite">
            {round.scanSlot === round.target ? "Star selected. Press Catch." : "Scanning."}
          </span>
        )}
        <div className="button-row">
          {manual && (
            <button ref={action} className="primary" disabled={round.paused}
              onKeyDown={(e) => { if (e.repeat) e.preventDefault(); }} onClick={press}>
              {garden ? "Water" : "Catch"}
            </button>
          )}
          <button disabled={lockedPause} onClick={() => { round.setPaused(!round.paused); redrawRound(); }}>
            {round.paused ? "Resume" : "Pause"}
          </button>
          <button onClick={onEnd}>End session</button>
        </div>
      </footer>
    </section>
  );
}
