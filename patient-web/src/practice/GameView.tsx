import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
}: {
  round: PracticeRound;
  onEnd: () => void;
  observation?: () => number | null;
  status?: string;
  lockedPause?: boolean;
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
      ? "Press Water four times to open a flower."
      : "Press Catch when the ring reaches the filled star."
    : "Reach to your comfortable position, then return to rest.";
  if (!manual && round.needsRest)
    instruction = "Return to rest before the next action.";
  else if (round.source === "eeg")
    instruction = "Imagine moving your selected hand, then relax.";
  else if (round.source === "blended")
    instruction = "Imagine moving your hand as you reach, then relax.";
  return (
    <section className="practice-panel play-panel">
      <header className="play-title">
        <h1>{gameNames[round.record.game]}</h1>
        <span>{duration(round.record.elapsed)}</span>
      </header>
      <div className="play-stage">
        {garden ? (
          <Garden
            growth={
              0.2 +
              round.progress * 0.8 +
              (round.record.rewards && !round.progress ? 0.8 : 0)
            }
            bloom={round.record.rewards > 0 && !round.progress}
          />
        ) : (
          <NightSky
            target={round.target}
            scan={manual ? round.scanSlot : undefined}
          />
        )}
      </div>
      <div className="play-controls">
        <div>
          <p aria-live="polite">
            <strong>{round.paused ? "Paused" : instruction}</strong>
          </p>
          <p>
            {sourceNames[round.source]} · {round.record.rewards}{" "}
            {garden
              ? round.record.rewards === 1
                ? "bloom"
                : "blooms"
              : round.record.rewards === 1
                ? "star"
                : "stars"}
          </p>
          {!garden && manual && (
            <span className="sr-only" aria-live="polite">
              {round.scanSlot === round.target
                ? "Star selected. Press Catch."
                : "Scanning."}
            </span>
          )}
          {!manual && (
            <label className="effort-meter">
              Current input <meter min={0} max={1} value={round.level} />
            </label>
          )}
          {status && <p role="status">{status}</p>}
        </div>
        <div className="button-row">
          {manual && (
            <button
              ref={action}
              className="primary"
              disabled={round.paused}
              onKeyDown={(e) => {
                if (e.repeat) e.preventDefault();
              }}
              onClick={() => {
                round.press();
                redraw((n) => n + 1);
              }}
            >
              {garden ? "Water" : "Catch"}
            </button>
          )}
          <button
            disabled={lockedPause}
            onClick={() => {
              round.setPaused(!round.paused);
              redraw((n) => n + 1);
            }}
          >
            {round.paused ? "Resume" : "Pause"}
          </button>
          <button onClick={onEnd}>End session</button>
        </div>
      </div>
    </section>
  );
}
