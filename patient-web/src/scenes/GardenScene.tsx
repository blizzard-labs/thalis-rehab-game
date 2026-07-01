import { useEffect, useRef, useState } from "react";
import { PlantGrowthModel } from "../garden/PlantGrowthModel";
import type { SessionStats } from "../session/SessionStats";
import { createScoreClient, type WsLike, type ConnectionState } from "../net/scoreClient";
import { CameraFeed } from "./CameraFeed";
import { ScoreStore } from "../scoring/scoreStore";
import { config } from "../config";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

// Garden geometry, in SVG user units (viewBox 0 0 480 600). The plant is
// rooted in the soil mound and grows straight up; everything below derives
// from `growth` (0..1) so a single number drives the whole illustration.
const GROUND_Y = 520;
const STEM_BASE_X = 240;
const STEM_MAX = 392; // full-height stem at growth = 1

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

// Eight petals laid out radially around the flower's center.
const PETALS = Array.from({ length: 8 }, (_, i) => i * 45);

export function GardenScene({
  stats,
  engagementThreshold,
  createSocket,
  onEnd,
}: {
  stats: SessionStats;
  engagementThreshold: number;
  createSocket?: (url: string) => WsLike;
  onEnd: () => void;
}) {
  const [growth, setGrowth] = useState(0);
  const [bloom, setBloom] = useState(false);
  const [score, setScore] = useState(0);
  const [engaged, setEngaged] = useState(false);
  const [conn, setConn] = useState<ConnectionState>("connecting");

  const plant = useRef(new PlantGrowthModel());
  const store = useRef(new ScoreStore());
  const lastTs = useRef<number | null>(null);
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
      client.stop();
    };
  }, [engagementThreshold, stats]);

  const reduced = prefersReducedMotion();

  // --- derive the illustration from a single growth value ---
  const stemLen = growth * STEM_MAX;
  const stemTop = GROUND_Y - stemLen;
  // Leaves sprout at fixed fractions up the *current* stem, so they ride the
  // plant as it grows. Each fades/scales in over a small growth window.
  const leafLowScale = clamp01((growth - 0.22) / 0.18);
  const leafHighScale = clamp01((growth - 0.48) / 0.18);
  const leafLowY = GROUND_Y - stemLen * 0.42;
  const leafHighY = GROUND_Y - stemLen * 0.68;
  // Flower head grows from a bud into an open flower; bloom snaps it to full.
  const headScale = bloom ? 1 : 0.34 + clamp01((growth - 0.1) / 0.6) * 0.42;
  const pct = Math.round(score);

  return (
    <main className={`scene scene--garden${reduced ? " reduced-motion" : ""}`}>
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
          <svg
            className={`garden-art flower${bloom ? " flower--bloom" : ""}`}
            data-testid="flower"
            data-growth={growth.toFixed(2)}
            viewBox="120 20 240 520"
            role="img"
            aria-label={
              bloom
                ? "The flower has fully bloomed"
                : `The plant has grown ${Math.round(growth * 100)} percent`
            }
            preserveAspectRatio="xMidYMax meet"
          >
            {/* the plant only — drawn bottom-up so the head sits on top */}
            <g className="plant">
              {/* stem */}
              <line
                x1={STEM_BASE_X}
                y1={GROUND_Y}
                x2={STEM_BASE_X}
                y2={stemTop}
                stroke="#4f9d4f"
                strokeWidth="16"
                strokeLinecap="round"
              />

              {/* lower leaf (left) */}
              <g
                className="leaf"
                style={{
                  transform: `translate(${STEM_BASE_X}px, ${leafLowY}px) rotate(-32deg) scale(${leafLowScale})`,
                }}
              >
                <path d="M0 0 C -8 -34 -54 -42 -78 -18 C -52 6 -10 8 0 0 Z" fill="#5fb35f" />
                <path d="M-8 -6 C -28 -16 -50 -20 -70 -18" stroke="#3f8a3f" strokeWidth="3" fill="none" />
              </g>

              {/* upper leaf (right) */}
              <g
                className="leaf"
                style={{
                  transform: `translate(${STEM_BASE_X}px, ${leafHighY}px) rotate(32deg) scale(${leafHighScale})`,
                }}
              >
                <path d="M0 0 C 8 -34 54 -42 78 -18 C 52 6 10 8 0 0 Z" fill="#6cbf6c" />
                <path d="M8 -6 C 28 -16 50 -20 70 -18" stroke="#3f8a3f" strokeWidth="3" fill="none" />
              </g>

              {/* flower head */}
              <g
                className="flower-headg"
                style={{
                  transform: `translate(${STEM_BASE_X}px, ${stemTop}px) scale(${headScale})`,
                }}
              >
                <g className="petals">
                  {PETALS.map((deg) => (
                    <ellipse
                      key={deg}
                      cx="0"
                      cy="-46"
                      rx="22"
                      ry="40"
                      fill="var(--purple)"
                      transform={`rotate(${deg})`}
                    />
                  ))}
                </g>
                <circle r="26" fill="#f4c84a" />
                <circle r="26" fill="#e0ad2e" fillOpacity="0.35" />
              </g>
            </g>
          </svg>
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
      </div>
    </main>
  );
}
