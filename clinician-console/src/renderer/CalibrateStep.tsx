import { useEffect, useState } from "react";
import type { VisionHealthStore } from "../scoring/visionHealthStore";
import type { CameraFrameStore } from "../scoring/cameraFrameStore";
import { useVisionHealthStore } from "./useVisionHealthStore";
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
};

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
  { onNext, onBack, onGoLive, waitingForPatient, onFusionMode, onAffectedSide, defaultSide = "right", visionHealthStore }: Props,
) {
  const [mode, setMode] = useState<"A" | "B" | "C">("B");
  const [localSide, setLocalSide] = useState<"left" | "right">(defaultSide);
  const vh = useVisionHealthStore(visionHealthStore).latest;
  // The engine is the source of truth once frames flow; before then, reflect the
  // clinician's local pick (seeded from the patient record).
  const side = vh?.affectedSide ?? localSide;

  // Push the patient's affected side to the engine on mount so scoring matches
  // the record WITHOUT requiring a click — the engine boots to a fixed default
  // otherwise, which silently scores the wrong arm.
  useEffect(() => {
    onAffectedSide?.(defaultSide);
  }, [defaultSide, onAffectedSide]);

  const pickMode = (m: "A" | "B" | "C") => { setMode(m); onFusionMode?.(m); };
  const pickSide = (sd: "left" | "right") => { setLocalSide(sd); onAffectedSide?.(sd); };
  const goLive = () => { onGoLive(); onNext(); };

  return (
    <div className="content">
      <div className="panel-title">Calibration</div>
      <div className="panel">
        <div className="placeholder">
          Calibration is <strong>abbreviated</strong> for now — the full Graz cue block lands with the
          LSL-marker → patient bridge (roadmap). You can skip straight to the live session.
        </div>

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

          <div className="fusion-group" role="group" aria-label="Affected side">
            <span className="fusion-label">Affected side</span>
            <button className={`btn ${side === "left" ? "btn-primary" : ""}`} onClick={() => pickSide("left")}>Left</button>
            <button className={`btn ${side === "right" ? "btn-primary" : ""}`} onClick={() => pickSide("right")}>Right</button>
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
