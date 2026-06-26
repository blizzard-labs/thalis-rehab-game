import { useEffect, useRef, useState } from "react";
import { PlantGrowthModel } from "../garden/PlantGrowthModel";
import type { SessionStats } from "../session/SessionStats";
import { createScoreClient, type WsLike, type ConnectionState } from "../net/scoreClient";
import { config } from "../config";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

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
  const latestScore = useRef(0);
  const lastTs = useRef<number | null>(null);

  useEffect(() => {
    const socketFactory =
      createSocket ?? ((url: string) => new WebSocket(url) as unknown as WsLike);
    const client = createScoreClient({
      url: config.wsUrl,
      createSocket: socketFactory,
      onFrame: (f) => { latestScore.current = f.intentScore; },
      onState: setConn,
    });
    client.connect();

    let raf = 0;
    const tick = (ts: number) => {
      const dt = lastTs.current === null ? 0 : (ts - lastTs.current) / 1000;
      lastTs.current = ts;
      const s = latestScore.current;
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
  }, [createSocket, engagementThreshold, stats]);

  const reduced = prefersReducedMotion();
  const stemHeight = Math.round(growth * 100);
  return (
    <main className={`scene scene--garden${reduced ? " reduced-motion" : ""}`}>
      <div className="garden-topbar">
        <span
          className="status-pill"
          data-testid="status-pill"
          data-engaged={engaged}
        >
          {engaged ? "Good focus" : "Keep imagining — it's growing!"}
        </span>
        <span className="conn-badge" data-state={conn}>{conn}</span>
      </div>

      <div className="garden-stage">
        <div
          className={`flower${bloom ? " flower--bloom" : ""}`}
          data-testid="flower"
          data-growth={growth.toFixed(2)}
          style={{ height: `${stemHeight}%` }}
        >
          <div className="flower-head" aria-hidden="true" />
        </div>
        <div
          className="intent-bar"
          data-testid="intent-bar"
          role="progressbar"
          aria-label="Intent score"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(score)}
        >
          <div className="intent-bar-fill" style={{ height: `${Math.round(score)}%` }} />
        </div>
      </div>

      <button type="button" className="end-button" onClick={onEnd}>
        End session
      </button>
    </main>
  );
}
