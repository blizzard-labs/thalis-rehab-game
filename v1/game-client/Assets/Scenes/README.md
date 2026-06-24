# NeuroReach Game Client — Scene Structure (MVP)

Three scenes, loaded in sequence. Transitions are driven by frames/commands
arriving over `ws://localhost:8765` from the Python `NeuroReachWSServer`
(`signal-engine/server/ws_server.py`). The plant/garden mechanics are spec §9
(Garden mini-game), the Intent Score wire format is spec §8 / the server module.

```
CalibrationScene ──(calibration complete marker)──▶ GardenScene ──(session_end)──▶ SummaryScene
```

## 1. CalibrationScene
- **Purpose:** runs while the Python pipeline does Graz-style MI calibration
  (CSP+LDA fit). No plant yet — calm "we're getting set up" screen.
- **Shows:** "Calibration in progress" text + a progress bar driven by a trial
  counter received over the socket.
- **Components:** `NeuroReachClient` (persisted across scenes via
  `DontDestroyOnLoad`, so the socket survives the scene load), a small
  calibration-progress UI script (TODO — reads calibration markers).
- **Transition:** when the *calibration complete* marker arrives, load
  `GardenScene`.
- **Open item:** the current intent_score frame carries no trial/marker field.
  The calibration progress + completion signal need a `MarkerMessage` frame
  type (or a marker field) added to the server. Until then this scene is a
  static placeholder. See `SessionSummaryController.RegisterTrialCompleted`.

## 2. GardenScene
- **Purpose:** the main game. Plant grows with the patient's Intent Score;
  blooms (particle burst) on a sustained high streak.
- **Components:**
  - `NeuroReachClient` — fills `IntentScoreBuffer.Shared` from the socket.
  - `GardenGrowController` — reads the buffer, drives `PlantGrowthModel`,
    applies scale to the plant transform, plays/stops bloom particles, updates
    the history slider and status text. Fires `OnFrameApplied` each frame.
  - `SessionSummaryController` — subscribes to `OnFrameApplied`, accumulates
    active time / best streak / trials completed (lives here so the running
    totals survive into the summary; can also be on a persisted object).
- **Transition:** when a `session_end` command is received, load `SummaryScene`.

## 3. SummaryScene
- **Purpose:** warm, non-comparative wrap-up (spec §9.3 — no raw % / letter grade).
- **Shows:** `SessionSummaryController.ShowSummary()` populates:
  - "You focused for X minutes"
  - "Your best streak was Y seconds"
  - "Great session!"
- **Transition:** back to CalibrationScene / main menu on user input.

## Cross-cutting notes
- **Single socket, persisted client.** `NeuroReachClient` should be on a
  `DontDestroyOnLoad` GameObject so the connection (and `IntentScoreBuffer.Shared`)
  persists across all three scenes. Don't create a second client per scene.
- **Connection status UI.** Any scene can poll the static
  `NeuroReachClient.ConnectionStatus` string to show "Connecting…",
  "Reconnecting (n/10)…", etc.
- **Scene wiring is editor work** (drag references into `[SerializeField]`
  slots, place ParticleSystem/Slider/TMP objects). The `.unity` scene assets
  are intentionally not committed here — they're built in the Unity editor.
