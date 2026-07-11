import { useEffect, useRef, useState } from "react";
import { RomTrialModel } from "../reach/RomTrialModel";
import { ikArm } from "../reach/ikArm";
import type { SessionStats } from "../session/SessionStats";
import type { ConnectionState } from "../net/scoreClient";
import { CameraFeed } from "./CameraFeed";
import { KinematicOverlay } from "./KinematicOverlay";
import type { ScoreStore } from "../scoring/scoreStore";
import { config } from "../config";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

// SVG scene geometry (viewBox 0 0 600 660). The arm is centered on the page; a
// two-bone IK rig drives the wrist directly from the patient's measured wrist
// offset, and the goal star sits at the current trial's direction (up/side/down)
// so the net physically overlaps the star at capture.
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
  conn = "connecting",
  onEnd,
}: {
  stats: SessionStats;
  engagementThreshold: number;
  affectedSide?: "left" | "right";
  store: ScoreStore;
  conn?: ConnectionState;
  onEnd: () => void;
}) {
  const model = useRef(new RomTrialModel(affectedSide));
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
      setCueDetail(model.current.current.cue);
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

  // Directional reach: the avatar arm is centered on the page and its wrist is
  // driven straight from the patient's MEASURED wrist offset (reach space:
  // +x toward the affected side, +y up). Two-bone IK bends the elbow to reach
  // that point. The goal star sits at the current trial's direction (up / side /
  // down), so the net physically overlaps the star at capture — no angle proxy.
  const SCALE = 200;
  const shoulder: Pt = { x: 300, y: 330 };
  const bendSign = affectedSide === "left" ? -1 : 1;
  const side = affectedSide === "left" ? -1 : 1;

  const j = store.latest()?.joints;
  const tracking = j?.poseValid === true;
  const rx = j && j.wristDx !== null && j.wristDx !== undefined ? j.wristDx * side : 0;
  const ry = j && j.wristDy !== null && j.wristDy !== undefined ? -j.wristDy : 0;
  const toScreen = (p: { x: number; y: number }): Pt =>
    ({ x: shoulder.x + p.x * SCALE, y: shoulder.y - p.y * SCALE });

  const { elbow, wrist } = ikArm({
    shoulder, target: toScreen({ x: rx, y: ry }),
    upperLen: 130, foreLen: 120, bendSign,
  });
  const goalPt = toScreen(model.current.current.goal);

  // Net orientation: point the handle back along the forearm (toward the elbow)
  // so the hand appears to hold it, with the hoop encircling the goal star.
  const netAngleDeg = (Math.atan2(-(wrist.x - elbow.x), wrist.y - elbow.y) * 180) / Math.PI;

  return (
    <main className={`scene scene--stars${reduced ? " reduced-motion" : ""}`} data-testid="starcatch">
      <KinematicOverlay store={store} />
      <div className="stars-banner" data-engaged={engaged}>
        <span className="rom-cue" data-testid="rom-cue" data-phase={phase}>{cue}</span>
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
            viewBox="0 0 600 660"
            role="img"
            aria-label={`${cue}: reach is ${Math.round(reach * 100)} percent toward the target`}
            preserveAspectRatio="xMidYMid meet"
          >
            {/* fixed goal star for the current cue — stays put; the net reaches to it */}
            <g data-testid="reach-goal" transform={`translate(${goalPt.x} ${goalPt.y})`}>
              <path
                d={STAR}
                transform={`scale(${34 + reach * 8})`}
                fill="#f4c84a" stroke="#fff" strokeWidth="0.06"
                opacity={0.55 + reach * 0.4}
              />
            </g>

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

            {/* net on the hand — handle held by the arm (points back to the elbow),
                hoop encircling the goal star; oriented along the forearm. */}
            <g
              data-testid="net"
              data-reach={reach.toFixed(2)}
              transform={`translate(${wrist.x} ${wrist.y}) rotate(${netAngleDeg.toFixed(1)})`}
            >
              {/* handle: from the hoop edge back toward the elbow (local -Y) */}
              <line x1="0" y1="-46" x2="0" y2="-74" stroke="#8a5a2b" strokeWidth="7" strokeLinecap="round" />
              {/* hoop encircling the star at the wrist */}
              <circle cx="0" cy="0" r="46" fill="rgba(255,255,255,0.16)" stroke="#c9a24a" strokeWidth="6" />
              {/* mesh */}
              <path
                d="M-46 0 L46 0 M0 -46 L0 46 M-33 -33 L33 33 M33 -33 L-33 33 M-24 -40 L-24 40 M24 -40 L24 40 M-40 -24 L40 -24 M-40 24 L40 24"
                stroke="#c9a24a" strokeWidth="1.5" fill="none" opacity="0.6"
              />
            </g>
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
        <span className="tracking-badge" data-testid="tracking-badge" data-tracking={tracking ? "on" : "off"}>
          {tracking ? "Tracking arm ✓" : "Move into frame"}
        </span>
      </div>
    </main>
  );
}
