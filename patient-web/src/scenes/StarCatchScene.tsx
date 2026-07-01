import { useEffect, useRef, useState } from "react";
import { ReachModel } from "../reach/ReachModel";
import type { SessionStats } from "../session/SessionStats";
import { createScoreClient, type WsLike, type ConnectionState } from "../net/scoreClient";
import { CameraFeed } from "./CameraFeed";
import { ScoreStore } from "../scoring/scoreStore";
import { config } from "../config";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

// SVG scene geometry (viewBox 0 0 480 600). The arm is anchored at the shoulder
// on the patient's AFFECTED side; the star goal sits in the opposite upper
// corner (intact visual field, spec §9.3). Everything derives from `reach`.
type Pt = { x: number; y: number };
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

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
  createSocket,
  onEnd,
}: {
  stats: SessionStats;
  engagementThreshold: number;
  affectedSide?: "left" | "right";
  createSocket?: (url: string) => WsLike;
  onEnd: () => void;
}) {
  const [reach, setReach] = useState(0);
  const [goal, setGoal] = useState(ReachModel.GOAL_START);
  const [collected, setCollected] = useState(0);
  const [score, setScore] = useState(0);
  const [engaged, setEngaged] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [conn, setConn] = useState<ConnectionState>("connecting");

  const model = useRef(new ReachModel());
  const store = useRef(new ScoreStore());
  const lastTs = useRef<number | null>(null);
  const celebrateUntil = useRef(0);
  const createSocketRef = useRef(createSocket);
  createSocketRef.current = createSocket;

  useEffect(() => {
    const socketFactory =
      createSocketRef.current ?? ((url: string) => new WebSocket(url) as unknown as WsLike);
    const client = createScoreClient({
      url: config.wsUrl,
      createSocket: socketFactory,
      onFrame: (f) => { store.current.push(f); },
      onState: setConn,
    });
    client.connect();

    let raf = 0;
    const tick = (ts: number) => {
      const dt = lastTs.current === null ? 0 : (ts - lastTs.current) / 1000;
      lastTs.current = ts;
      const latest = store.current.latest();
      const s = latest ? latest.intentScore : 0;
      model.current.update(s / 100, dt);
      const isEngaged = s >= engagementThreshold;
      stats.accumulate(dt, isEngaged);
      if (model.current.justCollected) {
        stats.incrementTrials();
        celebrateUntil.current = ts + 900; // ~0.9 s glow
      }
      setReach(model.current.reach);
      setGoal(model.current.goalFraction);
      setCollected(model.current.collected);
      setScore(s);
      setEngaged(isEngaged);
      setCelebrate(ts < celebrateUntil.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      client.stop();
    };
  }, [engagementThreshold, stats]);

  const reduced = prefersReducedMotion();
  const pct = Math.round(score);

  // Affected side → shoulder anchor; goal in the opposite upper corner.
  const shoulder: Pt = affectedSide === "left" ? { x: 96, y: 512 } : { x: 384, y: 512 };
  const goalEnd: Pt = affectedSide === "left" ? { x: 396, y: 96 } : { x: 84, y: 96 };
  const hand = lerp(shoulder, goalEnd, reach);
  const nextStar = lerp(shoulder, goalEnd, goal);

  return (
    <main className={`scene scene--stars${reduced ? " reduced-motion" : ""}`} data-testid="starcatch">
      <div className="stars-banner" data-engaged={engaged}>
        <span className="status-pill" data-testid="status-pill" data-engaged={engaged}>
          {engaged ? "Great reaching — keep going" : "Reach up toward the star"}
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
            aria-label={`Reach is ${Math.round(reach * 100)} percent toward the star`}
            preserveAspectRatio="xMidYMid meet"
          >
            {/* direction arrow along the reach axis */}
            <defs>
              <marker id="reach-arrow" markerWidth="10" markerHeight="10" refX="6" refY="3"
                      orient="auto" markerUnits="strokeWidth">
                <path d="M0 0 L6 3 L0 6 Z" fill="var(--purple-soft, #b9a3d6)" />
              </marker>
            </defs>
            <line
              x1={shoulder.x} y1={shoulder.y} x2={goalEnd.x} y2={goalEnd.y}
              stroke="var(--purple-soft, #b9a3d6)" strokeWidth="4" strokeDasharray="2 12"
              strokeLinecap="round" markerEnd="url(#reach-arrow)" opacity="0.6"
            />

            {/* goal star (big) */}
            <path
              data-testid="reach-goal"
              d={STAR} transform={`translate(${goalEnd.x} ${goalEnd.y}) scale(34)`}
              fill="var(--purple, #6a4c93)" stroke="#fff" strokeWidth="0.06"
            />

            {/* next-target star (dashed outline) at the current goal fraction */}
            <path
              d={STAR} transform={`translate(${nextStar.x} ${nextStar.y}) scale(18)`}
              fill="none" stroke="#e6dcff" strokeWidth="0.18" strokeDasharray="0.32 0.22"
            />

            {/* the arm: shoulder → hand */}
            <line
              x1={shoulder.x} y1={shoulder.y} x2={hand.x} y2={hand.y}
              stroke="#c98b6b" strokeWidth="22" strokeLinecap="round"
            />
            <circle cx={shoulder.x} cy={shoulder.y} r="16" fill="#b06a4c" />

            {/* current-reach star at the hand (glowing) */}
            <path
              data-testid="reach-hand"
              data-reach={reach.toFixed(2)}
              d={STAR} transform={`translate(${hand.x} ${hand.y}) scale(22)`}
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
