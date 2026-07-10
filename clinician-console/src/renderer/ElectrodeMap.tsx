import type { ChannelQuality } from "../scoring/eegQualityMessage";

// 10-20 scalp positions (normalized) for the 8 Unicorn EEG channels. Shared by
// the Signal-check step and the live-monitor EEG panel.
const POSITIONS: Record<string, { x: number; y: number }> = {
  Fz: { x: 0.5, y: 0.18 }, C3: { x: 0.28, y: 0.42 }, Cz: { x: 0.5, y: 0.42 },
  C4: { x: 0.72, y: 0.42 }, Pz: { x: 0.5, y: 0.66 }, PO7: { x: 0.33, y: 0.8 },
  Oz: { x: 0.5, y: 0.88 }, PO8: { x: 0.67, y: 0.8 },
};

type Props = {
  channels: ChannelQuality[];
  showLegend?: boolean;
  compact?: boolean;
};

// Scalp electrode contact map — colored by per-channel contact quality.
export function ElectrodeMap({ channels, showLegend = true, compact = false }: Props) {
  return (
    <div className={compact ? "electrode-wrap electrode-wrap--compact" : "electrode-wrap"}>
      <div className={compact ? "electrode-map electrode-map--compact" : "electrode-map"} role="group" aria-label="electrode contact map">
        <div style={{ position: "absolute", inset: 8, border: "2px solid #3a4760", borderRadius: "50%" }} />
        {channels.map((c) => {
          const pos = POSITIONS[c.label] ?? { x: 0.5, y: 0.5 };
          return (
            <div key={c.label} className={`electrode ${c.quality}`}
              style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }}
              title={`${c.label}: ${c.quality} (${c.p2p.toFixed(0)} µVpp)`}>
              {c.label}
            </div>
          );
        })}
      </div>
      {showLegend && (
        <div className="legend">
          <span><span className="dot" style={{ background: "var(--good)" }} /> Good</span>
          <span><span className="dot" style={{ background: "var(--check)" }} /> Check</span>
          <span><span className="dot" style={{ background: "var(--poor)" }} /> Poor</span>
        </div>
      )}
    </div>
  );
}
