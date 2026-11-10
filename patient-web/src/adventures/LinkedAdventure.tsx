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
}: {
  game: Game;
  side: Side;
  paused: boolean;
  store: ScoreStore;
  stats: SessionStats;
  onEnd: () => void;
}) {
  const [round] = useState(() => new PracticeRound(game, "eeg", true));
  const counted = useRef(0);
  useEffect(() => {
    round.setPaused(paused);
  }, [round, paused]);
  function updateStats(seconds: number, level: number | null) {
    stats.accumulate(
      seconds,
      level !== null && level * 100 >= config.engagementThreshold,
    );
    if (counted.current < round.record.rewards) {
      stats.incrementTrials();
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
        onTick={updateStats}
        onEnd={onEnd}
        observation={() => {
          const frame = store.fresh();
          return {
            level: frame ? frame.intentScore / 100 : null,
            aim: null,
            onTarget: true,
            cameraStar: null,
          };
        }}
      />
    </div>
  );
}
