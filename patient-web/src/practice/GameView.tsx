import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { scanningWrist, withinNet } from "../reach/starGeometry";
import { constellationAt } from "./constellations";
import { StarPlay, StarChart, type CameraAim } from "./StarPlay";
import type { ReactNode } from "react";
import type { CameraStarFrame, Side } from "./session";
import { BloomGoal } from "./BloomGoal";
import { beeCount, GardenPlay, SeedTray } from "./GardenPlay";
import { CameraFeed } from "../scenes/CameraFeed";
import "./gameplay.css";
import { Flower } from "../garden/Flower";
import { gameNames, PracticeRound, sourceNames } from "./session";

export function duration(seconds: number) {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export function NightSky({ target }: { target: number }) {
  return (
    <div className="night-sky" aria-label={`Star at position ${target + 1}`}>
      {[0, 1, 2].map((slot) => (
        <div key={slot} className={`sky-slot slot-${slot}`}>
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

function gameCue(round: PracticeRound) {
  if (round.paused) return "Paused";
  if (round.record.game === "stars" && round.celebrating)
    return "Caught! A new light on your star chart.";
  if (
    round.record.game === "stars" &&
    (round.source === "camera" || round.source === "blended")
  ) {
    if (round.catchProgress > 0) return "Hold here while the ring fills.";
    if (
      round.source === "blended" &&
      round.record.rewards === 0 &&
      round.needsRest
    )
      return "Relax briefly to ready the EEG for your first catch.";
    if (round.source === "blended")
      return round.needsRest
        ? "Relax briefly and move the net away from the last catch."
        : "Imagine moving your hand as you guide the net to the star.";
    if (round.record.rewards > 0 && round.needsRest)
      return "Move the net away from the last catch toward the new star.";
    return "Guide the net to the star and hold briefly.";
  }
  if (round.source !== "button") {
    if (round.needsRest) return "Return to rest before the next action.";
    if (round.source === "eeg")
      return "Imagine moving your selected hand, then relax.";
    if (round.source === "blended")
      return "Imagine moving your hand as you reach, then relax.";
    return "Reach to your comfortable position, then return to rest.";
  }
  if (round.record.game === "garden") {
    if (round.record.rewards === 0 || round.progress > 0)
      return "Water your seed and watch it grow.";
    if (round.flowerBed.goal === round.record.rewards)
      return "You reached your bloom goal! Keep planting if you like.";
    if (round.record.rewards % 5 === 0 && round.record.rewards <= 25)
      return "Another bee has found your meadow!";
    return "Your flower joined the meadow. Water to grow another.";
  }
  const event = round.record.events[round.record.events.length - 1];
  if (event?.kind === "action" && round.record.elapsed - event.seconds < 0.85)
    return "Just missed. Aim the hoop over the golden star.";
  return "Tap or drag to the star, or press Catch as the net passes. Arrow keys steer.";
}

export function Play({
  round,
  onEnd,
  observation,
  side,
  status,
  lockedPause = false,
  children,
  stream,
}: {
  round: PracticeRound;
  onEnd: () => void;
  side: Side;
  observation: () => {
    level: number | null;
    aim: CameraAim | null;
    onTarget: boolean;
    cameraStar: CameraStarFrame | null;
  };
  status?: string;
  lockedPause?: boolean;
  children?: ReactNode;
  stream?: MediaStream | null;
}) {
  const [, redraw] = useState(0);
  const [beeCall, setBeeCall] = useState<number | null>(null);
  const finish = useRef(onEnd);
  finish.current = onEnd;
  const observe = useRef(observation);
  observe.current = observation;
  const aim = useRef<CameraAim | null>(null);
  const action = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      if (!round.paused) {
        const observation = observe.current();
        aim.current = observation.aim;
        round.tick(
          (now - last) / 1000,
          observation.level,
          observation.onTarget &&
            (round.record.game !== "stars" || !round.celebrating),
          observation.cameraStar,
        );
      }
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
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [round]);
  useEffect(() => {
    action.current?.focus();
  }, [round, round.source]);
  useLayoutEffect(() => {
    if (round.inputSampleMs === null) return;
    const id = requestAnimationFrame(() => round.recordPaint(Date.now()));
    return () => cancelAnimationFrame(id);
  });
  const manual = round.source === "button";
  const garden = round.record.game === "garden";
  const reduced =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  const layout = useMemo(
    () => constellationAt(round.record.id, round.starIndex, side),
    [round.record.id, round.starIndex, side],
  );
  const scan = scanningWrist(round.scanning, round.easy, layout.stops, reduced);
  const aligned = withinNet(scan, layout.goal);
  const redrawRound = () => redraw((n) => n + 1);
  const press = () => {
    if (!garden && round.celebrating) return;
    round.press(aligned);
    redrawRound();
  };
  const rewards = round.record.rewards;
  const called =
    beeCall !== null &&
    round.record.elapsed >= beeCall &&
    round.record.elapsed - beeCall < 3;
  const noun = garden ? "bloom" : "star";
  const count = `${rewards} ${noun}${rewards === 1 ? "" : "s"}`;
  const camera = stream && <CameraFeed recording sourceStream={stream} />;
  return (
    <section
      className={`live-game scene scene--${garden ? "garden" : "stars"}`}
      data-paused={round.paused}
    >
      <header className="game-heading">
        <div>
          <h1>{gameNames[round.record.game]}</h1>
          <span>
            {sourceNames[round.source]} · {duration(round.record.elapsed)}
          </span>
        </div>
        <div className="game-totals">
          <strong className="game-score" aria-live="polite">
            {count}
          </strong>
          {garden && <BloomGoal round={round} redraw={redrawRound} />}
        </div>
      </header>
      <p className="game-cue" role="status">
        {gameCue(round)}
      </p>
      {garden ? (
        <GardenPlay
          round={round}
          water={press}
          camera={camera}
          called={called}
        />
      ) : (
        <StarPlay
          round={round}
          side={side}
          camera={camera}
          aim={
            round.source === "camera" || round.source === "blended"
              ? aim.current
              : null
          }
          layout={layout}
          scan={scan}
          redraw={redrawRound}
        />
      )}
      <footer className="game-dock">
        {garden ? (
          <SeedTray round={round} select={redrawRound} />
        ) : (
          <StarChart
            layout={layout}
            lit={layout.index + Number(round.celebrating)}
          />
        )}
        {status && <p role="status">{status}</p>}
        {!garden && manual && (
          <span className="sr-only" aria-live="polite">
            {!round.paused && !round.celebrating && aligned
              ? "Star selected. Press Catch."
              : "Scanning."}
          </span>
        )}
        <div className="button-row">
          {manual && (
            <button
              ref={action}
              className="primary"
              disabled={round.paused}
              onKeyDown={(e) => {
                if (!garden && e.key.startsWith("Arrow")) {
                  e.preventDefault();
                  if (!round.celebrating)
                    round.moveScan(
                      ["ArrowLeft", "ArrowUp"].includes(e.key) ? -1 : 1,
                    );
                  redrawRound();
                } else if (e.repeat) e.preventDefault();
              }}
              onClick={press}
            >
              {garden ? "Water" : "Catch"}
            </button>
          )}
          {garden && rewards > 0 && (
            <button
              disabled={round.paused || called}
              onClick={() => setBeeCall(round.record.elapsed)}
            >
              {called
                ? "Bees visiting"
                : beeCount(rewards) === 1
                  ? "Call bee"
                  : "Call bees"}
            </button>
          )}
          <button
            disabled={lockedPause}
            onClick={() => {
              round.setPaused(!round.paused);
              redrawRound();
            }}
          >
            {round.paused ? "Resume" : "Pause"}
          </button>
          <button onClick={onEnd}>End session</button>
        </div>
        {children}
      </footer>
    </section>
  );
}
