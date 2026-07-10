import { useRef } from "react";
import type { EegQualityStore } from "../scoring/eegQualityStore";
import { useEegQualityStore } from "./useEegQualityStore";

type Props = { qualityStore: EegQualityStore };

// Rolling window kept per channel so the scope "flows" instead of showing only
// the latest ~4-sample chunk the sidecar sends each quality frame (~5 Hz).
const MAX_SAMPLES = 500;

// Scientific 8-channel strip chart (montage-viewer norm) — one stacked row per
// EEG channel, mono labels, per-channel quality dot, thin auto-scaled trace.
// Styled deliberately unlike the console chrome (dark scope look, LiveMonitor.css).
export function EegScope({ qualityStore }: Props) {
  const { latest } = useEegQualityStore(qualityStore);
  const buffers = useRef<Map<string, number[]>>(new Map());
  const lastTs = useRef<number>(-1);

  if (latest && latest.timestamp !== lastTs.current) {
    lastTs.current = latest.timestamp;
    for (const [label, samples] of Object.entries(latest.trace)) {
      const buf = buffers.current.get(label) ?? [];
      buf.push(...samples);
      if (buf.length > MAX_SAMPLES) buf.splice(0, buf.length - MAX_SAMPLES);
      buffers.current.set(label, buf);
    }
  }

  if (!latest) return <div className="placeholder">waiting for signal…</div>;

  return (
    <div className="eeg-scope">
      {latest.channels.map((c) => (
        <div className="eeg-scope-row" data-testid="eeg-scope-row" key={c.label}>
          <span className="eeg-scope-label">{c.label}</span>
          <span className={`dot dot--${c.quality}`} />
          <ScopeTrace samples={buffers.current.get(c.label) ?? []} />
        </div>
      ))}
    </div>
  );
}

function ScopeTrace({ samples }: { samples: number[] }) {
  const w = 400;
  const h = 24;
  if (samples.length < 2) return <svg className="eeg-scope-trace" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" />;
  // Auto-scale by the window's max-abs so every channel fills its row.
  const maxAbs = Math.max(1e-6, ...samples.map((v) => Math.abs(v)));
  const n = samples.length;
  const pts = samples
    .map((v, i) => `${(i / (n - 1)) * w},${h / 2 - (v / maxAbs) * (h / 2) * 0.9}`)
    .join(" ");
  return (
    <svg className="eeg-scope-trace" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <line className="eeg-scope-mid" x1="0" y1={h / 2} x2={w} y2={h / 2} />
      <polyline points={pts} fill="none" className="eeg-scope-line" />
    </svg>
  );
}
