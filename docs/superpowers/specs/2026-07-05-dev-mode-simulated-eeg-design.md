# Design — Session-gated Simulated EEG (Dev Mode)

**Date:** 2026-07-05
**Status:** Approved (brainstorming), pending implementation plan
**Author:** krishna + Claude

## Problem

There is no consolidated way to test the full clinician-console ↔ patient-web LAN
pipeline without a g.tec Unicorn headset. Today `signal-engine/run_ws_server.py`
is *already* a mock (`MockUnicornOutlet` + `drive_virtual_mi`), but:

1. It is spawned at Electron boot and streams a mindless 6 s-imagine / 3 s-rest
   ERD square wave **continuously, forever**, ignoring session state.
2. There is no explicit, discoverable "dev mode" — the mock is just the silent
   default with no way to distinguish it from a real-headset run.
3. The artificial data does not resemble a real rehab session arc.

We want a first-class **Simulated EEG (dev) mode**, selected from the console UI,
whose canonical data stream **activates only after a patient is selected and
Start Session is pressed**, and stops on End Session.

## Goals

- One toggle in the console selects **Simulated EEG (dev)** vs **Live headset**.
- In Simulated mode, an artificial EEG stream that **makes canonical sense**
  (a realistic session arc, not a square wave) drives the *unchanged* signal
  pipeline end-to-end: sidecar → IntentScore → LAN relay → patient-web gameplay.
- The simulated stream is **session-gated**: idle (flat rest) until Start
  Session, active during the session, idle again on End Session.
- No new WS protocol — reuse the existing inbound `cmd` dispatch.

## Non-goals

- Full runtime mock⇔real-inlet source switching in the sidecar (deferred; needs
  hardware to validate). Live is a thin, honestly-labelled branch — see §6.
- Any change to the 20 Hz `intent_score` frame contract or the `eeg_quality`
  frame. Both are untouched.
- Re-running ERD baseline calibration mid-session (boot calibration stands; §4).

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| How is dev mode selected? | **UI toggle** on the Setup screen (beside Start Session). |
| What does the artificial stream look like? | **Scripted session arc** (baseline → calibration → escalating MI trials → fatigue + artifacts). |
| Sidecar process lifecycle? | **Always-running, gated stream** — spawns at boot, idle until Start Session. |
| How deep does "Live" go? | **Thin branch + honest stub** — simulator off; try real `"Data"` stream; surface "no EEG source" if absent. No fake data, no hardware claim. |

## Architecture & data flow

```
Setup screen toggle ─IPC─► main.ts ─ctrl WS {"cmd":"start_session",source}─► sidecar
   (Simulated/Live)         start-session          SessionSimulator.arm()
                                                         │ drives
                                                   MockUnicornOutlet.inject_erd()
                                                         │ LSL (unchanged)
                                          [filter→CAR→gate→ERD→IntentScore] ─► relay ─► patient
```

Enabling fact: `NeuroReachWSServer` **already** has an inbound command dispatch
(`ws_server.py` `_dispatch`: `ping` / `get_status` / `set_mode`). We add
`start_session` / `end_session` entries — no new socket or protocol.

The sidecar stays always-running (spawns at boot as today) but **boots idle**:
the mock streams flat rest, the simulator is disarmed, and IntentScore sits near
the floor. The `start_session` command arms the simulator; `end_session`
disarms it back to flat rest.

## Components

Each unit has one purpose and a narrow interface.

### 6.1 `SessionSimulator` — `signal-engine/scoring/session_simulator.py` (new)

Owns the scripted-arc thread. Drives `MockUnicornOutlet` **only** — knows
nothing about WebSockets or the console. Replaces `drive_virtual_mi`
(which is deleted; its ERD-injection logic is absorbed and upgraded here).

Interface:

```python
class SessionSimulator:
    def __init__(self, outlet: MockUnicornOutlet, *, seed: int | None = None): ...
    def arm(self) -> None:      # start/replace the scripted-arc thread
    def disarm(self) -> None:   # stop the arc; mock returns to flat rest
    def status(self) -> dict:   # {"armed": bool, "phase": str, "elapsed_s": float}
```

- Idempotent: `arm()` while already armed restarts the arc from phase 0;
  `disarm()` while disarmed is a no-op.
- Single owning thread, `threading.Event` stop flag (mirrors `ScoringService`).
- When disarmed the mock produces only resting rhythm (its default), so
  IntentScore naturally floors — no explicit "zeroing" needed.

### 6.2 WS command hook — `signal-engine/server/ws_server.py`

Add an optional constructor param `session_controller=None` (any object exposing
`arm()` / `disarm()` / `status()` — generic, no mock knowledge). Add two dispatch
entries:

- `start_session` → `session_controller.arm()`, reply `{"type":"session","armed":true, ...status}`
- `end_session`   → `session_controller.disarm()`, reply `{"type":"session","armed":false, ...status}`

If `session_controller is None` (e.g. a real-headset run), both reply
`{"type":"error","message":"no session controller"}`. Unknown-command and
per-client-reply behaviour is unchanged; these replies are **never broadcast**.

### 6.3 Entrypoint rewire — `signal-engine/run_ws_server.py`

- Build `sim = SessionSimulator(outlet)` after the outlet starts.
- Delete the boot-time `drive_virtual_mi` thread and the `NEUROREACH_NO_MI`
  branch (replaced by session gating; `NEUROREACH_NO_MI` is removed).
- Pass `session_controller=sim` into `NeuroReachWSServer`.
- Baseline ERD calibration still runs at boot on clean rest — the simulator is
  disarmed at that point, so the 2 s baseline is clean (invariant preserved, see
  "Baseline-calibration invariant" below).
- `EEG_SOURCE=sim|live` env var (default `sim`) selects the source (§6.6). In
  `live`, the `MockUnicornOutlet` and `SessionSimulator` are not created; the
  inlet binds the real `"Data"` stream.

### 6.4 Control socket — `clinician-console/src/main/main.ts`

Open one persistent control socket to `ws://localhost:8765` for the app's life
(reuse the existing `nodeSidecarSocket` helper). Extend the IPC handlers:

- `start-session` handler: after `lan.startSession(session)`, if
  `session.source === "sim"` send `{"cmd":"start_session"}` on the control socket.
- `end-session` handler: send `{"cmd":"end_session"}`.

The control socket is independent of the patient relay (which only forwards
`intent_score` and never sends commands). Reconnects on drop like the relay.

### 6.5 Dev toggle — `PairingPanel.tsx` + preload + `SessionInfo`

The Start Session button lives in `PairingPanel.tsx` (rendered during the Setup
step), so the toggle sits **beside it**, where the session actually starts.

- Add a two-position control: **"Simulated EEG (dev)"** ⇄ **"Live headset"**,
  defaulting to Simulated. Local `useState`, disabled once a session is active.
- Extend `SessionInfo` (`src/main/lan/pairing.ts`) with `source: "sim" | "live"`.
- `PairingPanel.start()` passes the toggle value: `api.startSession({ ...session, source })`.
- `preload.ts` `startSession` already forwards the whole session object — no
  change needed there beyond the type.

### 6.6 Live branch — honest stub

- `EEG_SOURCE=live`: `run_ws_server.py` skips mock + simulator, binds
  `EEGInlet(stream_type="Data")`. If no real stream resolves within the inlet
  timeout, exit with a clear log line ("no EEG source: expected a live Unicorn
  `Data` stream") so the supervisor surfaces it rather than streaming fake data.
- The `source` flows from the toggle but the sidecar is spawned at boot before
  the toggle is read. For this task, **the sidecar always boots in `sim`**
  (env default); the Live toggle position sends its intent and, when a session
  is started in Live mode, `main.ts` does **not** arm the simulator — so no
  simulated data flows. Full boot-time / runtime source reconfiguration from the
  toggle is a documented follow-up (see "Follow-ups" below).

## The scripted "canonical" arc

`SessionSimulator`, once armed, walks these phases. All durations/depths are
module-level constants, tunable. It drives the mock via
`outlet.inject_erd(ch, band, start=0.0, duration, suppression)` (re-armed each
cycle, the proven `drive_virtual_mi` pattern) and `outlet.inject_spike(...)`.

1. **Settle** (~4 s) — clean rest, no ERD. C2 contact-quality reads good;
   IntentScore near floor.
2. **Calibration cueing** (~16 s) — alternating 4 s rest / 4 s imagine blocks
   with moderate, consistent ERD (suppression ≈ 0.75 mu, ≈ 0.6 beta on C3/C4).
   Mimics the cued calibration a real session opens with.
3. **Gameplay trials** (until `end_session`) — repeating cue → imagine → release
   cycle with realism:
   - ERD **ramps in** (ease-in ~0.8 s), plateaus with noise, releases — not
     instant on/off.
   - **Per-trial variability**: suppression depth jitters 0.6–0.9
     (success / partial / miss); inter-trial rest jitters ±1 s. IntentScore
     visibly varies trial to trial.
   - **Slow fatigue drift**: over minutes peak ERD depth decays (~10 %/min,
     floored) and cue→plateau latency grows.
   - **Occasional artifact**: `inject_spike` every ~30–45 s → exercises the
     AmplitudeGate and the `is_artifact` flag downstream.
4. **Disarm** (`end_session`) → immediate return to flat rest.

Result: patient-web gameplay looks like a real patient improving, tiring, and
occasionally twitching — not a square wave. Determinism: an optional `seed`
makes runs reproducible for tests.

## Baseline-calibration invariant

`ERDCalculator.calibrate_baseline()` must see clean rest (CLAUDE.md invariant).
Because the simulator is **disarmed at boot**, the 2 s baseline pull in
`build_scoring_service()` reads flat mock rest — clean by construction. No
reorder, no re-calibration on session start.

## Error handling

- **Control socket down** at Start Session: `main.ts` logs and the session still
  starts (pairing/QR still works); the simulator simply won't arm. A reconnect
  retries; a subsequent Start/End re-sends. (Dev tool — degrade, don't crash.)
- **`start_session` with no controller** (real-headset sidecar): per-client
  `error` reply; console ignores it.
- **Double arm / double disarm**: idempotent (§6.1).
- **Live, no stream**: sidecar exits with a clear message; supervisor's existing
  restart/`crashed` status surfaces it (bounded by `maxRestarts`).

## Testing

Python (pytest, `conda run -n eeg`):
- `SessionSimulator`: arm → phase progression over time (drive with a fake clock
  / short constants); disarm stops injection; idempotent arm/disarm; seeded
  determinism.
- `ws_server`: `start_session` / `end_session` route to a fake controller and
  return the `session` frame; `no controller` → `error`; existing 3 commands
  unaffected; frames not broadcast.
- Integration (existing `test:integration` style): boot sidecar idle → assert
  IntentScore floors → send `start_session` → assert score rises within N s →
  `end_session` → assert it floors again.

Console (Vitest):
- `PairingPanel`: toggle renders, defaults to Simulated, disabled during active
  session, and `startSession` is called with the selected `source`.
- `main.ts` IPC: `start-session` in `sim` sends `{"cmd":"start_session"}` on the
  control socket; `live` does not; `end-session` sends `{"cmd":"end_session"}`
  (fake control socket).
- No change to `eeg_quality` isolation or the `intent_score` parser (shared,
  byte-identical across console/patient — untouched).

## Files touched

New:
- `signal-engine/scoring/session_simulator.py`
- `signal-engine/tests/test_session_simulator.py`

Modified:
- `signal-engine/server/ws_server.py` (dispatch + `session_controller` param)
- `signal-engine/run_ws_server.py` (wire simulator, `EEG_SOURCE`, drop `drive_virtual_mi`)
- `clinician-console/src/main/main.ts` (control socket + IPC)
- `clinician-console/src/main/lan/pairing.ts` (`SessionInfo.source`)
- `clinician-console/src/renderer/PairingPanel.tsx` (toggle)
- Tests: `test_ws_server.py`, `PairingPanel.test.tsx`, `main`/sidecar IPC test
- `docs/todos.md` (per project rule)

## Follow-ups (out of scope)

- Full source reconfiguration from the toggle (boot-time or runtime mock⇔real),
  so Live actually rebinds the sidecar's inlet.
- Game-reactive simulation (stream responds to patient `game-event`s) — closes
  the loop both ways.
- Surface simulator phase/status in the console Live Monitor for demo narration.
