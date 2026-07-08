import { useState } from "react";

type Props = {
  onNext: () => void;
  onBack: () => void;
  onFusionMode?: (mode: "A" | "B" | "C") => void;
  onAffectedSide?: (side: "left" | "right") => void;
  onCalibratePose?: () => void;
  defaultSide?: "left" | "right";
};

const MODES: { id: "A" | "B" | "C"; label: string; hint: string }[] = [
  { id: "A", label: "Mode A", hint: "EEG only" },
  { id: "B", label: "Mode B", hint: "Blended" },
  { id: "C", label: "Mode C", hint: "Movement-led" },
];

// Step 3 — Calibration. The Graz cue block still needs the LSL-marker → patient
// bridge (roadmap), so it stays an honest placeholder. V2-2c adds the vision
// fusion controls: session mode (A/B/C), affected side, and rest-pose calibration.
export function CalibrateStep({ onNext, onBack, onFusionMode, onAffectedSide, onCalibratePose, defaultSide = "right" }: Props) {
  const [mode, setMode] = useState<"A" | "B" | "C">("B");
  const [side, setSide] = useState<"left" | "right">(defaultSide);

  const pickMode = (m: "A" | "B" | "C") => { setMode(m); onFusionMode?.(m); };
  const pickSide = (sd: "left" | "right") => { setSide(sd); onAffectedSide?.(sd); };

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

          <button className="btn" onClick={() => onCalibratePose?.()}>Calibrate rest pose</button>
        </div>
      </div>
      <div className="roster-tools">
        <button className="link-btn" onClick={onBack}>← Pair device</button>
        <span className="spacer" style={{ flex: 1 }} />
        <button className="btn" onClick={onNext}>Skip</button>
        <button className="btn btn-primary" onClick={onNext}>Continue to live ▶</button>
      </div>
    </div>
  );
}
