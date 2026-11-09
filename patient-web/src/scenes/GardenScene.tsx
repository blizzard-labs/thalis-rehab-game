import { useEffect, useRef, useState } from "react";
import { PlantGrowthModel } from "../garden/PlantGrowthModel";
import { GardenLandscape } from "../garden/GardenLandscape";
import type { SessionStats } from "../session/SessionStats";
import type { ConnectionState } from "../net/scoreClient";
import { CameraFeed } from "./CameraFeed";
import { KinematicOverlay } from "./KinematicOverlay";
import type { ScoreStore } from "../scoring/scoreStore";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

export function GardenScene({
  stats,
  engagementThreshold,
  store,
  conn = "connecting",
  paused = false,
  onEnd,
}: {
  stats: SessionStats;
  engagementThreshold: number;
  store: ScoreStore;
  conn?: ConnectionState;
  paused?: boolean;
  onEnd: () => void;
}) {
  const [growth, setGrowth] = useState(0);
  const [bloom, setBloom] = useState(false);
  const [score, setScore] = useState(0);
  const [engaged, setEngaged] = useState(false);

  const plant = useRef(new PlantGrowthModel());
  const lastTs = useRef<number | null>(null);

  useEffect(() => {
    lastTs.current = null;
    if (paused) return;
    let raf = 0;
    const tick = (ts: number) => {
      const dt = lastTs.current === null ? 0 : Math.min(.25, (ts - lastTs.current) / 1000);
      lastTs.current = ts;
      const latest = store.fresh();
      const s = latest ? latest.intentScore : 0;
      plant.current.update(s / 100, dt);
      const isEngaged = s >= engagementThreshold;
      stats.accumulate(dt, isEngaged);
      setGrowth(plant.current.currentGrowth);
      setBloom(plant.current.isBloom);
      setScore(s);
      setEngaged(isEngaged);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
    };
  }, [engagementThreshold, stats, store, paused]);

  const reduced = prefersReducedMotion();
  const tracking = store.fresh()?.joints?.poseValid === true;

  // --- derive the illustration from a single growth value ---
  const pct = Math.round(score);

  return (
    <main className={`scene scene--garden${reduced ? " reduced-motion" : ""}`}>
      <KinematicOverlay store={store} />
      <div className="garden-banner" data-engaged={engaged}>
        <span className="status-pill" data-testid="status-pill" data-engaged={engaged}>
          {engaged ? "Good focus — keep going" : "Keep imagining — it's growing"}
        </span>
      </div>

      <GardenLandscape growth={growth} bloom={bloom} meter={pct} label="Focus" camera={<CameraFeed recording />} />

      <div className="garden-footer">
        <button type="button" className="end-button" onClick={onEnd}>
          End session
        </button>
        <span className="conn-badge" data-state={conn}>{conn}</span>
        <span className="tracking-badge" data-testid="tracking-badge" data-tracking={tracking ? "on" : "off"}>
          {tracking ? "Tracking arm ✓" : "Move into frame"}
        </span>
      </div>
    </main>
  );
}
