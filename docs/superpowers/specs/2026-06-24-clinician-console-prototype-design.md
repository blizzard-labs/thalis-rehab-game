# NeuroReach Clinician Console — Prototype Design (V2-0a: C3 Live Monitor)

**Date:** 2026-06-24
**Status:** approved — ready for implementation plan
**Relates to:** [`docs/specsv2.md`](../../specsv2.md) §2, §4, §9.5, §15 (V2-0 spike); wireframe screen **C3** (Live session monitor)

---

## 1. Goal

Prove the v2 transport spine end-to-end with the **least** code: synthetic EEG →
Python signal-engine sidecar → Electron desktop app rendering the **live IntentScore**
(wireframe C3, the hero screen). Everything must be verifiable headlessly against the
existing mock EEG source. This is the first slice of the V2-0 spike in specsv2 §15.

Success = an Electron window that, on launch, spawns the validated `run_ws_server.py`
sidecar (driven by `MockUnicornOutlet` + virtual MI driver), connects to its 20 Hz
WebSocket, and shows a live IntentScore that visibly rises during motor-imagery bursts —
with an automated test asserting exactly that behaviour.

## 2. Scope

**In:**
- Electron app under `clinician-console/` (TypeScript, React + Vite renderer).
- Electron **main** supervises the Python sidecar (spawn / readiness / bounded
  restart / kill-on-quit).
- Renderer: WS client, score parser, score store, **C3 Live Monitor** UI.
- Tests: Vitest unit (parser + store) and a Node integration test that boots the real
  sidecar with mock EEG and asserts live score behaviour.

**Out (deferred — named so reviewers know they are intentional gaps):**
PyInstaller freeze; LAN HTTPS/WSS server; session-code pairing + QR; WebRTC camera /
aiortc / MediaPipe; console screens C1, C2, C4, C5; electron-builder installer + cert
provisioning; a control channel (pause/rest/end-session wired back to the engine);
real patient/profile data layer.

## 3. Architecture

```
MockUnicornOutlet + virtual MI driver  (run_ws_server.py, conda env "eeg")
   → full DSP/scoring chain
   → ws://localhost:8765   JSON @ 20 Hz
      {"type":"intent_score","intent_score":<0..100>,"erd_score":<num>,
       "classifier_score":null,"is_artifact":<bool>,"mode":"band_power_only",
       "timestamp":<float>}

┌─ Electron MAIN (Node) ─────────────────────────────────────────┐
│  SidecarSupervisor — spawn `conda run -n eeg python             │
│    signal-engine/run_ws_server.py` (cwd = repo root);           │
│    readiness via stdout marker / port reachable;                │
│    bounded restart-on-crash (max 3); kill child on app quit.    │
│  main.ts — create BrowserWindow; start supervisor; relay status │
│  preload.ts — contextBridge `neuroreach.onSidecarStatus(cb)`    │
│    (contextIsolation on, nodeIntegration off)                   │
└────────────────────────────────────────────────────────────────┘
┌─ Electron RENDERER (React + TS + Vite) ────────────────────────┐
│  net/scoreClient.ts   — WS → localhost:8765, reconnect+backoff, │
│                          emits {frame} and {connectionState}    │
│  scoring/intentScoreMessage.ts — pure parse/validate → ScoreFrame│
│  scoring/scoreStore.ts — latest frame + rolling buffer (~5 s),  │
│                          status-text mapping                    │
│  ui/LiveMonitor.tsx   — C3 layout                               │
└────────────────────────────────────────────────────────────────┘
```

The renderer connects **directly** to `ws://localhost:8765` (the console monitoring its
own local sidecar). LAN fan-out to a patient device is a later V2-0b concern, not here.

## 4. Components

Each unit has one purpose, a typed interface, and is testable in isolation.

### 4.1 `main/sidecar.ts` — `SidecarSupervisor`
- **Does:** owns the lifecycle of the Python sidecar child process.
- **Interface:** `start(): void`, `stop(): Promise<void>`, `on('status', (s: SidecarStatus) => void)`.
  `SidecarStatus = { state: 'starting'|'ready'|'crashed'|'stopped', restarts: number, detail?: string }`.
- **Spawns:** `conda run -n eeg python signal-engine/run_ws_server.py`, `cwd` = repo root
  (conftest/path rules require repo-root cwd). Pipes stdout/stderr to a log + status detection.
- **Readiness:** emit `ready` when the WS port (8765) accepts a TCP connection (poll), with
  stdout scanned as a secondary signal. Port-probe is the source of truth (robust to log text changes).
- **Restart:** on unexpected exit, restart up to 3 times, then emit `crashed` and stop.
- **Quit:** `stop()` SIGTERMs the child (and process group) so no orphan Python survives.
- **Depends on:** `child_process`, `net` (port probe). No Electron import → unit-testable in plain Node.

### 4.2 `main/main.ts` + `main/preload.ts`
- main.ts: create `BrowserWindow` (contextIsolation true, nodeIntegration false), load the
  Vite renderer (dev server URL in dev, built `index.html` in prod), instantiate
  `SidecarSupervisor`, forward its status to the renderer via IPC, call `stop()` on
  `window-all-closed` / `before-quit`.
- preload.ts: `contextBridge.exposeInMainWorld('neuroreach', { onSidecarStatus })`.

### 4.3 `renderer/src/scoring/intentScoreMessage.ts`
- **Does:** parse a raw WS string into a validated `ScoreFrame` or return a typed error.
- **`ScoreFrame`:** `{ intentScore: number; erdScore: number|null; classifierScore: number|null;
  isArtifact: boolean; mode: string; timestamp: number }`.
- **Rules:** reject non-JSON; reject `type !== "intent_score"`; require numeric `intent_score`;
  pass through `null` classifier/erd; coerce `is_artifact` to boolean. Pure function, no I/O.

### 4.4 `renderer/src/scoring/scoreStore.ts`
- **Does:** hold the latest `ScoreFrame` + a rolling buffer (last ~5 s ≈ 100 frames), expose
  derived UI state: `latest`, `buffer`, `signalText` ('Good' | 'Artifact'), `subscribe()`.
- Pure TS (framework-agnostic core); a thin React hook wraps it for the component.

### 4.5 `renderer/src/net/scoreClient.ts`
- **Does:** manage the WS connection. Emits parsed frames and connection state
  (`connecting | open | reconnecting | closed`). Exponential backoff (cap ~5 s) on drop.
  Uses `intentScoreMessage` to parse; drops malformed frames (counted, not crashed).

### 4.6 `renderer/src/ui/LiveMonitor.tsx`
- C3 layout, warm-neutral on dark per wireframe console palette:
  - **Header:** patient placeholder (`Margaret R. · #0421` static), `REC` + elapsed timer,
    connection badge.
  - **Status tiles:** SIGNAL (Good / **Artifact** when `is_artifact`), MODE (`mode` value),
    CLASSIFIER CONF (`classifier_score` or `—` when null), FATIGUE (static `Watch` placeholder).
  - **Hero:** big **INTENT SCORE** number (0–100) + a small rolling trace from the buffer.
  - **Sub-scores:** mu/beta ERD% (`erd_score`), classifier sub-score.
  - **Controls:** Switch mode / Pause-rest / End-session rendered **disabled** with a
    "no control channel yet" note (honest stub).

## 5. Data Flow & Error Handling

- Normal: sidecar emits 20 Hz → scoreClient parses → store updates → LiveMonitor re-renders.
- WS drop: scoreClient → `reconnecting`, backoff; UI badge reflects it; resumes on reconnect.
- Malformed frame: parser returns error; scoreClient increments a dropped-count, keeps last good.
- Sidecar crash: supervisor restarts (≤3); status surfaced; on exhaustion UI shows fatal.
- conda/env missing: spawn error → `crashed` status with detail → UI shows actionable message.

## 6. Testing Strategy

### 6.1 Vitest unit (`clinician-console/renderer/.../*.test.ts`)
- `intentScoreMessage`: valid frame; missing `intent_score`; `null` classifier; `is_artifact` true;
  wrong `type`; malformed JSON; extra/unknown fields ignored.
- `scoreStore`: latest updates; buffer caps length and evicts oldest; `signalText` flips on artifact.

### 6.2 Node integration (`clinician-console/integration/sidecar.live.test.ts`)
- Boot the **real** sidecar (`conda run -n eeg python signal-engine/run_ws_server.py`, cwd repo root).
- Wait for port 8765, open a WS, collect frames for ~15 s.
- Assert: ≥100 frames; every frame parses as `intent_score`; `mode === "band_power_only"`;
  `classifier_score === null`; **score is non-flat** — `max(intentScore) - min(intentScore)` exceeds a
  threshold (mock virtual-MI bursts drive ERD), and `max(intentScore)` clears a floor (e.g. > 40).
- Teardown: kill the sidecar; assert no orphan.
- Marked slow/serial; skips cleanly with a clear message if the `eeg` conda env is absent
  (so unit tests still run in CI without the Python stack).

## 7. Repo / Tooling Notes

- New top-level `clinician-console/` (specsv2 §4.2 layout). `frontend-v2/` is an empty stub —
  fold this into `clinician-console/` or leave untouched per plan step.
- Vite + React + TS for renderer; Electron + electron main built with `tsc`/`esbuild`.
- Scripts: `dev` (Vite + Electron), `test` (Vitest unit), `test:integration` (Node + sidecar).
- electron-builder config is **not** added here (deferred to V2-4).

## 8. Acceptance Criteria

1. `npm run dev` in `clinician-console/` opens an Electron window; sidecar auto-starts;
   a live IntentScore is visible and changes over time from mock EEG.
2. Vitest unit suite passes.
3. Integration test passes: live frames well-formed and score rises during MI bursts.
4. Closing the window leaves no orphaned Python process.
5. WS drop / sidecar crash are surfaced in the UI, not silent.
