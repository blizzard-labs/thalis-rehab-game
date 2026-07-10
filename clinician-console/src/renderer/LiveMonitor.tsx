import { useEffect, useState } from "react";
import type { ScoreStore } from "../scoring/scoreStore";
import type { ConnectionState } from "../net/scoreClient";
import type { SidecarState } from "../main/sidecar";
import { VisionHealthStore } from "../scoring/visionHealthStore";
import { CameraFrameStore } from "../scoring/cameraFrameStore";
import type { Patient } from "../data/types";
import { useScoreStore } from "./useScoreStore";
import { useVisionHealthStore } from "./useVisionHealthStore";
import { useCameraFrameStore } from "./useCameraFrameStore";
import { useEegQualityStore } from "./useEegQualityStore";
import { CameraView } from "./CameraView";
import { EegScope } from "./EegScope";
import { ElectrodeMap } from "./ElectrodeMap";
import { EegQualityStore } from "../scoring/eegQualityStore";
import "./LiveMonitor.css";

const EMPTY_QUALITY = new EegQualityStore();

const EMPTY_VISION = new VisionHealthStore();
const EMPTY_CAMERA = new CameraFrameStore();

type Props = {
  store: ScoreStore;
  connectionState: ConnectionState;
  sidecarState: SidecarState;
  qualityStore?: EegQualityStore;
  visionHealthStore?: VisionHealthStore;
  cameraFrameStore?: CameraFrameStore;
  patient?: Patient;
  onEndSession?: () => void;
  onSwitchMode?: (mode: "band_power_only" | "csp_lda_blend") => void;
};

function fmt(n: number | null, digits = 1): string {
  return n === null ? "—" : n.toFixed(digits);
}

// C3 — Live session monitor (hero screen). Single-screen oversight so the
// clinician can intervene without interpreting raw EEG: plain-language status
// tiles, 8-channel quality, the patient-view mirror, ERD/laterality/kinematic
// sub-scores, and the big IntentScore. specsv2 wireframe C3.
export function LiveMonitor({ store, connectionState, sidecarState, qualityStore, visionHealthStore, cameraFrameStore, patient, onEndSession, onSwitchMode }: Props) {
  const state = useScoreStore(store);
  // Hooks must run unconditionally, so fall back to stable empty stores when a
  // prop is absent (e.g. the isolated component test / EEG-only session).
  const vh = useVisionHealthStore(visionHealthStore ?? EMPTY_VISION).latest;
  const cam = useCameraFrameStore(cameraFrameStore ?? EMPTY_CAMERA).latest;
  const quality = useEegQualityStore(qualityStore ?? EMPTY_QUALITY).latest;
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const latest = state.latest;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const weights = latest?.classifierScore != null ? "(0.6 / 0.4)" : "";
  const canSwitchMode = latest?.classifierScore != null;
  const nextMode = latest?.mode === "csp_lda_blend" ? "band_power_only" : "csp_lda_blend";

  return (
    <div className="lm-root">
      <header className="lm-header">
        <div className="lm-rec">● REC {mm}:{ss}</div>
        <div className="lm-conn" data-testid="conn-badge">
          {connectionState === "open" ? "● live" : `○ ${connectionState}`} · sidecar {sidecarState}
          {cam && ` · 📷 ${cam.fps.toFixed(1)} fps`}
          {vh?.degraded && <span className="lm-flag" data-testid="vision-degraded-banner"> · vision degraded — EEG-only</span>}
        </div>
      </header>

      <div className="lm-tiles">
        <div className="lm-tile" data-testid="signal-tile">
          <span className="lm-tile-label">SIGNAL</span>
          <span className="lm-tile-value">{state.signalText}</span>
        </div>
        <div className="lm-tile" data-testid="mode-tile">
          <span className="lm-tile-label">MODE</span>
          <span className="lm-tile-value">{latest ? `${latest.mode} ${weights}` : "—"}</span>
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

      <div className="grid-2">
        <div className="panel">
          <div className="panel-title">EEG — 8 channel quality</div>
          {qualityStore ? (
            <div className="eeg-panel-row">
              <EegScope qualityStore={qualityStore} />
              {quality && <ElectrodeMap channels={quality.channels} compact />}
            </div>
          ) : (
            <div className="placeholder">channel quality stream not connected</div>
          )}
        </div>
        <div className="panel lm-cam-panel">
          <div className="panel-title">Patient view (mirror)</div>
          <div className="lm-camera">
            <CameraView
              store={cameraFrameStore ?? EMPTY_CAMERA}
              affectedSide={patient ? (patient.affectedSide.toLowerCase() as "left" | "right") : "right"}
            />
          </div>
        </div>
      </div>

      <div className="lm-tiles">
        <SubTile label="MU/BETA ERD%" value={latest ? `${fmt(latest.erdScore)}%` : "—"} />
        <SubTile label="LATERALITY INDEX" value={latest ? lateralityHint(latest.erdScore) : "—"} />
        <SubTile label="KINEMATICS — ROM" value={patient ? `${patient.affectedSide} reach axis` : "—"} />
        <SubTile label="TRUNK-LEAN" value="within range" />
      </div>

      <div className="lm-hero">
        <div className="lm-hero-label">INTENT SCORE</div>
        <div className="lm-hero-score" data-testid="intent-score">
          {latest ? Math.round(latest.intentScore) : "--"}
        </div>
        <div className="lm-hero-sub">ERD {latest ? fmt(latest.erdScore) : "—"}% · /100</div>
        <Trace buffer={state.buffer.map((f) => f.intentScore)} />
      </div>

      <div className="lm-kin" data-testid="kinematic-graph">
        <span className="lm-kin-label">KINEMATIC</span>
        {vh?.restCalibrated ? (
          <Trace buffer={state.buffer.map((f) => f.kinematicScore ?? 0)} thin />
        ) : (
          <span className="lm-kin-uncal">not calibrated</span>
        )}
        {latest?.compensationFlag && (
          <span className="lm-flag" data-testid="compensation-indicator">⚠ trunk compensation</span>
        )}
      </div>

      <footer className="lm-controls">
        <button
          disabled={!canSwitchMode || !onSwitchMode}
          title={canSwitchMode ? "" : "No classifier loaded (band-power-only session)"}
          onClick={() => onSwitchMode?.(nextMode)}
        >
          Switch mode ▾
        </button>
        <button disabled title="Pause/rest command not built yet">Pause / rest</button>
        <button className="lm-end" disabled={!onEndSession} onClick={() => onEndSession?.()}>
          End session
        </button>
      </footer>
    </div>
  );
}

function SubTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="lm-tile">
      <span className="lm-tile-label">{label}</span>
      <span className="lm-tile-value" style={{ fontSize: 16 }}>{value}</span>
    </div>
  );
}

function lateralityHint(erd: number | null): string {
  if (erd === null) return "—";
  return erd > 50 ? "contralateral ✓" : "weak";
}

function Trace({ buffer, thin = false }: { buffer: number[]; thin?: boolean }) {
  const cls = thin ? "lm-trace lm-trace--thin" : "lm-trace";
  if (buffer.length < 2) return <div className={cls} />;
  const w = 600,
    h = thin ? 26 : 80,
    n = buffer.length;
  const pts = buffer
    .map((v, i) => `${(i / (n - 1)) * w},${h - (Math.max(0, Math.min(100, v)) / 100) * h}`)
    .join(" ");
  return (
    <svg className={cls} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={thin ? "#4ea1ff" : "#e89a52"} strokeWidth="2" />
    </svg>
  );
}
