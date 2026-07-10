import { useRef } from "react";
import type { EegQualityStore } from "../scoring/eegQualityStore";
import { useEegQualityStore } from "./useEegQualityStore";

type Props = { qualityStore: EegQualityStore };

// Rolling window kept per channel so the scope "flows" instead of showing only
// the latest ~4-sample chunk the sidecar sends each quality frame (~5 Hz).
const MAX_SAMPLES = 500;

// Rainbow per-channel palette (red→magenta) so 8 stacked traces stay separable.
const RAINBOW = [
  "#e6544b", "#e8913a", "#e8c25a", "#5fbf8f",
  "#4bb3c9", "#4e8fe0", "#8a6ee0", "#d76fd0",
];

// Scientific 8-channel strip chart (montage-viewer norm) — one stacked row per
// EEG channel, mono labels, per-channel quality dot, thin auto-scaled trace in a
// rainbow scheme, over a navy field. A legend maps each colour to its channel +
// current peak-to-peak amplitude, with the trace window length.
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

  const colorOf = (i: number) => RAINBOW[i % RAINBOW.length];

  return (
    <div className="eeg-scope-wrap">
      <div className="eeg-scope">
        {latest.channels.map((c, i) => (
          <div className="eeg-scope-row" data-testid="eeg-scope-row" key={c.label}>
            <span className="eeg-scope-label" style={{ color: colorOf(i) }}>{c.label}</span>
            <span className={`dot dot--${c.quality}`} />
            <ScopeTrace samples={buffers.current.get(c.label) ?? []} color={colorOf(i)} />
          </div>
        ))}
      </div>
      <div className="eeg-scope-legend" data-testid="eeg-scope-legend">
        {latest.channels.map((c, i) => (
          <span className="eeg-legend-item" key={c.label}>
            <span className="eeg-legend-swatch" style={{ background: colorOf(i) }} />
            {c.label}<span className="eeg-legend-uv"> {c.p2p.toFixed(0)} µVpp</span>
          </span>
        ))}
        <span className="eeg-legend-scale">window ≈ 2 s · auto-gain / channel</span>
      </div>
    </div>
  );
}

function ScopeTrace({ samples, color }: { samples: number[]; color: string }) {
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
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
