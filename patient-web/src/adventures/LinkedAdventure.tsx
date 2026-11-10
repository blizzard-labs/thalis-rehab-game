import { useEffect, useRef, useState } from "react";
import { config } from "../config";
import { Play } from "../practice/GameView";
import { PracticeRound, type Side, type Game } from "../practice/session";
import type { ScoreStore } from "../scoring/scoreStore";
import type { SessionStats } from "../session/SessionStats";
import "../practice/practice.css";

export function LinkedAdventure({
  game,
  side,
  paused,
  store,
  stats,
  onEnd,
  harborBase,
  saveKeeper,
  keeperError,
}: {
  game: Game;
  side: Side;
  paused: boolean;
  store: ScoreStore;
  stats: SessionStats;
  onEnd: () => void;
  harborBase?: number;
  saveKeeper: (total: number) => void;
  keeperError: string;
}) {
  const [round] = useState(() => {
    const r = new PracticeRound(game, "eeg", true);
    if (game === "keeper") r.record.harborBase = harborBase ?? 0;
    return r;
  });
  const counted = useRef(0);
  const wasResting = useRef(false);
  useEffect(() => {
    if (paused) {
      wasResting.current = round.paused;
      round.setPaused(true);
    } else if (!wasResting.current) round.setPaused(false);
  }, [round, paused]);
  function updateStats(seconds: number, level: number | null) {
    stats.accumulate(
      seconds,
      level !== null && level * 100 >= config.engagementThreshold,
    );
    if (counted.current < round.record.rewards) {
      stats.incrementTrials();
      if (game === "keeper" && harborBase !== undefined)
        saveKeeper((round.record.harborBase ?? 0) + round.record.rewards);
      counted.current = round.record.rewards;
    }
  }
  return (
    <div className="practice-app">
      <Play
        round={round}
        side={side}
        lockedPause={paused}
        sourceLabel="Clinician signal"
        status={
          game === "keeper"
            ? keeperError ||
              (harborBase === undefined
                ? "Story progress is available for this visit."
                : undefined)
            : undefined
        }
        onTick={updateStats}
        onEnd={onEnd}
        observation={() => {
          const frame = store.fresh();
          return {
            level: frame ? frame.intentScore / 100 : null,
            aim: null,
            onTarget: true,
            cameraHold: null,
          };
        }}
      >
        {game === "keeper" && keeperError && (
          <button
            onClick={() =>
              saveKeeper((round.record.harborBase ?? 0) + round.record.rewards)
            }
          >
            Retry saving story
          </button>
        )}
      </Play>
    </div>
  );
}
