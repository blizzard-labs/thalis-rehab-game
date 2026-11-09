import { useEffect, useRef, useState } from "react";
import { RomTrialModel } from "../reach/RomTrialModel";
import { StarField } from "../reach/StarField";
import { toScreen } from "../reach/starGeometry";
import type { SessionStats } from "../session/SessionStats";
import type { ConnectionState } from "../net/scoreClient";
import { CameraFeed } from "./CameraFeed";
import { KinematicOverlay } from "./KinematicOverlay";
import type { ScoreStore } from "../scoring/scoreStore";
import { config } from "../config";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

export function StarCatchScene({
  stats,
  engagementThreshold,
  affectedSide = config.patient.affectedSide,
  store,
  conn = "connecting",
  wristTargets,
  paused = false,
  onEnd,
}: {
  stats: SessionStats;
  engagementThreshold: number;
  affectedSide?: "left" | "right";
  store: ScoreStore;
  conn?: ConnectionState;
  wristTargets?: RomTrialModel["wristTargets"];
  paused?: boolean;
  onEnd: () => void;
}) {
  const model = useRef(new RomTrialModel(affectedSide));
  useEffect(() => { model.current.wristTargets = wristTargets ?? {}; }, [wristTargets]);
  const [reach, setReach] = useState(0);
  const [collected, setCollected] = useState(0);
  const [score, setScore] = useState(0);
  const [engaged, setEngaged] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [cue, setCue] = useState(model.current.current.label);
  const [cueDetail, setCueDetail] = useState(model.current.current.cue);
  const [phase, setPhase] = useState(model.current.phase);
  const lastTs = useRef<number | null>(null);
  const celebrateUntil = useRef(0);

  useEffect(() => {
    lastTs.current = null;
    if (paused) return;
    let raf = 0;
    const tick = (ts: number) => {
      const dt = lastTs.current === null ? 0 : Math.min(.25, (ts - lastTs.current) / 1000);
      lastTs.current = ts;
      const latest = store.fresh();
      const s = latest ? latest.intentScore : 0;
      const isEngaged = s >= engagementThreshold;
      model.current.update(latest, isEngaged, dt);
      stats.accumulate(dt, isEngaged);
      if (model.current.justCollected) {
        stats.incrementTrials();
        celebrateUntil.current = ts + 900; // ~0.9 s glow
      }
      setReach(model.current.reach);
      setCollected(model.current.collected);
      setScore(s);
      setEngaged(isEngaged);
      setCue(model.current.current.label);
      setCueDetail(model.current.current.cue);
      setPhase(model.current.phase);
      setCelebrate(ts < celebrateUntil.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
    };
  }, [engagementThreshold, stats, store, paused]);

  const reduced = prefersReducedMotion();
  const pct = Math.round(score);

  // Directional reach: the avatar arm is centered on the page and its wrist is
  // driven straight from the patient's MEASURED wrist offset (reach space:
  // +x toward the affected side, +y up). Two-bone IK bends the elbow to reach
  // that point. The goal star sits at the current trial's direction (up / side /
  // down), so the net physically overlaps the star at capture — no angle proxy.
  const j = store.fresh()?.joints;
  const tracking = j?.poseValid === true;
  const target = toScreen({
    x: (j?.wristDx ?? 0) * (affectedSide === "left" ? -1 : 1),
    y: -(j?.wristDy ?? 0),
  });
  const goalPt = toScreen(model.current.current.goal);
  return (
    <main className={`scene scene--stars${reduced ? " reduced-motion" : ""}`} data-testid="starcatch">
      <KinematicOverlay store={store} />
      <div className="stars-banner" data-engaged={engaged} data-phase={phase}>
        <div className="stars-banner__row">
          <span className="status-pill" data-testid="status-pill" data-engaged={engaged}>
            {engaged ? "Great reaching — keep going" : "Reach toward the star"}
          </span>
          <span className="star-count" data-testid="star-count" aria-label={`${collected} stars caught`}>
            ⭐ {collected}
          </span>
        </div>
        <span className="rom-cue-detail" data-testid="rom-cue-detail">{cueDetail}</span>
      </div>

      <StarField side={affectedSide} target={target} goalPt={goalPt} celebrate={celebrate}
        cue={cue} reach={reach} pct={pct} camera={<CameraFeed recording />} />

      <div className="stars-footer">
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
