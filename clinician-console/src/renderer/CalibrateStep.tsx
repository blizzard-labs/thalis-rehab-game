import { useEffect, useState } from "react";
import type { VisionHealthStore } from "../scoring/visionHealthStore";
import type { CameraFrameStore } from "../scoring/cameraFrameStore";
import { useVisionHealthStore } from "./useVisionHealthStore";
import { useCameraFrameStore } from "./useCameraFrameStore";
import { CameraView } from "./CameraView";
import { WaitingSpinner } from "./WaitingSpinner";

type Props = {
  onNext: () => void;
  onBack: () => void;
  onGoLive: () => void;
  waitingForPatient: boolean;
  onFusionMode?: (mode: "A" | "B" | "C") => void;
  onAffectedSide?: (side: "left" | "right") => void;
  defaultSide?: "left" | "right";
  visionHealthStore: VisionHealthStore;
  cameraFrameStore?: CameraFrameStore;
  /** Wall-clock ms when the patient pressed "I'm ready" (drives the EEG baseline bar). */
  calibrationStartedAt?: number | null;
};

// Baseline capture window mirrored from the patient CalibrationScene (spec §6).
const BASELINE_MS = 60000;
const IN_FRAME_VIS = 0.5; // min landmark visibility to count as "in frame"

const MODES: { id: "A" | "B" | "C"; label: string; hint: string }[] = [
  { id: "A", label: "Mode A", hint: "EEG only" },
  { id: "B", label: "Mode B", hint: "Blended" },
  { id: "C", label: "Mode C", hint: "Movement-led" },
];

// Step 3 — Calibration. The Graz cue block still needs the LSL-marker → patient
// bridge (roadmap), so it stays an honest placeholder. V2-2c adds the vision
// fusion controls: session mode (A/B/C), affected side, and rest-pose calibration,
// with live calibration feedback from the sidecar's vision_health frame.
export function CalibrateStep(
  { onNext, onBack, onGoLive, waitingForPatient, onFusionMode, onAffectedSide, defaultSide = "right", visionHealthStore, cameraFrameStore, calibrationStartedAt = null }: Props,
) {
  const [mode, setMode] = useState<"A" | "B" | "C">("B");
  const vh = useVisionHealthStore(visionHealthStore).latest;
  // The engine is the source of truth once frames flow; before then, reflect the
  // clinician's local pick (seeded from the patient record).
  const side = vh?.affectedSide ?? defaultSide;

  // Push the patient's affected side to the engine on mount so scoring matches
  // the record WITHOUT requiring a click (the affected-side toggle is gone; the
  // side comes straight from the patient record).
  useEffect(() => {
    onAffectedSide?.(defaultSide);
  }, [defaultSide, onAffectedSide]);

  const pickMode = (m: "A" | "B" | "C") => { setMode(m); onFusionMode?.(m); };
  const goLive = () => { onGoLive(); onNext(); };

  return (
    <div className="content">
      <div className="panel-title">Calibration</div>
      <div className="panel">
        {cameraFrameStore && (
          <div className="cal-live">
            <div className="cal-cam">
              <CameraView store={cameraFrameStore} affectedSide={side} />
            </div>
            <CalStatusColumn
              cameraFrameStore={cameraFrameStore}
              calibration={vh?.calibration ?? "idle"}
              restCalibrated={vh?.restCalibrated ?? false}
              calibrationStartedAt={calibrationStartedAt}
            />
          </div>
        )}

        <div className="fusion-controls">
          <div className="fusion-group" role="group" aria-label="Fusion mode">
            <span className="fusion-label">Fusion mode</span>
            {MODES.map((m) => (
              <button
                key={m.id}
                className={`btn ${mode === m.id ? "btn-primary" : ""}`}
                onClick={() => pickMode(m.id)}
              >
                {m.label} · {m.hint}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="roster-tools">
        <button className="link-btn" onClick={onBack}>← Pair device</button>
        <span className="spacer" style={{ flex: 1 }} />
        <button className="btn" onClick={goLive}>Skip</button>
        <div className="gate-col">
          <button className="btn btn-primary" onClick={goLive} disabled={waitingForPatient}>Continue to live ▶</button>
          {waitingForPatient && <WaitingSpinner label="Waiting for patient…" />}
        </div>
      </div>
    </div>
  );
}

// Live calibration status beside the camera feed: patient-in-frame (from pose
// landmark visibility), CV rest-pose (from vision_health.calibration), and an
// approximate EEG-baseline bar (a console timer started when the patient pressed
// "I'm ready" — no backend baseline-progress signal exists yet).
function CalStatusColumn(
  { cameraFrameStore, calibration, restCalibrated, calibrationStartedAt }: {
    cameraFrameStore: CameraFrameStore;
    calibration: string;
    restCalibrated: boolean;
    calibrationStartedAt: number | null;
  },
) {
  const cam = useCameraFrameStore(cameraFrameStore).latest;
  const inFrame = !!cam && cam.landmarks.pose.some((p) => (p[2] ?? 0) >= IN_FRAME_VIS);

  // 1 Hz tick so the baseline bar advances while the timer runs.
  const [, force] = useState(0);
  useEffect(() => {
    if (calibrationStartedAt === null) return;
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [calibrationStartedAt]);
  const eegPct = calibrationStartedAt === null
    ? 0
    : Math.min(100, ((Date.now() - calibrationStartedAt) / BASELINE_MS) * 100);

  const cvDone = restCalibrated || calibration === "complete";
  const cvLabel = cvDone ? "✓ done" : calibration === "collecting" ? "calibrating…" : "waiting";
  const procedure = currentProcedure(calibrationStartedAt, cvDone, eegPct, inFrame);

  return (
    <div className="cal-statuscol">
      <div className="cal-stat" data-testid="cal-status-inframe">
        <span className={`dot ${inFrame ? "dot--good" : "dot--poor"}`} />
        <span className="cal-stat-label">In frame</span>
        <span className="cal-stat-val">{inFrame ? "yes" : "no"}</span>
      </div>
      <div className="cal-stat" data-testid="cal-status-cv">
        <span className={`dot ${cvDone ? "dot--good" : calibration === "collecting" ? "dot--check" : "dot--poor"}`} />
        <span className="cal-stat-label">CV rest pose</span>
        <span className="cal-stat-val">{cvLabel}</span>
      </div>
      <div className="cal-stat cal-stat--bar" data-testid="cal-status-eeg">
        <span className="cal-stat-label">EEG baseline</span>
        {calibrationStartedAt === null
          ? <span className="cal-stat-val">waiting</span>
          : <span className="cal-bar"><span className="cal-bar-fill" style={{ width: `${eegPct}%` }} /></span>}
      </div>
      <div className="cal-procedure" data-testid="cal-procedure">
        <span className="cal-procedure-label">Current step</span>
        <span className="cal-procedure-text">{procedure}</span>
      </div>
    </div>
  );
}

// Plain-language description of what the calibration pipeline is doing right now,
// derived from the CV rest-pose state + the EEG-baseline timer.
function currentProcedure(startedAt: number | null, cvDone: boolean, eegPct: number, inFrame: boolean): string {
  if (startedAt === null) return "Waiting for the patient to press “I’m ready”.";
  if (!cvDone) {
    return inFrame
      ? "Step 1 of 2 — Capturing rest pose. Hold still, keep the affected arm in frame."
      : "Step 1 of 2 — Waiting for the patient to come into frame for rest-pose capture.";
  }
  if (eegPct < 100) return "Step 2 of 2 — Recording resting EEG baseline (eyes open, relax).";
  return "Calibration complete — ready to go live.";
}
