# NeuroReach — Development Status & TODOs

_Last updated: 2026-07-03. Reference spec: [`docs/specs.md`](specs.md). Game design docs:
[`gardengrow.md`](gardengrow.md), [`reachcollect.md`](reachcollect.md)._

This is the **whole-project** status board across all three subsystems. Each subsystem section lists
what is **implemented ✅**, the **tests that exist 🧪**, **missing capabilities ⚠️**, and **tests still
lined up 🔜**. Detailed change history lives in git + claude-mem, not here.

## Status at a glance

| Subsystem | State | Tests |
|---|---|---|
| `signal-engine/` (Python DSP + scoring + WS) | Core complete, mock/synthetic-validated; on-head validation pending | **59 passed, 6 skipped** (skips = opt-in live/on-head) |
| `clinician-console/` (Electron + React, C1–C5 + LAN pairing) | UI complete on mock/in-memory data; no engine control channel or persistence yet | **88 passed** (25 files) + 2 live integration |
| `patient-web/` (React + Vite patient game) | Welcome→Calibration→Garden/StarCatch→Summary + pairing gate; EEG-only | **58 passed** (19 files) + 2 live integration |

**Milestone map (spec §15):** V2-0 foundation ✅ · V2-1 patient web ✅ · S1 LAN + pairing ✅ · **V2-2 remote
camera/WebRTC ⏳ next** · V2-3 clinical workflow ⏳ · V2-4 packaging/hardening ⏳.

**The single biggest gap is the vision pipeline** (WebRTC → aiortc → MediaPipe → `kinematic_score`). Every
Blended/Active-mode feature, verified-ROM gameplay, covert-MI validity gating, and compensation penalty
is blocked on it. Everything shipped so far is **EEG-only (Mode A, band-power)**.

Run all tests:
```bash
conda run -n eeg python -m pytest signal-engine/tests/   # 59 passed, 6 skipped
cd patient-web        && npm run test                     # 58 passed
cd clinician-console  && npm run test                     # 88 passed
```

---

## 1. `signal-engine/` — Python real-time service

The end-to-end real-time path runs live and meets the MVP latency target:
`Unicorn HW → LSL bridge → DCOffsetRemover → CausalFilterChain (notch+bandpass) → CAR → gates →
ERDCalculator (+CSP/LDA when reliable) → IntentScore fusion → 20 Hz WebSocket`.

### ✅ Implemented
- **Acquisition** (`acquisition/`): `EEGInlet.get_chunk()` single aligned EEG+IMU pull; label-based +
  **positional fallback** for the real Unicorn bridge (type `Data`, no XML labels). `MockUnicornOutlet`
  17-ch synthetic stream with `inject_erd()` / `inject_spike()` + virtual-MI driver.
- **Preprocessing** (`preprocessing/`): `CausalFilterChain` (persistent-SOS causal) + offline `filtfilt`
  path; `DCOffsetRemover` (latched constant, no IIR re-excitation); `common_average_reference`;
  `AmplitudeGate` + `MovementGate` (run on **raw** pre-CAR data).
- **Features** (`features/`): Welch band power; `ERDCalculator` (per-channel/band ERD% vs calibrated
  baseline) + `laterality_index`.
- **Calibration** (`calibration/`): `CalibrationOrchestrator` (Graz cue-paced block, `perf_counter`
  deadlines, balanced ≤3-run trial order, clean abort) → `CalibrationDataset`; `marker_outlet`
  (`NeuroReach-Markers`, canonical `"label|{json}"`); `epoch_extractor` (`extract_epochs_from_dataset`,
  `label_encode`).
- **Classifiers** (`classifiers/`): `CSPLDAClassifier` (offline filtfilt → CSP≤4 → shrinkage-LDA,
  `StratifiedKFold(5)`, §6.5 CV gate ≥0.60, joblib save/load with encoder); `OnlineClassifier`
  (`predict_proba` / `mi_score` 0–100).
- **Scoring** (`scoring/`): `RingBuffer` (front-zero-padded windows); `IntentScoreEngine` (ERD +
  classifier blend, MODE A `0.4·ERD+0.6·clf`, per-session adaptive min-max, EMA α=0.15, artifact freeze);
  `ScoringService` (threaded pipeline, separate raw-gate buffer, non-blocking `output_queue`);
  `signal_quality` (per-channel good/check/poor + MI trace → `eeg_quality` frame at 5 Hz).
- **Server** (`server/`): `NeuroReachWSServer` (asyncio, thread-safe queue drain, 20 Hz broadcast
  decoupled from producer, `ping`/`get_status`/`set_mode` dispatch, graceful client drop). `intent_score`
  frame is byte-stable; `eeg_quality` on its own message type.

### 🧪 Tests available (`signal-engine/tests/`, 65 collected)
| File | # | Covers |
|---|---|---|
| `test_lsl_inlet.py` | 8 | channel ID, permuted slicing, chunk shape/dtype, IMU, positional fallback, timeout |
| `test_preprocessing.py` | 12 | notch/bandpass, chunked==single-call causal, CAR, gates, DCOffsetRemover latch/reset |
| `test_erd.py` | 6 | ERD on injected channel, laterality sign, pre-cal guard, band-power shape |
| `test_calibration.py` | 5 | dataset shape/balance/no-long-runs, wall-clock timing, clean abort, `label_encode` |
| `test_classifier.py` | 8 | strong-pattern CV>0.65, noise gate `is_reliable=False`, save/load round-trip, `mi_score∈[0,100]` |
| `test_scoring_service.py` | 6 | smoke ≥40 results/3 s, spike suppression, EMA visible, `stop()` join, full-queue drop |
| `test_signal_quality.py` | 5 | per-channel classification + MI trace frame |
| `test_ws_server.py` | 9 | connect, broadcast rate, schema, multi-client parity, disconnect/reconnect, ping, unknown cmd |
| `test_live_unicorn.py` | 6 | **skipped** unless `THALIS_LIVE_UNICORN=1` — stream metadata, live EEG/IMU, p95 latency, end-to-end |

Latency validated off-head: **p95 ≈ 18 ms** (budget 250 ms), compute-only ≈ 1.5 ms.

### ⚠️ Missing capabilities
- **Vision pipeline absent** — no `vision/` module, no aiortc receive, no MediaPipe, no `kinematic_score`.
  Fusion runs EEG-only (`w_kin=0`). Blocks Modes B/C, covert-MI validity gate, compensation penalty.
- **60 s baseline-rest block** not built (orchestrator collects MI trials only).
- **Per-patient versioned filter persistence** to disk not built (CSP/LDA fit in-memory only).
- **Dead-channel handling** — off-head flat electrodes need a per-channel quality flag feeding the
  console "Check Cz contact" indicator (partially covered by `signal_quality`, not wired to a hard flag).
- **Engine control channel** — `set_mode` exists, but pause/rest/end/switch-mode commands from the
  console are not wired to the running engine.
- **FastAPI + SQLite/EDF persistence layer** (spec §11) not built.
- **pytest markers** — live tests gated by env var, not a `-m live` marker; markers unregistered (warns).
- **On-head numbers unverified** — µV amplitude and ERD magnitude were measured off-head (floating-
  electrode noise); do NOT trust until re-run on-head.

### 🔜 Tests still lined up
- On-head signal quality + ERD magnitude (un-skip `test_signal_quality_on_head_TODO`): µV 10–100, mu-ERD
  >15% at C3, contralateral laterality. **Blocker:** cap worn.
- Real on-head CSP+LDA cross-val accuracy (H2).
- Wire `test_live_unicorn.py` through `EEGInlet` instead of the local `_LiveUnicorn` shim.
- 60 s baseline-rest + per-patient filter versioning tests.
- Offline replay / regression harness (needs a stored raw EEG+pose corpus).
- Vision: MediaPipe joint-angle vs goniometer ground-truth; remote aiortc-stream parity; frame-drop /
  camera-deny → EEG-only fallback.
- Full-pipeline latency-to-client budget (EEG → WSS → render).

---

## 2. `clinician-console/` — Electron + React

Electron main spawns/supervises the Python sidecar and hosts the LAN server; the React renderer is the
five-screen console. Data is **mock/in-memory** (seeded roster), no persistence.

### ✅ Implemented
- **Sidecar supervision** (`src/main/sidecar.ts`) — spawns `conda run -n eeg python run_ws_server.py`,
  health/teardown, no orphan process.
- **LAN server** (`src/main/lan/`): `lanServer` (HTTPS static serve of `patient-web/dist` + `ws` on one
  port, **LAN-IP-only bind**, **Origin allowlist**); `cert` (self-signed TOFU, `selfsigned@2.x`);
  `pairing` (`SessionPairing`: 6-char confusable-free code, single active session, single-claimant bind,
  TTL); `scoreRelay` (forwards **only `intent_score`** to the patient); `signaling` (WebRTC SDP/ICE relay
  **contract + echo stub** — real aiortc peer is V2-2); `netUtil` (LAN-IPv4 detection). Wired via
  `config.ts` (`LAN_PORT=8443`), `main.ts` (start/end-session IPC), `preload.ts` (`window.neuroreach`).
- **Renderer C1–C5**: `Roster` (C1 searchable worklist) · `Setup` (C2 electrode map + live C3/Cz/C4 trace
  from the `eeg_quality` frame) · `LiveMonitor` (C3 score + 8-ch quality strip + sub-tiles) · `HistoryTrends`
  + `Assessments` (C4 KPI tiles, proxy-vs-clinical chart, clinical-scales table + CSV export) ·
  `ProtocolEditor` (C5 mode/weight, reach axis, trial structure, mini-games). Shell `App.tsx` view router
  (roster → setup → tabbed workspace); `PatientStore` in-memory seed.
- **PairingPanel** (`renderer/PairingPanel.tsx`) — on the **Setup** screen: Start Session → QR (`qrcode`)
  + code + "✓ Patient connected"; session identity from the selected patient.
- **Shared parsers** (`src/scoring/`) — `intentScoreMessage` (byte-identical to patient-web),
  `eegQualityMessage`, `scoreStore`, `eegQualityStore`; `net/scoreClient` WS adapter.

### 🧪 Tests available (25 files, 88 unit + 2 live integration)
- **Renderer:** `App`, `Roster`, `Setup`, `LiveMonitor`, `HistoryTrends`, `Assessments`, `ProtocolEditor`,
  `PatientWorkspace`, `PairingPanel`.
- **Main/LAN:** `lanServer` (headless integration: fake sidecar → two mock WSS clients — pairs,
  single-claimant `session_taken`, `eeg_quality` never forwarded, bad code, foreign-origin rejected),
  `cert`, `pairing`, `scoreRelay`, `signaling`, `netUtil`, `lanConfig`, `sidecar`.
- **Data/scoring:** `store`, `selectors`, `scoreStore`, `eegQualityStore`, `intentScoreMessage`,
  `eegQualityMessage`, `scoreClient`, `sanity`.
- **Integration** (`integration/`, real sidecar): `sidecar.live` (asserts `intent_score` + `eeg_quality`
  frames); `lan.live` (real mock-EEG sidecar → `LanServer` → Node WSS client pairs, receives >100 real
  `intent_score` frames, **zero `eeg_quality` leakage**, second-claimant rejected). Runs serially
  (`fileParallelism:false`) so two sidecars never race on port 8765.
- Verification gates: `build:main` + `build:renderer` clean.

### ⚠️ Missing capabilities
- **No engine control channel** — Switch mode / Pause / End buttons are disabled; no command path to the
  running engine.
- **No persistence** — all data is in-memory mock; real records need the sidecar FastAPI + SQLite layer
  (spec §11), not built.
- **WebRTC signaling is an echo stub** — no real aiortc peer, no camera-link health panel (V2-2).
- **"Offline-OK" badge is a static label**, not a live LAN/patient-connection indicator.
- **Game scenes still read `localhost:8765`** — a remote paired device pairs, but the paired LAN socket
  isn't yet wired into the game scenes, so remote gameplay visuals don't follow the score.
- No login / role separation (spec §11.2) implemented.

### 🔜 Tests still lined up
- Control-channel command round-trip (console → engine → ack) once built.
- Persistence layer (FastAPI/SQLite) CRUD + EDF/PDF export.
- Camera-link health panel + "vision degraded → EEG-only" state.
- Physical second-device browser smoke over the LAN (scan QR, accept TOFU cert, see score animate) —
  needs real hardware; the headless `lan.live.test.ts` proves the score-fan-out + pairing spine.

---

## 3. `patient-web/` — React + Vite patient game

Scene machine `Welcome → Calibration → GameModeSelect → Garden / StarCatch → Summary`, with a `Pairing`
gate when a `?c=<code>` session code is present. **EEG-only**; camera overlay is a local `getUserMedia`
preview, not yet published to the clinic.

### ✅ Implemented
- **Scenes** (`src/scenes/`): `WelcomeScene` (P1 greeting) · `CalibrationScene` (P2 client-timed Graz cue
  sequencer — **cosmetic**, no marker bridge; clinician pre-cal "I'm ready" gate; blinking REC dot) ·
  `GameModeSelect` (Garden live; River disabled; Star Catcher live) · `GardenScene` (P3 illustrated
  full-bleed SVG flower, focus meter, status banner, camera overlay) · `StarCatchScene` (P4 reach avatar
  toward star ROM target) · `SummaryScene` (P6 warm non-comparative recap) · `PairingScene` ("Connecting
  to your session…" → advances on `paired`). `CameraFeed` selfie preview + REC.
- **Warm-up 3D hand viz** (`src/warmup/`): dual Shadow-Hand capsule renders (R3F v8/drei v9 pinned for
  React 18); affected side animates neutral→open→loop; pure motion logic TDD'd; `Canvas` mocked in jsdom.
- **Logic layer** (fully unit-tested): `garden/PlantGrowthModel` (verbatim C# port: grow 0.8/s, wilt
  0.3/s, 3 s bloom dwell, 0.75/0.60 hysteresis) · `reach/ReachModel` (adaptive staircase band 0.55–0.9) ·
  `scoring/intentScoreMessage` (shared `ScoreFrame` contract, byte-identical to console) · `scoring/scoreStore`
  (circular buffer, latest/recentAverage/streak) · `net/scoreClient` (WSS reconnect + backoff) ·
  `net/lanClient` (pair from `?c=`, route `paired`/`error`/`intent_score`, localhost dev fallback) ·
  `session/SessionStats` (engaged-time + longest-streak).
- **App router** (`App.tsx`) — `useState` scene machine sharing one `SessionStats`; boots to the pairing
  gate when `?c=` present and takes patient identity from the paired ack (closes the hardcoded-"Margaret"
  gap in the LAN path; `config.ts` remains the dev default).

### 🧪 Tests available (19 files, 58 unit + 2 live integration)
- **Scenes:** `Welcome`, `Calibration`, `GameModeSelect`, `Garden`, `StarCatch`, `Summary`, `Pairing`.
- **Logic:** `PlantGrowthModel`, `ReachModel`, `intentScoreMessage`, `scoreStore`, `scoreClient`,
  `SessionStats`, `sanity`.
- **Warm-up:** `warmupMotion`, `interpolation`, `useWarmupPose`.
- **App:** flow `Welcome → Calibration → Garden → Summary`.
- **Integration** (`integration/sidecar.live.test.ts`, real mock-EEG sidecar ~27 s boot): "mock MI grows
  the garden over ~15 s" (closed-loop proof) + "patient and console parsers agree frame-for-frame".
- Gates: `tsc -b` clean; `vite build` clean.

### ⚠️ Missing capabilities
- **P2 Calibration is cosmetic** — client-timed, NOT marker-driven; no mechanism forwards the Python LSL
  marker stream to the browser.
- **No camera publish** — `CameraFeed` is a local preview; no `getUserMedia` → WebRTC → aiortc publish.
  P4 verified-ROM and P5 compensation overlay need kinematics (blocked on the vision pipeline).
- **Reach & Collect is Phase-A only** — single fixed direction/target driven by IntentScore magnitude;
  cued-direction (Phase B) and verified-ROM (Phase C) not built (see `reachcollect.md`).
- **PixiJS deferred** — all scenes are React + SVG/CSS.
- **No adaptive difficulty in Garden** — `engagementThreshold` is a fixed prop (spec §9.4 staircase not
  wired); `SessionStats.incrementTrials` unwired (no trial counting in free-form garden play).
- **River Rowing** and **Lighthouse story mode** not built (menu placeholders).
- **Remote gameplay** — scenes read `localhost:8765`; not yet driven by the paired LAN socket.

### 🔜 Tests still lined up
- Marker-driven calibration once the LSL-marker → browser bridge exists.
- Camera publish + WebRTC path (patient side of V2-2).
- Adaptive-difficulty staircase in Garden.
- Reach & Collect Phase B (cued-direction target catalogue).
- End-to-end web latency (EEG → WSS → React render) p95 < 250 ms.

---

## 4. Cross-cutting

- **Shared wire contract:** the `intent_score` JSON frame parser is byte-identical in `patient-web/` and
  `clinician-console/` (`intentScoreMessage.ts`), asserted frame-for-frame by a live integration test.
  Any change to the frame must update both. `eeg_quality` is clinician-side only and must never reach the
  patient channel (enforced by `scoreRelay` + `lan.live.test.ts`).
- **On-head hardware schedule** (spec §13.6): four gated sessions H1–H4. H1 (signal/ERD ground-truth) is
  unblocked now; H2 needs the baseline block + filter versioning; H3 needs V2-2; H4 needs the console
  control channel + persistence + vision.
- **`game-client/` (Unity)** is fully removed and ported to `patient-web/`. Do not re-add.
- **Dev data stream:** to drive the games without a headset, run the mock sidecar
  (`conda run -n eeg python signal-engine/run_ws_server.py`) — the virtual-MI driver cycles ERD 6 s on /
  3 s rest so the score actually moves (`NEUROREACH_NO_MI=1` disables it).

## 5. Next up (priority order)

1. **V2-2 vision pipeline** — the keystone. Patient `getUserMedia` → WebRTC publish → aiortc receive in
   the sidecar → MediaPipe → `kinematic_score` fusion; frame-drop/deny → EEG-only fallback; framing-check
   setup step; camera-link health panel. Unblocks Modes B/C, verified ROM, compensation penalty.
2. **Engine control channel** — wire pause/rest/end/switch-mode from the console to the running engine.
3. **Persistence** — sidecar FastAPI + SQLite/EDF; real console records + export.
4. **On-head H1** — un-skip signal-quality test, confirm production µV/ERD thresholds.
5. **V2-4 packaging** — electron-builder installer, cert provisioning, offline smoke test, re-measure p95.
