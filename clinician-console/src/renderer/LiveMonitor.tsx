import { useEffect, useState } from "react";
import type { ScoreStore } from "../scoring/scoreStore";
import type { ConnectionState } from "../net/scoreClient";
import type { SidecarState } from "../main/sidecar";
import { useScoreStore } from "./useScoreStore";
import "./LiveMonitor.css";

type Props = {
  store: ScoreStore;
  connectionState: ConnectionState;
  sidecarState: SidecarState;
};

function fmt(n: number | null, digits = 1): string {
  return n === null ? "—" : n.toFixed(digits);
}

export function LiveMonitor({ store, connectionState, sidecarState }: Props) {
  const state = useScoreStore(store);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const latest = state.latest;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="lm-root">
      <header className="lm-header">
        <div className="lm-patient">Margaret R. · #0421 · L-hemiparesis</div>
        <div className="lm-rec">● REC {mm}:{ss}</div>
        <div className="lm-conn" data-testid="conn-badge">
          {connectionState === "open" ? "● live" : `○ ${connectionState}`} · sidecar {sidecarState}
        </div>
      </header>

      <div className="lm-tiles">
        <div className="lm-tile" data-testid="signal-tile">
          <span className="lm-tile-label">SIGNAL</span>
          <span className="lm-tile-value">{state.signalText}</span>
        </div>
        <div className="lm-tile" data-testid="mode-tile">
          <span className="lm-tile-label">MODE</span>
          <span className="lm-tile-value">{latest ? latest.mode : "—"}</span>
        </div>
        <div className="lm-tile" data-testid="classifier-tile">
          <span className="lm-tile-label">CLASSIFIER CONF.</span>
          <span className="lm-tile-value">{latest ? fmt(latest.classifierScore, 2) : "—"}</span>
        </div>
        <div className="lm-tile">
          <span className="lm-tile-label">FATIGUE</span>
          <span className="lm-tile-value">Watch</span>
        </div>
      </div>

      <div className="lm-hero">
        <div className="lm-hero-label">INTENT SCORE</div>
        <div className="lm-hero-score" data-testid="intent-score">
          {latest ? Math.round(latest.intentScore) : "--"}
        </div>
        <div className="lm-hero-sub">ERD {latest ? fmt(latest.erdScore) : "—"}%</div>
        <Trace buffer={state.buffer.map((f) => f.intentScore)} />
      </div>

      <footer className="lm-controls">
        <button disabled>Switch mode</button>
        <button disabled>Pause / rest</button>
        <button disabled className="lm-end">End session</button>
        <span className="lm-note">controls disabled — no control channel in this prototype</span>
      </footer>
    </div>
  );
}

function Trace({ buffer }: { buffer: number[] }) {
  if (buffer.length < 2) return <div className="lm-trace" />;
  const w = 600,
    h = 80,
    n = buffer.length;
  const pts = buffer
    .map((v, i) => `${(i / (n - 1)) * w},${h - (Math.max(0, Math.min(100, v)) / 100) * h}`)
    .join(" ");
  return (
    <svg className="lm-trace" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="#e89a52" strokeWidth="2" />
    </svg>
  );
}
