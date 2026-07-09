# Cross-App Checkpoint Gating — Design

**Date:** 2026-07-09
**Status:** Approved, pending implementation plan

## Problem

The clinician console and patient game advance through their own phases independently.
Nothing keeps them in lockstep, so a clinician can move ahead of the patient (or vice
versa). We want three checkpoint gates that block a button in one app until an action
happens in the other, each with a "waiting for …" affordance.

## Requirements

1. **Console Pair page → Continue** disabled until the patient presses **"Let's begin"**
   on their landing (Welcome) page.
2. **Console Calibrate page → "Continue to live"** disabled until the patient finishes the
   calibration phase (i.e. advances to the game-mode-select page).
3. **Patient mode-select → "I'm ready"** disabled until *both* (a) the patient has selected
   a game mode **and** (b) the clinician has pressed **"Continue to live"** on the console.
4. For every gate, while a button is disabled *waiting on the other app*, show a small
   rotating loading icon under it with text "Waiting for clinician…" / "Waiting for
   patient…". No spinner when the button is merely waiting on a *local* action (e.g. the
   patient has not yet picked a mode).

## Decisions

- **No-code / dev mode:** cross-app gating is active **only when paired** (a pairing code
  is present). A patient opened with no code has no console; gates fall back to
  local-action-only behavior with no clinician spinner.
- **"Skip" in CalibrateStep:** stays an ungated clinician escape hatch, but — like
  "Continue to live" — it also fires the `go-live` checkpoint so the patient is never
  stranded waiting for a signal that never comes.

## Topology (existing, unchanged)

```
patient-web  ⇄  LanServer (Electron main)  ⇄  signal-engine sidecar
                     ⇅ IPC (window.neuroreach preload)
                clinician-console renderer
```

- The console **renderer never connects to the LAN server directly** — it talks to main
  over IPC and to the sidecar for scores.
- The patient rides one paired LAN socket. The server already routes `webrtc-*` → sidecar
  and emits `game-event`; it is the natural carrier for new checkpoint messages.

## Design

### 1. Checkpoint contract (both packages, byte-identical types)

New messages on the paired patient↔server socket, kept separate from WebRTC signaling:

- Patient → clinician:
  `{ type: "patient-checkpoint", checkpoint: "session-begin" | "calibration-complete" }`
- Clinician → patient:
  `{ type: "clinician-checkpoint", checkpoint: "go-live" }`

A small `checkpoint.ts` module in each package defines the union + a type guard
(mirroring `signaling.ts`). The two copies must stay identical.

### 2. State authority — LanServer (main)

Session-scoped flags held in `LanServer`: `patientBegan`, `patientCalibrated`,
`clinicianLive`. This makes the flags survive a console reload or patient reconnect.

- On `patient-checkpoint` from the patient socket → set the matching flag, emit an IPC
  event (`patient-checkpoint`) to the renderer.
- On a clinician `go-live` from the renderer (via IPC) → set `clinicianLive`, forward the
  message to the patient socket.
- On patient (re)pair → replay `clinicianLive` (if set) to the freshly paired socket.
- On renderer request (`getCheckpointState` IPC) → return the current flag snapshot.
- On `endSession` / new session mint → reset all three flags.

### 3. patient-web wiring

- `usePatientLink` gains:
  - `notify(checkpoint)` — send a `patient-checkpoint` over the socket (no-op when no code).
  - reactive `clinicianLive: boolean` — set true when a `clinician-checkpoint: go-live`
    arrives. A dedicated subscription, **not** entangled with `subscribeSignaling`
    (WebRTC) so the camera publisher is untouched.
- `App.tsx`:
  - `WelcomeScene.onBegin` → `setView("calibration")` **and** `link.notify("session-begin")`.
  - `CalibrationScene.onComplete` → `setView("modeselect")` **and**
    `link.notify("calibration-complete")`.
  - Pass `clinicianLive` (gated on `code` presence) into `GameModeSelect`.
- `GameModeSelect`: new `clinicianReady: boolean` prop. "I'm ready" disabled unless
  `selected && (clinicianReady || noCodeMode)`. Spinner + "Waiting for clinician…" shown
  when `selected && !clinicianReady && codeMode`.

### 4. clinician-console wiring

- `preload.ts`: expose `onPatientCheckpoint(cb)`, `sendClinicianCheckpoint(name)`,
  `getCheckpointState()` on `window.neuroreach`.
- `main.ts`: forward `LanServer` `patient-checkpoint` events to `webContents.send`; add
  `ipcMain.handle` for send + snapshot; reset on session lifecycle.
- A renderer hook (e.g. `useCheckpoints`) subscribes to patient checkpoints, hydrates from
  the snapshot on mount, and exposes `patientBegan`, `patientCalibrated` + a
  `sendClinicianCheckpoint` wrapper. Wired through `SessionFlow`.
- `PairDeviceStep`: Continue disabled until `patientBegan`; spinner + "Waiting for
  patient…" while disabled.
- `CalibrateStep`: "Continue to live" disabled until `patientCalibrated`; spinner +
  "Waiting for patient…" while disabled. Both "Continue to live" **and** "Skip" call
  `sendClinicianCheckpoint("go-live")` before advancing. "Skip" is never disabled.

### 5. Spinner affordance

A small reusable presentational component in each package: a rotating icon (CSS
`@keyframes spin`, respecting `prefers-reduced-motion`) plus a label. Rendered under the
gated button only while it is disabled *pending the other app*.

## Testing

- **Contract:** `checkpoint.ts` type-guard unit tests in both packages; assert the two
  copies are identical (same guard as `intentScoreMessage`).
- **LanServer:** patient-checkpoint sets flag + emits; clinician go-live forwards to
  patient + persists; replay on re-pair; reset on endSession. Unit tests.
- **patient-web:** `GameModeSelect` gate on `selected && clinicianReady`; spinner
  visibility; `App` fires `notify` at the two transitions; no-code bypass. Component tests.
- **clinician-console:** `PairDeviceStep` / `CalibrateStep` disabled states + spinner;
  Skip and Continue both fire go-live. Component tests.
- Keep both packages' full suites green; `tsc --noEmit` clean; production builds pass.

## Out of scope

- Persisting checkpoint history to session records.
- Any change to score/quality/vision frames.
- Multi-patient / multi-console sessions (single paired socket only).
