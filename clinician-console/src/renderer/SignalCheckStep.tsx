import type { EegQualityStore } from "../scoring/eegQualityStore";
import type { Patient } from "../data/types";
import { useEegQualityStore } from "./useEegQualityStore";
import { ElectrodeMap } from "./ElectrodeMap";

type Props = {
  qualityStore: EegQualityStore;
  patient: Patient;
  source: "sim" | "live";
  onSourceChange: (s: "sim" | "live") => void;
  onNext: () => void;
  onBack: () => void;
};

// Step 1 — Signal check (C2). Electrode contact + live MI trace + the EEG source
// toggle (simulated dev stream vs live headset). Runs on flat rest (sim idle).
export function SignalCheckStep({ qualityStore, patient, source, onSourceChange, onNext, onBack }: Props) {
  const { latest } = useEegQualityStore(qualityStore);
  const channels = latest?.channels ?? [];
  const problems = channels.filter((c) => c.quality !== "good");

  return (
    <div className="content">
      <div className="ws-bio">{patient.name} · Signal check</div>

      <fieldset className="source-toggle" aria-label="EEG source">
        <label>
          <input type="radio" name="eeg-source" checked={source === "sim"} onChange={() => onSourceChange("sim")} />
          Simulated EEG (dev)
        </label>
        <label>
          <input type="radio" name="eeg-source" checked={source === "live"} onChange={() => onSourceChange("live")} />
          Live headset
        </label>
      </fieldset>
      <div className="ws-sub">Affected side: {patient.affectedSide} · mode {patient.mode}</div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-title">Electrode contact</div>
          {latest ? (
            <ElectrodeMap channels={channels} />
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
        </div>
      )}

      <div className="roster-tools">
        <button className="link-btn" onClick={onBack}>← Cancel</button>
        <span className="spacer" style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={onNext}>Next: Pair device ▶</button>
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
  const pts = values.map((v, i) => `${(i / (n - 1)) * w},${h / 2 - (v / max) * (h / 2 - 4)}`).join(" ");
  return (
    <svg className="lm-trace" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ height: h }}>
      <polyline points={pts} fill="none" stroke="#7fb2e0" strokeWidth="1.5" />
    </svg>
  );
}
