# NeuroReach — Development Status & TODOs

_Last updated: 2026-07-07. Reference spec: [`docs/specs.md`](specs.md). Game design docs:
[`gardengrow.md`](gardengrow.md), [`reachcollect.md`](reachcollect.md)._

This is the **whole-project** status board across all three subsystems. Each subsystem section lists
what is **implemented ✅**, the **tests that exist 🧪**, **missing capabilities ⚠️**, and **tests still
lined up 🔜**. Detailed change history lives in git + claude-mem, not here.

> **Editing this file? Read [§6 Maintaining this document](#6-maintaining-this-document--agent-update-protocol) first.** It is a status board, **not** a changelog — keep it current, keep it terse, don't append a running log.

## Status at a glance

| Subsystem | State | Tests |
|---|---|---|
| `signal-engine/` (Python DSP + scoring + WS) | Core complete, mock/synthetic-validated; WebRTC camera receive (aiortc) landed; on-head validation pending | **76 passed, 6 skipped** (+1 opt-in live) |
| `clinician-console/` (Electron + React, C1–C5 + LAN pairing) | Guided session stepper (Signal→Pair→Calibrate→Live); Sim/Live toggle + pairing surfaced; **real WebRTC signaling relay** (echo stub gone); End/Switch-mode wired; persistence still pending | **116 passed** (32 files) + 2 live integration |
| `patient-web/` (React + Vite patient game) | Welcome→Calibration→Garden/StarCatch→Summary + pairing gate; **camera publish over WebRTC** for paired sessions | **76 passed** (23 files) + 2 live integration |

**Milestone map (spec §15):** V2-0 foundation ✅ · V2-1 patient web ✅ · S1 LAN + pairing ✅ · **V2-2a WebRTC
transport spine ✅** · V2-2b vision/kinematics ⏳ next · V2-2c fusion/UX ⏳ · V2-3 clinical workflow ⏳ ·
V2-4 packaging/hardening ⏳.

**The vision transport spine now works end-to-end** (patient `getUserMedia` → WebRTC → console signaling
relay → sidecar `aiortc` → decoded frames in `VideoFrameSink`). The remaining vision gap is
**MediaPipe → `kinematic_score`** (V2-2b) and its **fusion + health-panel UX** (V2-2c). Until those land,
scoring is still **EEG-only (Mode A, band-power)** — no verified-ROM, covert-MI validity gate, or
compensation penalty yet. Design/plan:
[`docs/superpowers/specs/2026-07-07-v2-2a-webrtc-transport-spine-design.md`](superpowers/specs/2026-07-07-v2-2a-webrtc-transport-spine-design.md).

Run all tests:
```bash
conda run -n eeg python -m pytest signal-engine/tests/ -m "not live"   # 76 passed, 6 skipped
cd patient-web        && npm run test                                  # 76 passed
cd clinician-console  && npm run test                                  # 116 passed
```

---

## 1. `signal-engine/` — Python real-time service

The end-to-end real-time path runs live and meets the MVP latency target:
`Unicorn HW → LSL bridge → DCOffsetRemover → CausalFilterChain (notch+bandpass) → CAR → gates →
ERDCalculator (+CSP/LDA when reliable) → IntentScore fusion → 20 Hz WebSocket`.

### ✅ Implemented
- **Acquisition** (`acquisition/`): `EEGInlet.get_chunk()` single aligned EEG+IMU pull; label-based +
  **positional fallback** for the real Unicorn bridge (type `Data`, no XML labels). `MockUnicornOutlet`
  17-ch synthetic stream with `inject_erd()` / `inject_spike()`.
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
  `signal_quality` (per-channel good/check/poor + MI trace → `eeg_quality` frame at 5 Hz);
  `SessionSimulator` (dev-mode scripted session arc — settle → calibration cueing → variable-depth MI
  trials with fatigue drift + occasional artifacts; `arm()`/`disarm()`/`status()`, drives the mock only,
  session-gated). Design: [`docs/superpowers/specs/2026-07-05-dev-mode-simulated-eeg-design.md`](superpowers/specs/2026-07-05-dev-mode-simulated-eeg-design.md).
- **Server** (`server/`): `NeuroReachWSServer` (asyncio, thread-safe queue drain, 20 Hz broadcast
  decoupled from producer, `ping`/`get_status`/`set_mode`/`start_session`/`end_session` dispatch, graceful
  client drop). `start_session`/`end_session` arm/disarm the `SessionSimulator` via an optional
  `session_controller` (per-client `session` reply, never broadcast) **and gate `intent_score` broadcast to
  the active session** — with a controller present, no score frames reach any client (patient or console)
  before `start_session` or after `end_session`; `eeg_quality` is never gated. Without a controller (real
  headset/standalone) broadcasting is ungated. `intent_score` frame is byte-stable; `eeg_quality` on its
  own message type. Also dispatches `webrtc-offer`/`webrtc-ice` (keyed on `type`, not `cmd`) to the vision
  receiver and replies `webrtc-answer`. Entrypoint `run_ws_server.py` boots idle and selects source via
  `EEG_SOURCE=sim` (default) or `live`; builds the `VideoFrameSink` + `WebRTCReceiver` after the scoring
  service (baseline-before-simulator boot order preserved).
- **Vision** (`vision/`, V2-2a transport spine): `WebRTCReceiver` (`aiortc` answerer, injectable peer
  factory — patient camera track → decoded frames); `VideoFrameSink` (bounded latest-frame buffer,
  drop-oldest, monotonic `frame_count` for the camera-link health check). Signaling rides the paired LAN
  socket. **No MediaPipe / `kinematic_score` yet** (V2-2b). Design:
  [`docs/superpowers/specs/2026-07-07-v2-2a-webrtc-transport-spine-design.md`](superpowers/specs/2026-07-07-v2-2a-webrtc-transport-spine-design.md).

### 🧪 Tests available (`signal-engine/tests/`, 83 collected)
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
| `test_session_simulator.py` | 4 | phase boundaries, idle status, arm drives both MI channels + disarm stops, idempotent arm |
| `test_ws_session_commands.py` | 3 | `start_session`/`end_session` route to controller + `session` reply; no-controller → `error` |
| `test_session_gating.py` | 1 | end-to-end: score floors idle, rises after `start_session` (session gate drives IntentScore) |
| `test_live_unicorn.py` | 6 | **skipped** unless `THALIS_LIVE_UNICORN=1` — stream metadata, live EEG/IMU, p95 latency, end-to-end |
| `test_frame_sink.py` | 2 | `VideoFrameSink` latest/count, clear resets latest not count |
| `test_webrtc_receiver.py` | 4 | offer→answer + setRemote, ice parse/forward, null-ice ignore, close clears sink (fake peer) |
| `test_ws_server_signaling.py` | 3 | offer→answer on same socket, ice→receiver, no-receiver silent no-op |
| `test_webrtc_live.py` | 1 | `@pytest.mark.live` — real `aiortc` loopback offerer→receiver, frames land in sink (deselected on CI) |

Latency validated off-head: **p95 ≈ 18 ms** (budget 250 ms), compute-only ≈ 1.5 ms.

### ⚠️ Missing capabilities
- **Vision scoring absent (V2-2b/2-2c)** — transport spine done (`aiortc` receive → `VideoFrameSink`),
  but no MediaPipe, no kinematic features, no `kinematic_score`. Fusion still runs EEG-only (`w_kin=0`).
  Blocks Modes B/C, covert-MI validity gate, compensation penalty. Also missing: rest-pose calibration
  (5 s) + framing-check setup step, and unifying the publisher stream with the `CameraFeed` preview.
- **`aiortc` dependency** installed into the `eeg` env but not pinned in any tracked manifest (repo has no
  requirements/environment file); Windows-clinic install validation deferred to V2-4 packaging.
- **60 s baseline-rest block** not built (orchestrator collects MI trials only).
- **Per-patient versioned filter persistence** to disk not built (CSP/LDA fit in-memory only).
- **Dead-channel handling** — off-head flat electrodes need a per-channel quality flag feeding the
  console "Check Cz contact" indicator (partially covered by `signal_quality`, not wired to a hard flag).
- **Engine control channel** — partial: `set_mode` + `start_session`/`end_session` (dev-sim gate) exist,
  but pause/rest/switch-mode commands from the console are not wired to the running engine. Live-headset
  source-switching is a stub (`EEG_SOURCE=live` binds the real `Data` stream / errors if absent; no
  runtime mock⇔real reconfigure from the console toggle yet).
- **FastAPI + SQLite/EDF persistence layer** (spec §11) not built.
- **pytest markers** — new vision live test uses a registered `-m live` marker (via `conftest.pytest_configure`);
  the older `test_live_unicorn.py` is still gated by the `THALIS_LIVE_UNICORN` env var, not unified onto `-m live`.
- **On-head numbers unverified** — µV amplitude and ERD magnitude were measured off-head (floating-
  electrode noise); do NOT trust until re-run on-head.

### 🔜 Tests still lined up
- On-head signal quality + ERD magnitude (un-skip `test_signal_quality_on_head_TODO`): µV 10–100, mu-ERD
  >15% at C3, contralateral laterality. **Blocker:** cap worn.
- Real on-head CSP+LDA cross-val accuracy (H2).
- Wire `test_live_unicorn.py` through `EEGInlet` instead of the local `_LiveUnicorn` shim.
- 60 s baseline-rest + per-patient filter versioning tests.
- Offline replay / regression harness (needs a stored raw EEG+pose corpus).
- Vision (V2-2b/2-2c): MediaPipe joint-angle vs goniometer ground-truth; kinematic_score fusion parity;
  frame-drop / camera-deny → EEG-only fallback surfaced in the console health panel.
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
  TTL); `scoreRelay` (forwards **only `intent_score`** to the patient); `signalingRelay` + `signaling`
  (**real bidirectional WebRTC SDP/ICE relay** patient⇄sidecar `aiortc`, queue-until-open outbox, same
  lifecycle as `scoreRelay`; echo stub removed); `netUtil` (LAN-IPv4 detection). Wired via
  `config.ts` (`LAN_PORT=8443`), `main.ts` (start/end-session IPC), `preload.ts` (`window.neuroreach`).
- **Session control channel** (`src/main/main.ts` + `sessionControl.ts`) — a persistent control socket to
  the sidecar, driven by decoupled IPC: `session:open` mints the pairing code (no arm), `session:begin`
  arms the `SessionSimulator` (sim source only, fired when the Live step mounts), `session:end` disarms +
  ends pairing, `session:set-mode` sends `set_mode`. `sessionControlCommand`/`setModeCommand` build the
  frames; socket reconnects like the score relay; outbound commands queue until open.
- **Guided session flow** (`renderer/SessionFlow.tsx` + `useSession.ts`) — a stepper **Signal check →
  Pair device → Calibrate → Live** launched from the workspace "Start session ▶". Steps: `SignalCheckStep`
  (C2 electrode map + C3/Cz/C4 trace + **Simulated EEG / Live headset** toggle), `PairDeviceStep`
  (**auto-mints** the code on entry — no Start Session button; QR (`qrcode`) + code + waiting/✓-connected +
  dev-localhost note + **"Start on the patient's computer" join instructions** carrying the LAN URL;
  minting opens pairing only, EEG streaming still begins in Live; **not hard-gated**),
  `CalibrateStep` (honest skippable placeholder), `LiveStep` (arms the sim on mount). `useSession` owns
  source/pairing/lifecycle over the `session:{open,begin,end,set-mode}` IPC; shows a desktop-app notice
  when `window.neuroreach` is absent. Sim **arms on entering Live**, not at pairing.
- **Renderer**: `Roster` (C1 worklist) · session flow (C2 signal + pairing above) · `LiveMonitor` (C3 hero
  score + 8-ch quality strip + sub-tiles; **End session + Switch-mode wired**, Switch-mode capability-gated
  on a loaded classifier, Pause/rest still disabled) · `HistoryTrends` + `Assessments` (C4 KPI tiles,
  proxy-vs-clinical chart, clinical-scales table + CSV export) · `ProtocolEditor` (C5). Shell `App.tsx`
  view router (roster → session flow → review-tabs workspace, no redundant Live tab); `PatientStore` seed.
- **Shared parsers** (`src/scoring/`) — `intentScoreMessage` (byte-identical to patient-web),
  `eegQualityMessage`, `scoreStore`, `eegQualityStore`; `net/scoreClient` WS adapter.

### 🧪 Tests available (32 files, 116 unit + 2 live integration)
- **Renderer:** `App`, `Roster`, `SignalCheckStep`, `PairDeviceStep`, `CalibrateStep`, `LiveStep`,
  `SessionFlow`, `useSession`, `LiveMonitor` (incl. End/Switch-mode controls), `HistoryTrends`,
  `Assessments`, `ProtocolEditor`, `PatientWorkspace`.
- **Main/LAN:** `lanServer` (headless integration: fake sidecar → two mock WSS clients — pairs,
  single-claimant `session_taken`, `eeg_quality` never forwarded, bad code, foreign-origin rejected),
  `cert`, `pairing`, `scoreRelay`, `signalingRelay` (bidirectional forward + queue-until-open + reconnect),
  `signaling` (`isSignalingMessage`), `lanServer` (also: paired offer→sidecar, sidecar answer→patient),
  `netUtil`, `lanConfig`, `sidecar`, `sessionControl` (source+action → command mapping + `setModeCommand`).
- **Data/scoring:** `store`, `selectors`, `scoreStore`, `eegQualityStore`, `intentScoreMessage`,
  `eegQualityMessage`, `scoreClient`, `sanity`.
- **Integration** (`integration/`, real sidecar): `sidecar.live` (asserts `intent_score` + `eeg_quality`
  frames); `lan.live` (real mock-EEG sidecar → `LanServer` → Node WSS client pairs, receives >100 real
  `intent_score` frames, **zero `eeg_quality` leakage**, second-claimant rejected). Runs serially
  (`fileParallelism:false`) so two sidecars never race on port 8765.
- Verification gates: `build:main` + `build:renderer` clean.

### ⚠️ Missing capabilities
- **Engine control channel partial** — Start/End Session (arm/disarm sim), **End session**, and
  **Switch mode** (`set_mode`, capability-gated on a loaded classifier) are wired from the UI over the
  control socket. Still missing: **Pause/rest** (no sidecar command) and real **marker-driven
  calibration** (Calibrate is an honest placeholder — needs the LSL-marker → browser bridge).
- **No persistence** — all data is in-memory mock; real records need the sidecar FastAPI + SQLite layer
  (spec §11), not built.
- **No camera-link health panel** — signaling relay + `aiortc` receive work, but the console has no
  panel showing camera-link state / "vision degraded → EEG-only" (V2-2c).
- **"Offline-OK" badge is a static label**, not a live LAN/patient-connection indicator.
- **Game scenes still read `localhost:8765`** — a remote paired device pairs, but the paired LAN socket
  isn't yet wired into the game scenes, so remote gameplay visuals don't follow the score.
- No login / role separation (spec §11.2) implemented.

### 🔜 Tests still lined up
- Pause/rest command round-trip once the sidecar pause command exists.
- Marker-driven calibration step once the LSL-marker → browser bridge exists (replaces the placeholder).
- Surface `session`/`set_mode` control-socket ack replies in the console (read inbound control frames).
- Persistence layer (FastAPI/SQLite) CRUD + EDF/PDF export.
- Camera-link health panel + "vision degraded → EEG-only" state.
- Physical second-device browser smoke over the LAN (scan QR, accept TOFU cert, see score animate) —
  needs real hardware; the headless `lan.live.test.ts` proves the score-fan-out + pairing spine.

---

## 3. `patient-web/` — React + Vite patient game

Scene machine `Welcome → Calibration → GameModeSelect → Garden / StarCatch → Summary`, with a `Pairing`
gate when a `?c=<code>` session code is present. **EEG-only scoring**; the camera is now **published over
WebRTC** to the sidecar for paired sessions (transport only — no `kinematic_score` consuming it yet).

### ✅ Implemented
- **Scenes** (`src/scenes/`): `WelcomeScene` (P1 greeting) · `CalibrationScene` (P2 client-timed Graz cue
  sequencer — **cosmetic**, no marker bridge; now matches spec §6: 60 s eyes-open baseline rest
  (`baselineMs`) → 2-class block cueing affected↔unaffected each trial, `totalTrials` per class;
  clinician pre-cal "I'm ready" gate; blinking REC dot) ·
  `GameModeSelect` (Garden live; River disabled; Star Catcher live) · `GardenScene` (P3 illustrated
  full-bleed SVG flower, focus meter, status banner, camera overlay) · `StarCatchScene` (P4 reach avatar
  toward star ROM target) · `SummaryScene` (P6 warm non-comparative recap) · `PairingScene` (presentational
  "Connecting to your session…" / error; the connection itself lives in `usePatientLink`). `CameraFeed`
  selfie preview + REC. Scenes are **pure score consumers** — they read a shared `ScoreStore` + `conn`
  passed from App, not their own socket.
- **Warm-up 3D hand viz** (`src/warmup/`): dual Shadow-Hand capsule renders (R3F v8/drei v9 pinned for
  React 18); affected side animates neutral→open→loop; pure motion logic TDD'd; `Canvas` mocked in jsdom.
- **Logic layer** (fully unit-tested): `garden/PlantGrowthModel` (verbatim C# port: grow 0.8/s, wilt
  0.3/s, 3 s bloom dwell, 0.75/0.60 hysteresis) · `reach/ReachModel` (adaptive staircase band 0.55–0.9) ·
  `scoring/intentScoreMessage` (shared `ScoreFrame` contract, byte-identical to console) · `scoring/scoreStore`
  (circular buffer, latest/recentAverage/streak) · `net/scoreClient` (WSS reconnect + backoff) ·
  `net/lanClient` (pair from `?c=`, route `paired`/`error`/`intent_score`/`webrtc-*`, localhost dev
  fallback, outbound `send`) · `net/usePatientLink` (**one persistent session socket** lifted to App —
  remote `?c=` dials the LAN relay `wss://<host>` and rides the *paired* socket for scores **and WebRTC
  signaling** via `sendSignaling`/`subscribeSignaling`; no code → localhost sidecar; capped-backoff
  reconnect feeds a shared `ScoreStore`) · `net/signaling` (`isSignalingMessage` guard, contract mirrors
  the console) · `net/cameraPublisher` (WebRTC offerer/send-only: `getUserMedia`→`RTCPeerConnection`,
  offer + trickle ICE, injectable for jsdom) · `net/useCameraPublish` (mounts the publisher for paired
  sessions; camera-deny → EEG-only, no throw) · `session/SessionStats` (engaged-time + longest-streak).
- **App router** (`App.tsx`) — `useState` scene machine sharing one `SessionStats`; owns the `usePatientLink`
  connection for the whole session, boots to the pairing gate when `?c=` present and takes patient identity
  from the paired ack (closes the hardcoded-"Margaret" gap in the LAN path; `config.ts` remains the dev
  default). Scenes previously each opened `ws://localhost:8765`, which never reached a **remote** patient
  over the LAN relay (worked only same-machine) — fixed by the single lifted socket.

### 🧪 Tests available (23 files, 76 unit + 2 live integration)
- **Scenes:** `Welcome`, `Calibration`, `GameModeSelect`, `Garden`, `StarCatch`, `Summary`, `Pairing`.
- **Logic:** `PlantGrowthModel`, `ReachModel`, `intentScoreMessage`, `scoreStore`, `scoreClient`,
  `usePatientLink` (remote-relay routing + reconnect + local fallback + signaling send/subscribe),
  `signaling`, `cameraPublisher` (offer/answer/ice/teardown), `useCameraPublish` (start/stop/subscribe),
  `SessionStats`, `sanity`.
- **Warm-up:** `warmupMotion`, `interpolation`, `useWarmupPose`.
- **App:** flow `Welcome → Calibration → Garden → Summary`.
- **Integration** (`integration/sidecar.live.test.ts`, real mock-EEG sidecar ~27 s boot): "mock MI grows
  the garden over ~15 s" (closed-loop proof) + "patient and console parsers agree frame-for-frame".
- Gates: `tsc -b` clean; `vite build` clean.

### ⚠️ Missing capabilities
- **P2 Calibration is cosmetic** — client-timed, NOT marker-driven; no mechanism forwards the Python LSL
  marker stream to the browser.
- **Camera publish transport-only** — `cameraPublisher`/`useCameraPublish` publish the track to the
  sidecar `aiortc` receiver, but nothing consumes it yet: no `kinematic_score`, so P4 verified-ROM and P5
  compensation overlay stay blocked (V2-2b/2-2c). The publisher acquires its own stream; unifying it with
  the `CameraFeed` preview (single stream) is deferred to the V2-2b framing-check step.
- **Reach & Collect is Phase-A only** — single fixed direction/target driven by IntentScore magnitude;
  cued-direction (Phase B) and verified-ROM (Phase C) not built (see `reachcollect.md`).
- **PixiJS deferred** — all scenes are React + SVG/CSS.
- **No adaptive difficulty in Garden** — `engagementThreshold` is a fixed prop (spec §9.4 staircase not
  wired); `SessionStats.incrementTrials` unwired (no trial counting in free-form garden play).
- **River Rowing** and **Lighthouse story mode** not built (menu placeholders).
- **Remote gameplay** — scenes read `localhost:8765`; not yet driven by the paired LAN socket.

### 🔜 Tests still lined up
- Marker-driven calibration once the LSL-marker → browser bridge exists.
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
- **Dev data stream:** to drive the games without a headset, open a patient in the console → **Start
  session ▶** → keep the **Simulated EEG (dev)** toggle on the Signal-check step → advance to **Live**.
  The sidecar (`run_ws_server.py`, `EEG_SOURCE=sim` default) boots idle (flat rest, IntentScore floored);
  entering the Live step arms the `SessionSimulator`, which walks a canonical arc (settle → calibration
  cueing → variable-depth MI trials with fatigue drift + occasional artifacts); **End session** returns it
  to rest. Running `run_ws_server.py` standalone streams idle until a `start_session` WS command arrives.

## 5. Next up (priority order)

1. **V2-2b vision & kinematics** — the keystone, now unblocked by the V2-2a transport spine. Consume the
   `VideoFrameSink` with MediaPipe Pose/Hands → joint angles, trunk displacement, jerk → `kinematic_score`;
   rest-pose calibration (5 s) + framing-check setup step; confidence / last-known-good gating. Then
   **V2-2c fusion & UX**: wire `kinematic_score` into `IntentScoreEngine` (Modes B/C, compensation
   penalty); camera-link health panel; frame-drop/deny → EEG-only fallback surfaced both sides. Unblocks
   Modes B/C, verified ROM, compensation penalty.
2. **Engine control channel** — End/Switch-mode + session arm/disarm are wired; still need **pause/rest**
   (new sidecar command) and **marker-driven calibration** (LSL-marker → browser bridge).
3. **Persistence** — sidecar FastAPI + SQLite/EDF; real console records + export.
4. **On-head H1** — un-skip signal-quality test, confirm production µV/ERD thresholds.
5. **V2-4 packaging** — electron-builder installer, cert provisioning, offline smoke test, re-measure p95.

---

## 6. Maintaining this document — agent update protocol

**Update this file at the end of every task that changes code, tests, capabilities, or plans.** This is a
**living status board**, not a changelog. The goal: any agent or scientist can read it cold and know the
true current state. Follow the rules below exactly so it stays organized across the whole project.

### 6.1 Golden rules
1. **Reflect the present, don't log the past.** State *what is true now*. Do **not** append dated "on
   2026-07-03 I added X" entries — that history belongs in git commits + claude-mem. If you're tempted to
   add a paragraph narrating what you did, instead **edit the relevant bullet** to its new truth.
2. **Every claim must be verifiable.** Test counts must come from an actual run (§6.4), not memory. A
   capability is only ✅ if it works, not if it's "mostly done."
3. **Terse and factual.** Match the existing telegraphic style — fragments, `code` identifiers, module
   paths. No filler, no hedging, no marketing.
4. **One fact, one place.** If a change touches multiple sections, update each; don't duplicate prose.
   Cross-reference with `specs.md` §-numbers and the design docs instead of restating.

### 6.2 Which section to touch (map change → edit)
| You did… | Update |
|---|---|
| Shipped a working feature/module | Move it from ⚠️ (or 🔜) into the subsystem's **✅ Implemented** list; delete the now-stale gap bullet |
| Added/changed tests | Update that subsystem's **🧪 Tests available** table (file, count, what) **and** the count in **Status at a glance** |
| Found/created a gap or known limitation | Add a bullet under **⚠️ Missing capabilities** (be specific about *why* it's blocked and *what* it blocks) |
| Planned a test not yet written | Add under **🔜 Tests still lined up** with its blocker |
| Completed a milestone (V2-x / S-x / H-x) | Flip its status in the **Milestone map** (intro) and the **§15 table in `specs.md`**; if it unblocks others, update **§5 Next up** |
| Changed the `intent_score` / `eeg_quality` wire contract | Update **§4 Cross-cutting** and both parser mentions (patient-web + console) |
| Re-prioritized remaining work | Re-order **§5 Next up** |

### 6.3 Moving items between states (the lifecycle)
`🔜 lined-up test` → (written & passing) → counted in `🧪 Tests available`.
`⚠️ missing capability` → (built & tested) → bullet in `✅ Implemented` **and** its ⚠️ bullet **deleted**.
Never leave the same item in two states. If a capability is partial, keep it in ⚠️ with an explicit
"partial: X works, Y doesn't" note rather than prematurely marking it ✅.

### 6.4 Keep the numbers honest
Before editing any test count, actually run the suite and paste the real totals:
```bash
conda run -n eeg python -m pytest signal-engine/tests/   # → "N passed, M skipped"
cd patient-web       && npm run test                     # → "Tests  N passed"
cd clinician-console && npm run test                     # → "Tests  N passed"
```
Update **all three** places a count appears: the **Status-at-a-glance** row, the subsystem's **🧪** table
header, and the run-commands block near the top. If a suite is red, do not mark the work ✅ — record the
failure under ⚠️.

### 6.5 Finishing checklist (run before you consider a task done)
- [ ] Moved shipped work ✅; deleted the gap/lined-up bullets it resolved.
- [ ] Added new gaps ⚠️ and planned tests 🔜.
- [ ] Ran the affected suite(s); updated every test count (§6.4).
- [ ] Updated the **Milestone map** + **§5 Next up** if a milestone moved.
- [ ] Bumped the **_Last updated:_** date on line 3.
- [ ] Kept it a board, not a log — no dated narration added.
- [ ] Skimmed for contradictions (a ✅ item still listed as a gap, a stale count, a dead `specs.md` §-ref).

### 6.6 Scope discipline
Keep this file to **status + pointers**. Deep design rationale goes in `specs.md` or the per-game design
docs (`gardengrow.md`, `reachcollect.md`) — link to them, don't inline them here. If a subsystem grows a
fourth concern, add a subsection under it, not a new top-level section, so the three-subsystem shape holds.
