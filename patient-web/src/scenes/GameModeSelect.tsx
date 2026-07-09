import { useState } from "react";
import { WaitingSpinner } from "./WaitingSpinner";

export type GameModeId = "garden" | "river" | "stars";

type GameMode = {
  id: GameModeId;
  title: string;
  icon: string;
  /** Only Garden Grow is wired up this round; the rest are UI placeholders. */
  available: boolean;
};

const MODES: GameMode[] = [
  { id: "garden", title: "Garden Grow", icon: "🌱", available: true },
  { id: "river", title: "River Rowing", icon: "🚣", available: false },
  { id: "stars", title: "Star Catcher", icon: "⭐", available: true },
];

/**
 * Post-calibration popup (spec §6 catalogue). The patient picks a game mode,
 * which outlines the chosen icon with a check, then confirms with a green
 * "I'm ready" gate mirroring the pre-calibration gate. Only Garden Grow is
 * selectable for now — the other two are visible-but-disabled placeholders.
 */
export function GameModeSelect(
  { onConfirm, clinicianReady = true }: { onConfirm: (id: GameModeId) => void; clinicianReady?: boolean },
) {
  const [selected, setSelected] = useState<GameModeId | null>(null);

  return (
    <main className="scene modeselect-overlay" data-testid="modeselect">
      <div className="modeselect-card">
        <h1 className="modeselect-title">Great work!</h1>
        <p className="modeselect-sub">
          You’ve completed calibration. Choose a game mode to continue.
        </p>

        <div className="modeselect-grid">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className="modeselect-mode"
              data-testid={`mode-${m.id}`}
              data-selected={selected === m.id}
              data-available={m.available}
              disabled={!m.available}
              aria-pressed={selected === m.id}
              onClick={() => setSelected(m.id)}
            >
              <span className="modeselect-icon">
                <span className="modeselect-glyph">{m.icon}</span>
                {selected === m.id && <span className="modeselect-check">✓</span>}
              </span>
              <span className="modeselect-label">
                {m.title}
                {!m.available && <small className="modeselect-soon"> Coming soon</small>}
              </span>
            </button>
          ))}
        </div>

        <button
          type="button"
          className="cal-ready-btn modeselect-ready"
          data-testid="mode-ready"
          disabled={!selected || !clinicianReady}
          onClick={() => selected && clinicianReady && onConfirm(selected)}
        >
          I’m ready
        </button>
        {selected && !clinicianReady && <WaitingSpinner label="Waiting for clinician…" />}
      </div>
    </main>
  );
}
