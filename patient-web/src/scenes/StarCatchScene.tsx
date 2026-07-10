import { useEffect, useRef, useState } from "react";
import { RomTrialModel, type JointId } from "../reach/RomTrialModel";
import { fkArm } from "../reach/armKinematics";
import type { SessionStats } from "../session/SessionStats";
import type { ConnectionState } from "../net/scoreClient";
import { CameraFeed } from "./CameraFeed";
import { KinematicOverlay } from "./KinematicOverlay";
import type { ScoreStore } from "../scoring/scoreStore";
import { config } from "../config";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

// SVG scene geometry (viewBox 0 0 480 600). The arm is anchored at the shoulder
// on the patient's AFFECTED side; a two-bone forward-kinematics rig mirrors the
// patient's real measured pose (shoulder elevation + elbow angle), so the avatar
// arm lifts on flexion/abduction and straightens on elbow extension (spec §9.2).
type Pt = { x: number; y: number };

// Five-pointed star path centered at (0,0), outer radius r.
function starPath(r: number): string {
  const inner = r * 0.42;
  let d = "";
  for (let i = 0; i < 10; i++) {
    const rad = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : inner;
    d += `${i === 0 ? "M" : "L"}${(Math.cos(rad) * rr).toFixed(2)} ${(Math.sin(rad) * rr).toFixed(2)} `;
  }
  return d + "Z";
}
const STAR = starPath(1); // unit star; scale per-use

export function StarCatchScene({
  stats,
  engagementThreshold,
  affectedSide = config.patient.affectedSide,
  store,
  romTargets,
  conn = "connecting",
  onEnd,
}: {
  stats: SessionStats;
  engagementThreshold: number;
  affectedSide?: "left" | "right";
  store: ScoreStore;
  romTargets?: Partial<Record<JointId, number>> | null;
  conn?: ConnectionState;
  onEnd: () => void;
}) {
  const model = useRef(new RomTrialModel(romTargets ?? {}));
  const [reach, setReach] = useState(0);
  const [collected, setCollected] = useState(0);
  const [score, setScore] = useState(0);
  const [engaged, setEngaged] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [cue, setCue] = useState(model.current.current.label);
  const [phase, setPhase] = useState(model.current.phase);
  const lastTs = useRef<number | null>(null);
  const celebrateUntil = useRef(0);

  useEffect(() => {
    let raf = 0;
    const tick = (ts: number) => {
      const dt = lastTs.current === null ? 0 : (ts - lastTs.current) / 1000;
      lastTs.current = ts;
      const latest = store.latest();
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
      setPhase(model.current.phase);
      setCelebrate(ts < celebrateUntil.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
    };
  }, [engagementThreshold, stats, store]);

  const reduced = prefersReducedMotion();
  const pct = Math.round(score);

  // Affected side → shoulder anchor. The FK rig draws from the current frame's
  // measured joint angles; for the elbow-extension trial we hold a modest
  // shoulder elevation so straightening reads clearly.
  const shoulder: Pt = affectedSide === "left" ? { x: 150, y: 300 } : { x: 330, y: 300 };
  const mirror = affectedSide === "left";
  const j = store.latest()?.joints;
  const joint = model.current.current.joint;
  const elevationDeg =
    joint === "shoulder_abduction" ? (j?.shoulderAbductionDeg ?? 0)
    : joint === "shoulder_flexion" ? (j?.shoulderFlexionDeg ?? 0)
    : 20; // elbow-extension trial
  const elbowDeg = j?.elbowDeg ?? 180;
  const { elbow, wrist } = fkArm({
    shoulder, shoulderElevationDeg: elevationDeg, elbowDeg,
    upperLen: 150, foreLen: 140, mirror,
  });

  return (
    <main className={`scene scene--stars${reduced ? " reduced-motion" : ""}`} data-testid="starcatch">
      <KinematicOverlay store={store} />
      <div className="stars-banner" data-engaged={engaged}>
        <span className="rom-cue" data-testid="rom-cue" data-phase={phase}>{cue}</span>
        <span className="status-pill" data-testid="status-pill" data-engaged={engaged}>
          {engaged ? "Great reaching — keep going" : "Reach toward the star"}
        </span>
        <span className="star-count" data-testid="star-count" aria-label={`${collected} stars caught`}>
          ⭐ {collected}
        </span>
      </div>

      <div className="stars-row">
        <div className="stars-sky" aria-hidden="true" />
        <div className="stars-ground" aria-hidden="true" />

        <div className="stars-camera">
          <CameraFeed recording />
        </div>

        <div className="stars-stage">
          <svg
            className={`stars-art${celebrate ? " stars-art--celebrate" : ""}`}
            data-testid="reach-scene"
            viewBox="0 0 480 600"
            role="img"
            aria-label={`${cue}: reach is ${Math.round(reach * 100)} percent toward the target`}
            preserveAspectRatio="xMidYMid meet"
          >
            {/* goal star at the wrist target position when the arm is fully extended */}
            <path
              data-testid="reach-goal"
              d={STAR}
              transform={`translate(${wrist.x} ${wrist.y}) scale(${28 + reach * 8})`}
              fill="var(--purple, #6a4c93)" stroke="#fff" strokeWidth="0.06"
              opacity={0.35 + reach * 0.4}
            />

            {/* two-bone arm: shoulder → elbow → wrist, mirroring the real pose */}
            <line
              data-testid="arm-upper"
              x1={shoulder.x} y1={shoulder.y} x2={elbow.x} y2={elbow.y}
              stroke="#c98b6b" strokeWidth="22" strokeLinecap="round"
            />
            <line
              data-testid="arm-fore"
              x1={elbow.x} y1={elbow.y} x2={wrist.x} y2={wrist.y}
              stroke="#c98b6b" strokeWidth="20" strokeLinecap="round"
            />
            <circle cx={shoulder.x} cy={shoulder.y} r="16" fill="#b06a4c" />
            <circle cx={elbow.x} cy={elbow.y} r="12" fill="#b06a4c" />

            {/* current-reach star at the hand (glowing) */}
            <path
              data-testid="reach-hand"
              data-reach={reach.toFixed(2)}
              d={STAR} transform={`translate(${wrist.x} ${wrist.y}) scale(22)`}
              fill="#f4c84a" stroke="#fff" strokeWidth="0.08"
            />
          </svg>
        </div>

        {/* fused Reach Power meter — single number, no EEG/kinematic split */}
        <div className="reach-meter">
          <span className="reach-meter__label">Reach power</span>
          <div
            className="reach-bar"
            data-testid="reach-bar"
            role="progressbar"
            aria-label="Reach power"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            <div className="reach-bar-fill" style={{ height: `${pct}%` }} />
          </div>
          <span className="reach-meter__value">{pct}</span>
        </div>
      </div>

      <div className="stars-footer">
        <button type="button" className="end-button" onClick={onEnd}>
          End session
        </button>
        <span className="conn-badge" data-state={conn}>{conn}</span>
      </div>
    </main>
  );
}
