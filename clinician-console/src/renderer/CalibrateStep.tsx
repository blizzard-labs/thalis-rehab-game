type Props = { onNext: () => void; onBack: () => void };

// Step 3 — Calibration. A real marker-driven Graz block needs the LSL-marker →
// browser bridge (not built), so this is an honest, skippable placeholder.
export function CalibrateStep({ onNext, onBack }: Props) {
  return (
    <div className="content">
      <div className="panel-title">Calibration</div>
      <div className="panel">
        <div className="placeholder">
          Calibration is <strong>abbreviated</strong> for now — the full Graz cue block lands with the
          LSL-marker → patient bridge (roadmap). You can skip straight to the live session.
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
