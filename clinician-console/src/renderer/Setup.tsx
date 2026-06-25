import type { EegQualityStore } from "../scoring/eegQualityStore";
import type { ChannelQuality } from "../scoring/eegQualityMessage";
import type { Patient } from "../data/types";
import { useEegQualityStore } from "./useEegQualityStore";

type Props = {
  qualityStore: EegQualityStore;
  patient: Patient;
  onProceed: () => void;
  onBack: () => void;
};

// Approx 10-20 scalp positions for the fixed Unicorn montage, as fractions of
// the head box. Used only to lay out the electrode-contact map (C2).
const POSITIONS: Record<string, { x: number; y: number }> = {
  Fz: { x: 0.5, y: 0.18 },
  C3: { x: 0.28, y: 0.42 },
  Cz: { x: 0.5, y: 0.42 },
  C4: { x: 0.72, y: 0.42 },
  Pz: { x: 0.5, y: 0.66 },
  PO7: { x: 0.33, y: 0.8 },
  Oz: { x: 0.5, y: 0.88 },
  PO8: { x: 0.67, y: 0.8 },
};

// C2 — Setup & signal-quality check (<10 min). Raw µV is translated to plain
// language (good / check / poor); the clinician never reads microvolts. Live
// trace of the MI channels + a (placeholder) camera rest-pose step. specsv2 §10.1.
export function Setup({ qualityStore, patient, onProceed, onBack }: Props) {
  const { latest } = useEegQualityStore(qualityStore);

  const channels = latest?.channels ?? [];
  const problems = channels.filter((c) => c.quality !== "good");

  return (
    <div className="content">
      <div className="ws-sub">
        <button className="link-btn" onClick={onBack}>← Roster</button> · Step 1 of 3 · Don headset
      </div>
      <div className="ws-bio">{patient.name} · Setup</div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-title">Electrode contact</div>
          {latest ? (
            <>
              <div className="electrode-map" role="group" aria-label="electrode contact map">
                {/* head outline */}
                <div
                  style={{
                    position: "absolute", inset: 8, border: "2px solid #3a4760",
                    borderRadius: "50%",
                  }}
                />
                {channels.map((c) => {
                  const pos = POSITIONS[c.label] ?? { x: 0.5, y: 0.5 };
                  return (
                    <div
                      key={c.label}
                      className={`electrode ${c.quality}`}
                      style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }}
                      title={`${c.label}: ${c.quality} (${c.p2p.toFixed(0)} µVpp)`}
                    >
                      {c.label}
                    </div>
                  );
                })}
              </div>
              <div className="legend">
                <span><span className="dot" style={{ background: "var(--good)" }} /> Good</span>
                <span><span className="dot" style={{ background: "var(--check)" }} /> Check</span>
                <span><span className="dot" style={{ background: "var(--poor)" }} /> Poor</span>
              </div>
            </>
          ) : (
            <div className="placeholder">Waiting for headset signal…</div>
          )}
        </div>

        <div className="panel">
          <div className="panel-title">Live trace — C3 / Cz / C4</div>
          {latest ? <TraceStack trace={latest.trace} /> : <div className="placeholder">Waiting for headset signal…</div>}
        </div>
      </div>

      {problems.length > 0 && (
        <div className="alert">
          ⚠ Check {problems.map((c) => c.label).join(", ")} contact — add gel or re-seat.
          Plain-language only, no raw µV reading needed.
        </div>
      )}

      <div className="panel">
        <div className="panel-title">Camera · rest-pose calibration</div>
        <div className="placeholder">
          Patient-device camera (WebRTC) — framing check &amp; "sit still 5s" rest-pose.
          Wired in roadmap phase V2-2; EEG-only setup proceeds without it (specsv2 §7.3).
        </div>
      </div>

      <div className="roster-tools">
        <span className="spacer" style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={onProceed}>Next: Calibration ▶</button>
      </div>
    </div>
  );
}

function TraceStack({ trace }: { trace: Record<string, number[]> }) {
  const labels = ["C3", "Cz", "C4"].filter((l) => (trace[l]?.length ?? 0) > 1);
  if (labels.length === 0) return <div className="placeholder">no trace yet</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {labels.map((l) => (
        <div key={l}>
          <div className="ws-sub" style={{ marginBottom: 2 }}>{l}</div>
          <MiniTrace values={trace[l]} />
        </div>
      ))}
    </div>
  );
}

function MiniTrace({ values }: { values: number[] }) {
  const w = 480, h = 48;
  const max = Math.max(1e-6, ...values.map((v) => Math.abs(v)));
  const n = values.length;
  const pts = values
    .map((v, i) => `${(i / (n - 1)) * w},${h / 2 - (v / max) * (h / 2 - 4)}`)
    .join(" ");
  return (
    <svg className="lm-trace" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ height: h }}>
      <polyline points={pts} fill="none" stroke="#7fb2e0" strokeWidth="1.5" />
    </svg>
  );
}
