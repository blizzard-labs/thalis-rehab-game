import { useEffect, useRef, useState } from "react";
import { PlantGrowthModel } from "../garden/PlantGrowthModel";
import { Flower } from "../garden/Flower";
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
  onEnd,
}: {
  stats: SessionStats;
  engagementThreshold: number;
  store: ScoreStore;
  conn?: ConnectionState;
  onEnd: () => void;
}) {
  const [growth, setGrowth] = useState(0);
  const [bloom, setBloom] = useState(false);
  const [score, setScore] = useState(0);
  const [engaged, setEngaged] = useState(false);

  const plant = useRef(new PlantGrowthModel());
  const lastTs = useRef<number | null>(null);

  useEffect(() => {
    let raf = 0;
    const tick = (ts: number) => {
      const dt = lastTs.current === null ? 0 : (ts - lastTs.current) / 1000;
      lastTs.current = ts;
      const latest = store.latest();
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
  }, [engagementThreshold, stats, store]);

  const reduced = prefersReducedMotion();
  const tracking = store.latest()?.joints?.poseValid === true;

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

      <div className="garden-row">
        {/* environment fills the whole page (CSS): sky gradient on the scene,
            a soft sun, and a full-width soil mound. The plant SVG floats on top. */}
        <div className="garden-sun" aria-hidden="true" />
        <div className="garden-ground" aria-hidden="true" />

        {/* Live camera sidecar — same shape/style as calibration, floating on
            the left of the scene, vertically centered against the viewport. */}
        <div className="garden-camera">
          <CameraFeed recording />
        </div>

        <div className="garden-stage">
          <Flower growth={growth} bloom={bloom} />
        </div>

        {/* effort meter — large, labelled, never punitive */}
        <div className="focus-meter">
          <span className="focus-meter__label">Focus</span>
          <div
            className="intent-bar"
            data-testid="intent-bar"
            role="progressbar"
            aria-label="Focus level"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            <div className="intent-bar-fill" style={{ height: `${pct}%` }} />
          </div>
          <span className="focus-meter__value">{pct}</span>
        </div>
      </div>

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
