# Design — Clinician Console Session-Workflow Overhaul

**Date:** 2026-07-05
**Status:** Approved (brainstorming), pending implementation plan
**Author:** krishna + Claude
**Related:** [`2026-07-05-dev-mode-simulated-eeg-design.md`](2026-07-05-dev-mode-simulated-eeg-design.md) (the session-gated simulator this wires into a coherent UI)

## Problem

The clinician console's live-session workflow is confusing and partly broken:

- Clicking a patient lands on the **tabbed workspace (History tab)**, not a session
  start. The Setup screen (where the Sim/Live toggle + pairing live) is only
  reachable via a "Start session ▶" button, and renders the pairing panel **only
  if `window.neuroreach` exists** — so viewing the Vite URL in a plain browser
  shows no toggle and no pairing UI at all.
- **"Next: Calibration ▶"** jumps straight to the Live Monitor (`Setup.tsx` →
  `workspace/live`); there is no calibration step.
- Live Monitor's footer controls are **hardcoded `disabled`** with a stale note
  ("control channel lands in V2-0b") — but the control channel now exists.
- In dev, patient-web auto-connects to `localhost:8765`, so the score syncs
  **without pairing**, making the LAN pairing feel absent/optional.

Spec §10.1 intends: don headset → **check signal** → **pair patient device (QR)**
→ confirm profile/mode → **calibrate** → gameplay/live monitor. The current UI
collapses/skips most of that and buries pairing.

## Goals

- A **guided session stepper**: Signal check → Pair device → Calibrate → Live,
  with a visible progress header. Pairing is **always visible, never hard-gated**.
- The **Simulated EEG / Live headset** toggle and the **pairing (code/QR +
  connection status)** are first-class, discoverable steps.
- Live Monitor controls **wired to the real control channel**: End session +
  Switch mode (capability-gated); Pause/rest honestly disabled.
- **Sim arms on entering Live**, not at pairing — so signal check and pairing run
  on flat rest (correct for a contact check).
- A **cohesive visual polish pass** (no new theme).
- Graceful behavior when run outside Electron (no silent blank).

## Non-goals

- Real marker-driven calibration (needs the LSL-marker → browser bridge; the
  Calibrate step is an honest placeholder).
- A Pause/rest engine command (deferred).
- Camera-link health / framing check / WebRTC (V2-2 vision pipeline).
- A new visual theme / full redesign of all five screens.
- Any change to the `intent_score` or `eeg_quality` wire contracts.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Workflow shape | **Guided session stepper**; tabs become the between-sessions review view. |
| Pairing gate | **Always show pairing, don't hard-gate** — can proceed to Live before a patient pairs; dev localhost still works. |
| Calibrate step | **Honest skippable placeholder** ("abbreviated — full block with the marker bridge"). |
| Live controls to wire | **End session + Switch mode** (Switch mode capability-gated on a loaded classifier). Pause/rest stays disabled. |
| Visual scope | **Cohesive polish pass**, no new theme. |
| Sim-arm timing | **On entering Live** (decoupled from pairing). |

## Architecture & routing

`App.tsx` gains one view and drops `setup`:

```
roster ──click patient──► workspace (tabs: History/Protocol/Assessments)
                              │  "Start session ▶"
                              ▼
                        session { id, step }   step ∈ signal | pair | calibrate | live
                              │  End session
                              ▼
                        workspace (History)
```

The session flow is a distinct view with an internal step machine. A persistent
progress header renders the four steps with the current one active; Back/Next
navigate; every step can advance (pairing not hard-gated).

## Components

Each unit has one purpose and a narrow interface.

### 6.1 `SessionFlow.tsx` (new) — stepper shell

Owns the stepper chrome + progress indicator, renders the current step, and holds
navigation (`next`/`back`/`goTo`). Consumes `useSession` for session state and
lifecycle actions. Props: `{ patient, api, onExit }`.

### 6.2 `useSession.ts` (new hook) — session state + actions

Single source of truth for a live session. Wraps `window.neuroreach`.

```ts
type SessionApi = {
  open(session: SessionInfo): Promise<{ code: string; url: string }>; // mint code, NO arm
  begin(source: SessionInfo["source"]): Promise<void>;                // arm sim (sim only)
  end(): Promise<void>;                                               // disarm + end pairing
  setMode(mode: "band_power_only" | "csp_lda_blend"): Promise<void>;
  onPatientConnected(cb: () => void): void;
  onPatientDisconnected(cb: () => void): void;
};

type UseSession = {
  source: "sim" | "live";
  setSource(s: "sim" | "live"): void;
  code: string | null;
  url: string | null;
  connected: boolean;
  bridgeReady: boolean;   // false when window.neuroreach absent (plain browser)
  open(patient): Promise<void>;
  begin(): Promise<void>;
  end(): Promise<void>;
  setMode(mode): Promise<void>;
};
```

When `bridgeReady === false`, the actions are no-ops and `SessionFlow` shows a
"needs the desktop app" notice instead of silently rendering nothing.

### 6.3 Step components

- **`SignalCheckStep.tsx`** (refactor of `Setup.tsx`) — electrode-contact map +
  live C3/Cz/C4 trace (from the `eeg_quality` frame, unchanged) + the
  **Simulated EEG / Live headset** toggle + a confirm-affected-side/mode line.
  The toggle sets `useSession.source`.
- **`PairDeviceStep.tsx`** (refactor of `PairingPanel.tsx`) — **Start Session**
  calls `useSession.open()` (mint code); shows QR + code, live
  **"Waiting for patient… / ✓ Patient connected"**, a camera-live placeholder,
  and a **"Dev: patient on this machine (localhost)"** note. A **Continue** button
  advances regardless of pairing.
- **`CalibrateStep.tsx`** (new) — honest placeholder card + **Skip / Continue**.
- **`LiveStep.tsx`** (new) — on mount calls `useSession.begin()` (arms the sim in
  sim mode); wraps `LiveMonitor`, passing `onEndSession`, `onSwitchMode`, and the
  control-capability flags.

### 6.4 `LiveMonitor.tsx` (modify)

Un-hardcode the footer. New props: `onEndSession?()`, `onSwitchMode?(mode)`,
`canSwitchMode: boolean` (true only when a classifier is loaded — derived from the
score frame's `classifier_score != null` / `mode`). **End session** wired;
**Switch mode** enabled only when `canSwitchMode`, else greyed with a tooltip;
**Pause/rest** disabled with an honest "not yet" note. Remove the "V2-0b" string.

### 6.5 Main / IPC — decoupled session lifecycle

`main.ts`, `preload.ts`, `sessionControl.ts`:

- `session:open` → `lan.startSession(session)` → `{code,url}`. **Mints only — no
  arm** (remove the current auto-arm from `start-session`).
- `session:begin` → `sessionControlCommand(source, "start")` over the control
  socket → arms the sim (sim source only; live is a no-op).
- `session:end` → `end_session` cmd + `lan.endSession()`.
- `session:set-mode` → `{cmd:"set_mode", mode}` over the control socket.

`preload.ts` exposes `open`/`begin`/`end`/`setMode` on `window.neuroreach`
(renaming the current `startSession`/`endSession`). `sessionControlCommand` keeps
its `(source, action)` shape; a small `setModeCommand(mode)` is added.

> Migration note: the current `start-session`/`end-session` IPC names and the
> `PairingPanel` `startSession(session)` call are replaced by the `session:*`
> handlers + `useSession`. Update the existing `PairingPanel`/`App` tests
> accordingly (they move into the step components).

## Data flow — a session

```
SignalCheckStep: toggle source (sim/live), stream = flat rest (sim idle)
      │ Next
PairDeviceStep: open() → mint code+QR; patient connects (LAN or localhost); status ✓
      │ Continue
CalibrateStep: Skip/Continue (placeholder)
      │ Next
LiveStep mount → begin(source) → sim armed → IntentScore climbs → LiveMonitor
      │ End session → end() → sim disarmed + pairing closed → workspace
```

## Error handling

- **No `window.neuroreach`** (plain browser): `bridgeReady=false` → SessionFlow
  shows a desktop-app notice; Start/arm disabled. No silent blank.
- **Control socket down** at begin/end: degrade (existing auto-reconnect); the
  flow still navigates; a subsequent begin/end re-sends.
- **Switch to `csp_lda_blend` with no classifier**: prevented — Switch mode is
  capability-gated, so an invalid mode is never sent.
- **End from Live before pairing**: safe — `end()` disarms (harmless if never
  armed) and ends an empty pairing.

## Testing (Vitest)

- `useSession`: `open`/`begin`/`end`/`setMode` call the correct IPC with correct
  args; `bridgeReady=false` when `window.neuroreach` absent → actions no-op.
- `SessionFlow`: step navigation (next/back/goTo), progress header reflects step,
  End returns to workspace, desktop-app notice when bridge absent.
- `SignalCheckStep`: renders contact map/trace from a seeded quality store;
  toggle defaults to `sim` and updates source.
- `PairDeviceStep`: Start Session shows code/QR; connection status flips on the
  patient-connected callback; Continue advances without a paired patient.
- `CalibrateStep`: Skip and Continue both advance.
- `LiveStep` / `LiveMonitor`: `begin()` fired on mount; End button calls
  `onEndSession`; Switch mode disabled when `canSwitchMode=false`, enabled +
  calls `onSwitchMode` when true; Pause/rest disabled.
- `sessionControl` + main IPC: `session:open` mints without arming;
  `session:begin` arms in sim only; `session:end` disarms + ends;
  `session:set-mode` sends `set_mode`.
- Contract guard: `intent_score`/`eeg_quality` parsers untouched; `eeg_quality`
  still never forwarded to the patient (existing `lan.live` test stands).

## Files touched

New:
- `clinician-console/src/renderer/SessionFlow.tsx` (+ test)
- `clinician-console/src/renderer/useSession.ts` (+ test)
- `clinician-console/src/renderer/CalibrateStep.tsx` (+ test)
- `clinician-console/src/renderer/LiveStep.tsx` (+ test)

Modified / renamed:
- `Setup.tsx` → `SignalCheckStep.tsx` (add toggle + side/mode confirm)
- `PairingPanel.tsx` → `PairDeviceStep.tsx` (Continue + dev note + status)
- `LiveMonitor.tsx` (wired footer + capability flag)
- `App.tsx` (session view + routing; drop `setup`)
- `main.ts`, `preload.ts`, `sessionControl.ts` (decoupled `session:*` IPC)
- `console.css` (stepper chrome + polish)
- Tests: `Setup.test.tsx`, `PairingPanel.test.tsx`, `App.test.tsx` migrate to the
  new components; `sessionControl.test.ts` extended.
- `docs/todos.md` (project rule).

## Follow-ups (out of scope)

- Real marker-driven calibration once the LSL-marker → browser bridge exists.
- Pause/rest engine command + resume.
- Camera-link health panel + framing check (V2-2).
- Surface `set_mode`/`session` control-socket ack replies in the console (read
  the control socket's inbound frames) for richer feedback.
