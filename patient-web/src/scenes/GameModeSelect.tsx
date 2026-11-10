import { useState } from "react";
import { WaitingSpinner } from "./WaitingSpinner";

import { games, gameNames, gameDetails, type Game } from "../practice/catalog";
export type GameModeId = Game;

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
          {games.map((id) => (
            <button
              key={id}
              type="button"
              className="modeselect-mode"
              data-testid={`mode-${id}`}
              data-selected={selected === id}
              data-available={true}
              aria-pressed={selected === id}
              onClick={() => setSelected(id)}
            >
              <span className="modeselect-icon">
                <span className="modeselect-glyph">{gameDetails[id].icon}</span>
                {selected === id && <span className="modeselect-check">✓</span>}
              </span>
              <span className="modeselect-label">
                {gameNames[id]}
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
