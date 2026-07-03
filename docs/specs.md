# NeuroReach — Engineering Specification

**System name:** NeuroReach &nbsp;·&nbsp; **Repository:** `thalis-rehab-game`
**Target hardware:** g.tec Unicorn Hybrid Black (8-ch EEG) + patient-device camera + clinic Windows PC
**Document status:** current (v2 delivery architecture). Consolidates the original engineering
draft (v1) and the v2 architectural revision into one sheet.
**Audience:** signal-processing engineers, web/desktop developers, clinical stakeholders, regulatory/QA

> **Reading note.** NeuroReach began as a Unity native client + local Python pipeline (v1) and was
> re-architected to a web patient client + Electron clinician console + Python sidecar (v2). The
> **signal-processing and clinical core is unchanged**; only the delivery layer moved. This document
> describes the **current (v2) system**; the v1→v2 change history is preserved in **Appendix D** so the
> rationale for the pivot is never lost. Section numbers 1–16 are stable across both revisions.

---

## 0. Executive Summary

NeuroReach is a closed-loop neurofeedback game that turns motor-imagery (MI) quality — and, where the
patient retains some movement, actual movement quality — into real-time game mechanics for stroke
survivors doing upper-limb rehabilitation. Two signal streams are fused into a single trustworthy
"IntentScore":

1. **EEG** (Unicorn Hybrid Black, 8 channels, 250 Hz) → sensorimotor rhythm (mu/beta) event-related
   desynchronization (ERD) → classified MI engagement.
2. **Camera (RGB)** → skeletal/hand pose tracking → confirms genuine attempted movement and flags
   compensatory "cheating" movements that would invalidate a covert-MI trial.

Both streams are synchronized through **Lab Streaming Layer (LSL)**, processed in a Python real-time
pipeline, and drive a **React web game** on the patient's device over a low-latency LAN bridge (WSS for
score, WebRTC for the return camera feed). The system is clinic-deployable: offline-first, no patient
data leaves the LAN by default, sub-10-minute setup, a clinician console for protocol configuration and
progress reporting, and a roadmap toward IRB-backed pilot validation.

This document specifies the full stack: hardware, signal processing, ML classification, computer-vision
verification, sensor fusion, game design, clinical workflow, data/privacy architecture, safety, testing,
and deployment.

---

## 1. Clinical & Scientific Foundations

*(design constraints derived from evidence — these directly drive engineering decisions below)*

- **Mechanism.** Motor imagery and motor observation activate the sensorimotor cortex and mirror-neuron
  system, producing event-related desynchronization in the mu (8–12 Hz) and beta (12–30 Hz) bands over
  C3/Cz/C4-region electrodes. This ERD is the core signal NeuroReach decodes and gamifies.
- **"BCI illiteracy."** Roughly 40% of stroke patients show insufficient mu-ERD modulation to control a
  classifier reliably. **Design implication:** the system must (a) screen for MI aptitude during
  onboarding, (b) offer a fallback/blended mode (movement-attempt + camera-led scoring) for patients who
  don't decode well from EEG alone, and (c) never let a patient feel like a "BCI failure" — game design
  must reward effort, not just classifier output.
- **Outcome measures used in the literature** (for the clinician dashboard and any future trial):
  Fugl-Meyer Assessment – Upper Extremity (FMA-UE, 0–66) and Action Research Arm Test (ARAT, 0–57), with
  an ARAT minimal clinically important difference around 6 points. NeuroReach logs session-level proxy
  metrics (ERD magnitude, classifier accuracy, laterality index, ROM) that correlate with these clinical
  scales, and exports data a clinician can cross-reference against periodic FMA-UE/ARAT assessments.
- **Trial designs to emulate.** Published MI-BCI rehab studies pair the EEG decode with a contingent,
  embodied reward: robotic feedback (BCI-Manus shoulder-elbow robot), functional electrical stimulation,
  an exoskeleton, or a virtual avatar/VR task (bimanual rowing game). NeuroReach follows the same
  "decode → contingent embodied feedback" pattern, substituting an engaging 2D/3D game + camera-verified
  movement for the robotic/FES hardware most clinics won't have.
- **Severity matters.** Patients with more severe baseline impairment show smaller/less reliable ERD
  changes. **Design implication:** difficulty and reward curves must be calibrated per-patient (§9.4),
  not fixed.
- **Effect sizes are real but modest, and BCI is an adjunct, not a replacement for standard therapy.**
  This must be reflected honestly in clinician-facing materials and any marketing language — see §12.

---

## 2. System Architecture

```
┌──────────────────────────┐
│  Unicorn Hybrid Black     │  BLE
│  8ch EEG + IMU @ 250 Hz   │────────────┐
└──────────────────────────┘            │
                                         ▼
   ┌──────────────────────────────────────────────────────────────────────┐
   │      CLINIC WINDOWS PC  —  "NeuroReach Clinician Console" (Electron)   │
   │                                                                        │
   │   ┌────────────────────────┐      ┌──────────────────────────────┐   │
   │   │ Electron RENDERER       │      │ Python signal-engine SIDECAR  │   │
   │   │ (clinician UI)          │◀────▶│ (PyInstaller-frozen)          │   │
   │   │  live monitor, profiles │ IPC  │  pylsl inlet → causal filter  │   │
   │   │  history, protocol edit │      │  → CAR → gates → ERD/CSP+LDA  │   │
   │   └────────────────────────┘      │  → fusion → IntentScore (20Hz)│   │
   │   ┌────────────────────────┐      │  + aiortc video recv → MediaP.│   │
   │   │ Electron MAIN           │      │  + FastAPI (SQLite/EDF, REST) │   │
   │   │  spawns sidecar +       │      └──────────────┬───────────────┘   │
   │   │  Unicorn LSL bridge     │                     │ local WS           │
   │   │  LAN SERVER:            │◀────────────────────┘                    │
   │   │   • serves React build  │                                          │
   │   │   • session-code pairing│                                          │
   │   │   • WS score broadcast  │                                          │
   │   │   • WebRTC signaling    │                                          │
   │   └───────────┬─────────────┘                                          │
   └───────────────┼────────────────────────────────────────────────────────┘
                   │  clinic LAN  (HTTPS + WSS + WebRTC, local cert)
                   ▼
   ┌────────────────────────────────────────────┐
   │  PATIENT DEVICE  (any browser, no install)  │
   │   React web game  (Garden Grow, etc.)       │
   │   • receives IntentScore over WSS           │
   │   • captures webcam (getUserMedia)          │
   │   • sends video to clinic PC over WebRTC    │
   └────────────────────────────────────────────┘
```

**Internal signal dataflow (inside the sidecar):**

```
LSL EEG+IMU stream (250 Hz, 17 ch)
  → EEGInlet.get_chunk (single aligned pull)
  → CausalFilterChain (1–40 Hz bandpass + notch)  → CommonAverageReference
  → RingBuffer (filtered) ; raw copy → AmplitudeGate/MovementGate (artifact_clean)
  → IntentScoreEngine: ERDCalculator (C3+C4 mu-ERD) + OnlineClassifier (CSP+LDA, when reliable)
  → adaptive normalization → EMA smoothing → 0–100 IntentScore
  → queue → NeuroReachWSServer (asyncio, 20 Hz JSON broadcast)
```

**Design principle (preserved throughout):** every link is `localhost` or clinic-LAN only. A full
session runs with **zero internet connectivity** — essential for clinic IT approval and offline
reliability (§14). The only things that cross the LAN are (a) the React app bytes, (b) the 0–100
IntentScore + game state going to the patient, and (c) the patient's webcam video coming back. **No PHI
leaves the clinic PC.**

---

## 3. Hardware Specification

### 3.1 EEG headset — g.tec Unicorn Hybrid Black

| Spec | Value | Engineering relevance |
|---|---|---|
| Channels | 8 EEG (fixed montage Fz, C3, Cz, C4, Pz, PO7, Oz, PO8) | C3/Cz/C4 are the MI-relevant electrodes; the other 5 are used for artifact rejection, reference, and posterior alpha monitoring |
| Resolution | 24-bit | Effectively no quantization-noise concern |
| Sampling rate | 250 Hz | Nyquist 125 Hz; plenty for mu/beta (8–30 Hz) |
| Reference | Linked mastoid (M1/M2) | Keep a consistent reference scheme; check impact before re-referencing to common average vs Laplacian-style filters |
| Onboard IMU | 3-axis accel + 3-axis gyro @ 250 Hz | Head-movement artifact detection, NOT a limb-tracking substitute |
| Electrodes | Hybrid dry/wet (g.SAHARA) | Dry = faster clinic setup; wet/gel improves signal for harder cases (spasticity, hair, tremor) |
| Connectivity | Bluetooth, ~3 hr battery | Plan a charging/rotation protocol for back-to-back patients |
| Native APIs | Python, C, .NET, Android, Unity, MATLAB, **LSL**, UDP | We use the LSL path exclusively for vendor neutrality + synchronization |

**Placement note:** the fixed montage cannot add C1/C2/CP3/CP4 for finer spatial resolution. This
constrains spatial-filtering choices (§5.3) and is the single biggest hardware-driven limit on classifier
ceiling. A future hardware revision should prioritize denser sensorimotor coverage.

**Real stream identity (as seen from the Unicorn LSL bridge):** name e.g. `UN-2024.06.42`, type `Data`
(not `EEG`), 17 channels, 250 Hz, **no channel-label XML** → the inlet falls back to the fixed positional
layout: `0..7` EEG `[Fz,C3,Cz,C4,Pz,PO7,Oz,PO8]`, `8..13` IMU `[AccX,AccY,AccZ,Gyro1,Gyro2,Gyro3]`,
`14..16` `[Battery,Counter,Validation]`.

### 3.2 Camera — patient device (RGB)

NeuroReach uses **whatever camera the patient's display device already has** (tablet/laptop front camera,
or a USB webcam on the patient-side machine). This trades a fixed, calibrated, clinic-mounted camera for
"the device the patient is already looking at" — more convenient, but introduces variable camera quality,
angle, and lighting (mitigations in §7.3). A clinic may still mount a dedicated tablet to recover a
controlled view. **RGB-only** — the patient device won't have depth, so the RGB-D upgrade path is dropped
for this in-clinic-decoupled topology.

### 3.3 Clinic compute

| Component | Minimum | Recommended |
|---|---|---|
| CPU | 6-core modern x86 | **8-core (i7/Ryzen 7) — now the practical floor**, because MediaPipe Pose on an incoming WebRTC stream is the heaviest sustained load |
| GPU | Integrated (CPU-only inference fine for LDA + MediaPipe Lite) | Discrete GPU (RTX-class) for heavier pose/deep nets |
| RAM | 16 GB | 32 GB |
| OS | Windows 10/11 (Unicorn tooling is Windows-first) | Same; Linux possible via community `unicorn2lsl` but adds support burden |
| Display | Clinician monitor | Second monitor/tablet for the console |
| Peripherals | USB Bluetooth dongle (if no BT5), chin-height mount | — |

The clinic PC additionally runs the Electron shell + LAN server + `aiortc` video receive + MediaPipe.

### 3.4 Patient device

Any device with: a modern evergreen browser (Chromium/Firefox/Safari ≥ last 2 years), a front-facing
camera, and clinic-LAN connectivity (Wi-Fi or Ethernet). **No app install, no GPU requirement. Screen
≥ 10".**

---

## 4. Software Stack & Repository Layout

### 4.1 Stack

| Layer | Technology | Why |
|---|---|---|
| Device bridge | g.tec **Unicorn Suite** (DevTools → LSL) or `UnicornLSL.exe` | Vendor-supported, zero-code EEG+IMU → LSL |
| Stream transport | **Lab Streaming Layer (`liblsl` / `pylsl`)** | Cross-language, sub-ms clock sync across EEG, camera markers, game events |
| Real-time signal processing | **Python 3.11**, `pylsl`, `numpy`, `scipy`, `mne`, `scikit-learn`, `pyriemann` | Mature EEG ecosystem; MNE ships CSP, filtering, ICA |
| Online deep classifier (optional) | `braindecode` (EEGNet, ShallowConvNet), `torch` | Online-MI-friendly upgrade path |
| Computer vision | `mediapipe` (Pose + Hands), `opencv-python` | Best-in-class CPU-only real-time pose |
| Video ingest (clinic side) | **`aiortc`** (Python WebRTC) receives the patient track, feeds MediaPipe | Lets the existing vision pipeline consume a remote camera with minimal change |
| Fusion/scoring service | Python, exposes **WebSocket** (`websockets`) and/or OSC (`python-osc`) | Clients consume a simple normalized score stream, decoupled from internals |
| Patient client | **React + TypeScript + Vite**, canvas rendering via **PixiJS** for 2D mini-games | Zero-install, runs on any device, far faster iteration than Unity for 2D neurofeedback visuals |
| Patient ↔ engine transport | **WSS** (score/control) + **WebRTC** (patient→clinic video) | Browser-native; WebRTC for live video, WSS for the 20 Hz score |
| Clinician console | **Electron** (Chromium renderer + Node main) wrapping the React UI; FastAPI retained inside the sidecar | One-click installable desktop app the clinic owns; spawns/supervises the sidecar and hosts the LAN server |
| Signal engine packaging | **Same Python**, PyInstaller-frozen **sidecar** launched by Electron | Reuse 100% of validated DSP/classifier code; no rewrite risk |
| Local data store | **SQLite** (session/event logs) + EEG raw capture in **BDF/EDF** (`pyedflib`) | Clinically-familiar; easy hand-off to a biostatistician |
| Packaging/deployment | **electron-builder** → one-click Windows installer bundling Electron + frozen sidecar + React build + Unicorn software (licensing caveat §14.2) | Single artifact, single download |
| Version control / CI | Git, GitHub Actions (lint, unit tests, builds) | Standard |

### 4.2 Repository layout

```
thalis-rehab-game/            # (product: NeuroReach)
├── docs/                     # specs.md (this file), design docs, wireframes, SOPs
├── signal-engine/            # Python real-time service
│   ├── acquisition/          # LSL inlets (EEGInlet), MockUnicornOutlet
│   ├── preprocessing/        # causal/offline filters, DC-offset, CAR, artifact gates
│   ├── features/             # band power, ERD + laterality index
│   ├── calibration/          # Graz cue orchestrator, marker outlet, epoch extractor
│   ├── classifiers/          # CSP+LDA fit + online decode
│   ├── scoring/              # ring buffer, IntentScore engine, threaded ScoringService, signal quality
│   ├── server/               # NeuroReachWSServer (asyncio, 20 Hz broadcast + commands)
│   ├── run_ws_server.py       # entrypoint (mock EEG → scoring → ws://localhost:8765)
│   └── tests/
├── clinician-console/        # Electron app
│   ├── src/main/             # Electron main: sidecar supervisor + lan/ (LAN server, pairing, cert, relay, signaling)
│   ├── src/renderer/         # React console UI (C1–C5) + PairingPanel
│   ├── src/data|scoring|net/ # in-memory store, score/quality parsers, WS client
│   └── integration/          # live sidecar + LAN spine tests
└── patient-web/              # React + TS + Vite patient game
    ├── src/scenes/           # Welcome / Calibration / GameModeSelect / Garden / StarCatch / Summary / Pairing
    ├── src/garden|reach/     # PlantGrowthModel, ReachModel (ported pure logic)
    ├── src/warmup/           # 3D Shadow-Hand warm-up viz
    ├── src/scoring|net/      # IntentScore parser/store, scoreClient (WSS), lanClient (pairing)
    └── integration/          # live mock-EEG sidecar tests
```

> The former Unity `game-client/` is **removed**. Its pure-logic contracts (`PlantGrowthModel` state
> machine, `SessionStats` summary text, IntentScore parsing) were **ported to TypeScript** in
> `patient-web/` and keep their unit tests (Vitest instead of NUnit).

### 4.3 The Electron LAN server

Lives in `clinician-console/src/main/lan/`. Responsibilities:

1. **Serve the React patient build** as static assets over HTTPS on the clinic LAN.
2. **Session-code pairing (§4.4):** mint code, render QR, authorize exactly one patient socket per live
   session, expire on session end.
3. **Score broadcast:** subscribe to the sidecar's existing 20 Hz IntentScore WS, fan **only
   `intent_score`** out to the paired patient over WSS (`eeg_quality` never leaves the clinician side).
4. **WebRTC signaling:** broker the SDP/ICE handshake between the patient browser (camera publisher) and
   the sidecar's `aiortc` receiver. On a single LAN, host ICE candidates suffice — **no STUN/TURN, no
   internet.**
5. **Local TLS:** terminate HTTPS/WSS with a clinic-local certificate (§12.3). Required because the
   patient page calls `getUserMedia()` + WebRTC, both of which demand a secure context.

The sidecar keeps owning DSP, fusion, MediaPipe, SQLite/EDF, and FastAPI REST for the clinician UI.
Electron main owns process supervision + everything patient-facing on the LAN. The LAN server **binds
the LAN-IP only** (never a routable/public interface) and enforces an **Origin allowlist** on WS upgrade.

### 4.4 Session-Code Pairing

Connects one arbitrary browser device to one live clinician session, securely, with no typing of IP
addresses.

**Flow:**
1. Clinician clicks **Start Session** in the console. Main generates a short, human-readable **session
   code** (6 chars, confusable-free alphabet `23456789ABCDEFGHJKMNPQRSTVWXYZ`) and a **QR** encoding
   `https://<clinic-pc-lan-host>:<port>/?c=<code>`.
2. Patient device scans the QR (or opens the URL + types the code). The browser loads the React app
   **from the clinic PC** over HTTPS.
3. The app opens a **WSS** connection and presents the code; the LAN server validates it, binds that
   socket to the live session, and **rejects any second claimant** (`session_taken`).
4. The app requests camera permission (`getUserMedia`) and starts publishing video to the sidecar via
   WebRTC (signaled through the LAN server).
5. Pairing is **scoped and ephemeral**: the code authorizes exactly that session, carries no PHI, and is
   invalidated when the clinician ends the session or it times out (short TTL). Patient identity is taken
   from the paired ack, not hard-coded.

**Security properties:** LAN-only reachability, single-use binding, short TTL, strict origin allowlist,
no PHI on the patient channel (only game state + the 0–100 score). The patient device is a **kiosk peer**
— it can *see* a score and *send* its camera, nothing more (preserves the clinician/patient role
separation of §11.2).

---

## 5. Signal Acquisition & Preprocessing Pipeline

### 5.1 Acquisition

- All streams (EEG, IMU, pose markers, game-event markers) are LSL streams discovered by name/type at
  runtime (`resolve_byprop`) — the signal engine never hard-codes a device.
- A **marker stream** (`NeuroReach-Markers`, type `Markers`, string, `"label|{json}"` format) is created
  by the engine to timestamp every trial event (cue onset, MI window start/end, feedback, score). This is
  what lets us reconstruct exact trial-locked ERD curves for clinical reporting.
- **Single aligned pull:** the real-time loop uses `EEGInlet.get_chunk()` — one `pull_chunk` yielding
  time-aligned EEG **and** IMU. Two separate pulls would steal samples from each other, gapping the EEG
  and corrupting the stateful causal filter.
- Ring buffer: rolling ~6-second window per channel (baseline + up to 4 s MI window + margin), updated
  each pull at ~20–50 Hz for low-latency scoring.
- **Clock sync:** LSL `time_correction()`, polled every few seconds, applied to all inlets so EEG, video,
  and markers share one timeline within ~1 ms.

### 5.2 Preprocessing (per incoming chunk)

1. **DC-offset removal** (front-end, causal): `DCOffsetRemover` latches ONE per-channel offset and
   subtracts that same constant on every later chunk, so it never injects a boundary discontinuity that
   re-excites the IIR. Sits first: `DCOffsetRemover → CausalFilterChain → CAR → …`.
2. **Bandpass** 1–40 Hz (Butterworth, order 4): zero-phase `filtfilt` for buffered/offline paths; causal
   IIR (`CausalFilterChain`, persistent SOS state) for the true real-time path (no lookahead).
3. **Notch** at line frequency (60 Hz US / 50 Hz EU) + harmonic if needed.
4. **Artifact rejection / quality gating** — runs on **raw (pre-filter, pre-CAR)** data, because CAR
   cancels common-mode spikes and the bandpass attenuates them, blinding a post-pipeline gate:
   - Amplitude threshold reject (`AmplitudeGate`, >100 µV p-p over C3/Cz/C4 → contaminated → suppress that
     window's scoring).
   - IMU head-movement gating (`MovementGate`): accel/gyro variance over threshold → suppress EEG scoring
     (prevents jaw clench / head turn reading as ERD).
   - Fz monitored as an EOG-proxy; large deflections trigger a brief scoring hold.
5. **Spatial filter — Common Average Reference (CAR)** across all 8 channels (robust default; a true
   Hjorth Laplacian wants immediate neighbors this cap lacks).
6. Per-channel z-score / adaptive normalization against a rolling baseline handles slow drift and
   inter-session impedance differences.

### 5.3 Feature extraction

- **Band-power ERD/ERS (baseline, always available, interpretable):** mu (8–12 Hz) and beta (13–30 Hz)
  power at C3, Cz, C4 via Welch/STFT over a sliding 1 s window, 250 ms step.
  `ERD% = (Pbaseline − Ptask) / Pbaseline × 100`.
  **Laterality Index** `LI = (ERD_C3 − ERD_C4) / (ERD_C3 + ERD_C4)` for affected-hand tasks.
- **CSP + LDA (per-patient trained, higher ceiling):** trained on the patient's own calibration session
  (§6); CSP filters are **not** generalizable across patients/sessions and must be retrained each
  session/week. With only 8 fixed channels, use 2–4 spatial-filter pairs max (more risks overfitting).
- **Optional upgrade path — Riemannian geometry (`pyriemann`) or EEGNet:** Riemannian (covariance +
  tangent space + LDA/SVM) is more robust than CSP with limited channels/trials; EEGNet is the deep
  option once cross-session data supports population pretraining + few-shot per-patient fine-tuning
  (addresses the cold-start "every session needs full recalibration" problem).

---

## 6. Calibration Protocol (per patient, per session)

Stroke patients frequently cannot move the affected limb, so MI trials can't be labeled by EMG-confirmed
movement. NeuroReach uses the standard **Graz-style cue-paced paradigm** — the patient imagines on cue, no
movement confirmation needed for labeling. The calibration **cues and instructions render in the React
app** on the patient device; the clinician drives calibration from the console; cue markers still flow on
the LSL marker stream.

**Block structure (≈8–10 min, at session start or once per week once the classifier is stable):**

1. **Baseline rest** — 60 s eyes-open fixation → resting spectral baseline.
2. **Cued trials** (≈20 per class — "imagine affected-hand grasp" vs "rest", or affected vs unaffected):
   - 2 s fixation cross → 1.25 s directional cue (arrow / iconic hand) → 4 s **kinesthetic** imagery
     window ("feel the movement," not just picture it) → 2–3 s randomized-ITI rest.
3. **Camera concurrently records** to flag compensatory movement during "covert" trials — those trials are
   marked invalid and excluded from CSP/LDA training (§7).
4. CSP filters + LDA (or Riemannian) fit offline immediately after the block (sub-second at this volume),
   loaded into the online classifier for gameplay.
5. **Quality gate:** if cross-validated accuracy is below threshold (e.g. 60% for 2-class), flag "BCI
   low-confidence" and auto-switch to **Blended Mode** (§8.3), where camera-confirmed movement carries
   more scoring weight. Directly addresses the ~40% "BCI illiteracy" population — nobody is locked out.
6. Calibration data + filters are **versioned per patient** so week-over-week classifier drift/improvement
   is itself a tracked clinical metric.

---

## 7. Camera-Based Movement Verification

### 7.1 Two distinct jobs (unchanged)

1. **Confound detection during covert-MI trials.** Patients may (consciously or not) tense/move during
   "imagine only" trials, inflating EEG ERD through movement artifact rather than genuine cortical
   modulation. The camera is the ground-truth check that a "pure MI" trial actually stayed covert.
2. **Kinematic scoring during attempted-movement trials.** For patients with partial volitional control,
   later phases ask for a real movement attempt (reach, grasp, wrist extension). The camera supplies the
   primary clinically-meaningful signal: ROM, movement smoothness, and compensatory trunk lean (a very
   common stroke compensation good rehab specifically discourages).

### 7.2 Pipeline — camera is now remote

```
Patient browser  getUserMedia(webcam)
   → RTCPeerConnection video track
   → [WebRTC over clinic LAN, host candidates only]
   → aiortc receiver in the Python sidecar
   → frames → MediaPipe Pose (33 landmarks) / Hands (21/hand) → kinematic features
   → fusion engine (unchanged) → IntentScore
```

- **Transport:** WebRTC, not raw frames over WebSocket — hardware-accelerated encode on the patient
  device, congestion control, low latency. Signaling brokered by the LAN server (§4.3); one LAN needs no
  STUN/TURN.
- **Where vision runs:** still the sidecar. `aiortc` decodes the track to frames and feeds the existing
  MediaPipe worker; the fusion engine downstream is untouched. Pose is **not** published as its own LSL
  stream by an OpenCV worker — the aiortc→MediaPipe path produces the same kinematic feature objects the
  fusion engine already consumes. The LSL **marker** stream (trial events) is unaffected.
- Derived kinematic features per frame: joint angles (shoulder flexion, elbow flexion, wrist extension)
  from landmark triplets; **trunk displacement** relative to a calibrated seated-rest pose (the key
  compensation detector — exceedance during covert-MI invalidates the trial, during attempted-movement
  reduces the kinematic score and triggers a "keep your trunk still, reach with your arm" cue); movement
  velocity/smoothness (jerk) as a movement-quality proxy.
- **Rest-pose calibration:** a 5-second "sit still in rest position" capture at session start defines the
  per-patient/per-session rest pose for all relative-displacement calculations (absorbs chair position,
  camera angle, body size).
- **Affected-side auto-detection:** clinician sets affected side once in the profile; the pipeline mirrors
  landmark indices so one code path serves left- or right-hemiparetic patients.

### 7.3 Robustness (consequences of a patient-owned camera)

- **Variable camera/angle/lighting.** Mitigations: rest-pose calibration (already relative, absorbs
  angle/body differences); a **framing-check** setup step ("we can see your head, shoulders, and affected
  arm — ✓"); conservative default compensation thresholds; clinician override. RGB-D is dropped.
- **Partial occlusion** (affected arm tucked against torso) is common — flag low-confidence landmarks
  (`visibility`), fall back to last-known-good with decay, or exclude that joint's contribution for the
  frame; never let a noisy keypoint silently corrupt the score.
- **Network jitter / frame drop on the LAN.** The fusion engine must treat **missing pose as "no kinematic
  evidence," not "no movement"** — a dropped frame must never fabricate a clean covert-MI trial or a false
  compensation flag. Reuse confidence-gating / last-known-good decay; extend to cover frame-arrival gaps.
- **Camera permission denial / no camera.** If the device can't supply video, fall back to **EEG-only
  scoring** (Mode A covert-MI with the validity-gate disabled, or a clinician-acknowledged EEG-only mode)
  rather than blocking the session. Surface this clearly in the console.

---

## 8. Sensor Fusion & Scoring Engine

### 8.1 The IntentScore

A single normalized 0–100 value, updated at ~20 Hz, drives all game mechanics — a weighted blend whose
weights depend on the **session mode**:

```
IntentScore = w_eeg · EEG_Score + w_kin · Kinematic_Score − Penalty_Compensation
```

- `EEG_Score`: classifier output mapped to 0–100 — for LDA, calibrated distance-to-hyperplane
  (sigmoid-squashed); for band-power mode, normalized ERD% relative to the patient's calibrated dynamic
  range.
- `Kinematic_Score`: normalized ROM/velocity progress toward the trial's target (0 in covert-MI mode by
  design).
- `Penalty_Compensation`: subtracted when trunk-lean/compensation exceeds threshold, **regardless of
  mode** — a hard clinical-quality guardrail, not a difficulty knob.

**Input-validity rule (remote camera):** a dropped/absent pose frame is *absent evidence*, never clean
evidence (§7.3).

### 8.2 Mode A — Covert Motor Imagery (early-stage / severe impairment)
`w_eeg = 1.0`, `w_kin = 0` for the reward score, **but** any detected movement during the imagery window
converts the trial to "invalid — please keep still and just imagine" (gentle feedback) and excludes it
from both score and classifier training. Camera acts purely as a validity gate. The current
band-power-only real-time path implements this mode (`mode: "band_power_only"`); the CSP+LDA blend engages
when the classifier is reliable (`mode: "csp_lda_blend"`).

### 8.3 Mode B — Blended (default for most patients; required "BCI illiteracy" fallback)
`w_eeg = 0.5–0.7`, `w_kin = 0.3–0.5` (clinician-tunable, sensible default, auto-adjusted down if
calibration accuracy was low — §6 step 5). Patient is cued to *attempt* the movement while imagining;
both channels reward effort, so a patient who decodes poorly from EEG but generates *some* movement is
still meaningfully engaged.

### 8.4 Mode C — Active Movement Practice (later-stage recovery)
`w_eeg = 0.2–0.3`, `w_kin = 0.7–0.8` — shifts toward task-specific practice (real, attempted,
task-relevant movement drives more reliable recovery than imagery alone once volitional movement is
present), while EEG engagement is still tracked and lightly rewarded to keep reinforcing the
imagery-execution coupling.

### 8.5 Anti-discouragement smoothing
- Short **EMA** (τ ≈ 300 ms, α≈0.15 @ 20 Hz) on IntentScore before it reaches the game — responsive but
  not jittery (jitter erodes classifier-trust in MI-BCI UX).
- A **per-session adaptive floor/ceiling** normalizes against that patient's own day's best/worst range
  (not a fixed absolute scale), so a harder day still yields a playable, motivating dynamic range.
- Artifact windows **freeze** the score (hold previous, sub-scores null, no EMA/normalization update).

---

## 9. Game Design

### 9.1 Core feedback-loop principles (evidence-grounded)

- **Continuous, not binary, feedback.** A continuously-moving element (filling bar, rising avatar, growing
  plant) driven directly by IntentScore outperforms pass/fail feedback for sensorimotor-rhythm learning.
- **Low latency.** End-to-end (EEG sample → visible game response) **under 250 ms**; >300–500 ms reads as
  "laggy" and erodes the sense of agency that is itself part of the therapeutic mechanism. The budget now
  includes the WSS hop (LAN-local, negligible) and must be re-measured on the web client (§13).
- **Embodiment.** Where possible the avatar's *affected limb* visually mirrors the task (virtual arm
  reaching, hand opening) rather than an abstract cursor.
- **Short trials, frequent rest.** 4 s MI window + rest matches calibration and avoids fatigue.

### 9.2 Mini-game catalogue (one engine, multiple "skins," same IntentScore input)

| Mini-game | Mechanic | Best for |
|---|---|---|
| **Garden Grow** | A flower grows in real time with sustained IntentScore; wilts slowly on low engagement, recovers — never punitive resets | Covert MI, early-stage, lowest cognitive load |
| **Reach & Collect / Star Catcher** | Avatar arm reaches toward stars at clinically-relevant ROM targets; reach extends proportionally to combined EEG+kinematic score | Blended/Active modes, ROM-specific goals |
| **River Rowing** | Bimanual/unimanual rowing avatar (NeuRow-style VR-BCI paradigm) | Bimanual coordination goals |
| **Story Mode "Lighthouse Keeper"** | Light narrative wrapper across sessions (the lighthouse gets repaired bit by bit) | Multi-week engagement / adherence |

Implemented in **React + PixiJS** instead of Unity. **Garden Grow ships first**, porting the
`PlantGrowthModel` state machine to TypeScript verbatim (it was already pure, engine-independent logic).
See `docs/gardengrow.md` and `docs/reachcollect.md` for the built game designs.

### 9.3 Accessibility (non-negotiable, stroke-specific)

- **Hemianopia / neglect:** primary elements default to the patient's intact visual field, clinician-
  configurable layout; avoid peripheral/far-lateral cues.
- **Aphasia:** icons/pictograms over text; any text short, high-contrast, large; non-verbal audio cues
  (tones/chimes) with optional spoken instructions.
- **Fatigue & cognitive load:** 15–20 min active gameplay with built-in rest; conservative,
  clinician-adjustable difficulty ramps.
- **One-handed/seated operation:** no menu needs bimanual unaffected-hand input; the clinician (not the
  patient) drives session start/navigation by default.
- **Color/contrast:** WCAG-AA contrast, colorblind-safe palettes (never red/green as sole signal).
- **Web realization:** browser zoom, OS high-contrast, ARIA semantics help; the React app must honor
  `prefers-reduced-motion` and avoid small touch targets. The **no-strobe/photosensitivity** rule (§12) is
  enforced in the render layer.

### 9.4 Adaptive difficulty
Per-trial target thresholds ("reach 60% IntentScore to bloom") auto-adjust with a simple up/down staircase:
2–3 consecutive successes raise the bar slightly, a miss lowers it, keeping the patient in a ~70–80%
success-rate flow band (avoids the "never succeeds → gives up" failure mode). Weekly progression is
tracked so rising baseline difficulty is itself a visible progress indicator ("you're playing at a higher
level than last week"), independent of slow/noisy raw clinical scores.

### 9.5 Client architecture
- React + TS + Vite; routes/scenes: `Welcome`, `Calibration`, `GameModeSelect`, individual games,
  `SessionSummary` (+ `Pairing` gate when a session code is present).
- `src/net/`: a **WSS score client** (subscribes to IntentScore + raw sub-scores for layered visuals,
  reconnect/backoff) and a **WebRTC camera publisher**; `lanClient` handles pairing.
- `src/scoring/`: IntentScore buffer + parser ported from the C# contracts — **the JSON wire format is
  unchanged**, so the sidecar broadcast needs no modification beyond being fanned out by the LAN server.
- Game-session events are emitted back for logging (WSS → LAN server → sidecar → SQLite / LSL markers).

> **Preserved JSON score frame:** `{"type":"intent_score","intent_score":…,"erd_score":…,`
> `"classifier_score":…,"is_artifact":…,"mode":…,"timestamp":…}`. A separate `eeg_quality` frame (per-
> channel good/check/poor + MI trace, 5 Hz) feeds the console's Setup screen and **never** reaches the
> patient channel.

---

## 10. Clinical Workflow & Session Protocol

### 10.1 Setup checklist (target < 10 min)
1. Don the Unicorn headset; check contact via the console's signal-quality widget.
2. **Open the patient device, scan the session QR, grant camera permission, confirm the framing-check**
   (~30 s).
3. Confirm patient profile, affected side, and mode in the console.
4. Run the calibration block (§6).
5. Begin gameplay.

### 10.2 Session structure (typical 30–40 min clinic slot)

| Phase | Duration | Notes |
|---|---|---|
| Setup + impedance check | 5–8 min | Clinician-led |
| Calibration (full weekly; abbreviated 2–3 min daily refresh) | 3–10 min | |
| Gameplay block 1 | 8–10 min | |
| Rest | 2–3 min | |
| Gameplay block 2 | 8–10 min | |
| Cooldown + patient session summary | 2 min | |
| Doff + clean | 3–5 min | |

### 10.3 Clinician console responsibilities
- Patient profile management (affected side, severity notes, contraindications).
- **Live monitor:** raw EEG quality trace, current ERD/Laterality Index, classifier confidence, kinematic
  ROM trace, current mode — translated into plain-language status ("Good signal," "Check Cz contact,"
  "Switching to Blended Mode — low MI decode confidence").
- Session history & trend charts (ERD, classifier accuracy, ROM, difficulty level over weeks).
- Export: PDF session summary, CSV/EDF raw export for research.
- Protocol editor: trial counts, rest durations, enabled mini-games, mode-weighting overrides.
- **Pairing panel** (session code + QR + "patient connected ✓ / camera live ✓") and a **camera-link
  health** readout (WebRTC connection state, frame rate, "vision degraded — running EEG-only" per §7.3).

The five wireframe screens are C1 Roster · C2 Setup & signal-quality · C3 Live monitor · C4 History &
Trends / Assessments · C5 Protocol editor (see `docs/wireframes/`).

---

## 11. Data Management & Outcome Reporting

### 11.1 Data model (high level)
```
Patient(id, affected_side, enrollment_date, notes)
Session(id, patient_id, date, mode, clinician_id, duration)
CalibrationRun(id, session_id, accuracy, csp_filters_path, model_path)
Trial(id, session_id, cue_type, onset_ts, mi_window_ts, valid_flag,
      eeg_score, kinematic_score, intent_score, compensation_flag)
ClinicalAssessment(id, patient_id, date, instrument["FMA-UE"|"ARAT"], score)
RawCapture(id, session_id, edf_path, pose_log_path)
```
- `Trial.valid_flag` records the camera's covert-MI validity-gate role (§7.1) — for real-time scoring
  exclusion and later research-quality data cleaning.
- `ClinicalAssessment` lets the clinician enter formal FMA-UE/ARAT scores so the dashboard can plot
  system-derived proxy metrics against real clinical outcomes over time.

### 11.2 Storage & privacy
- **Local-first:** SQLite + flat-file EDF/pose logs on the clinic PC. No cloud sync unless explicitly
  configured by clinic IT (e.g. a clinic-controlled, BAA-covered server).
- **Encryption at rest:** DB + raw capture on an encrypted volume (BitLocker minimum); consider
  field-level encryption for direct identifiers.
- **De-identification for research export:** strip/pseudonymize direct identifiers, retain only a study
  ID — required before any data leaves the clinic (HIPAA Safe Harbor / expert determination, per the
  clinic's privacy officer).
- **Access control:** console requires login; role separation between "clinician" (full access) and
  "patient-facing kiosk" (no PHI, session-control only). The **patient web client holds no persistent
  PHI** — it is a transient, code-paired peer (§4.4). The sidecar's FastAPI + SQLite layer is the data
  layer.

---

## 12. Safety, Regulatory & Security

> Engineering guidance, not legal advice — final regulatory strategy needs qualified counsel before any
> clinical claim.

- **Intended-use framing matters.** A "general wellness"/engagement + biofeedback game sits in a very
  different regulatory bucket than one claiming to "treat"/"improve recovery from" stroke. Decide early,
  with counsel, whether NeuroReach is (a) a research tool under IRB oversight, (b) a non-claims
  wellness/engagement product used as a clinician-supervised adjunct, or (c) a path toward FDA SaMD
  clearance. Don't let the roadmap silently assume one path.
- **No autonomous clinical claims in-product.** All in-app/console benefit copy is hedged and descriptive
  ("track your engagement and movement over time"), not promissory, until a trial + any required clearance
  back stronger claims.
- **Electrical/physical safety:** Unicorn Hybrid Black is CE-marked, battery-powered, isolated. Standard
  EEG practices apply (skin/gel-allergy check, sensible session limits, comfortable strap for
  spasticity/tone).
- **Photosensitive-seizure risk:** no screen flicker/strobing in any game visual — relevant given stroke
  survivors' elevated seizure-risk profile.
- **Fatigue monitoring:** the console surfaces a fatigue/attention proxy (declining signal quality +
  classifier confidence + kinematic engagement together) and prompts a "consider ending session" flag.
- **IRB/ethics approval** before any research-purpose data collection; build the §11 pipeline
  IRB-compliant from day one (consent field on `Patient`, de-identified export path).
- **Informed consent/assent:** plain-language script (for patients and caregivers, given possible
  aphasia/cognitive involvement) covering what EEG does and doesn't do (it does not read thoughts/words),
  data use, and the ability to stop anytime.

### Security (delivery-specific)

- **12.1 Attack surface.** A LAN-served web app + paired browser peer widens the surface vs a
  self-contained Unity build. Mitigations: **LAN-only binding** (never bind to a routable/public
  interface), single-use session-code auth, per-session socket binding (reject second claimants), short
  code TTL, strict origin/CORS allowlisting, no PHI on the patient channel.
- **12.2 PHI containment.** The only data on the patient channel is game state + the 0–100 score outbound
  (not PHI) and the patient's own webcam video inbound. Video is processed to kinematic features; per the
  data model, **only feature/score data is persisted — raw patient video is not stored** unless a clinic
  explicitly enables research capture under consent (then it is PHI, encrypted on the clinic PC, §11).
  Default-off, consent-gated.
- **12.3 Local TLS / secure context (hard requirement).** Because the patient page uses `getUserMedia` +
  WebRTC, the LAN server **must** serve HTTPS/WSS. Options, in order of preference:
  1. **Provisioned clinic-local CA + per-install leaf cert** — installer adds the CA to the clinic PC and
     the setup flow walks the patient device through a one-tap trust. Cleanest UX, no browser warnings.
  2. **Self-signed cert with trust-on-first-use (TOFU)** — simplest to ship; cost is a one-time browser
     interstitial the patient accepts per device. Acceptable for clinician-supervised setup. *(Current dev
     default; pinned `selfsigned@2.x` for the sync API.)*
  3. mDNS/`.local` + a real cert via a clinic-owned domain — only if that infrastructure already exists.

  The installer/provisioning flow must pick one and make it turn-key; **do not** leave cert setup as a
  manual clinician chore.

---

## 13. Testing & Validation Plan

### 13.1 Bench / unit
- Signal-processing: unit tests against synthetic EEG with known injected ERD (verify detection within
  tolerance).
- **Patient web client (Vitest):** ported `PlantGrowthModel`/`SessionStats` contracts + WSS-client parse
  tests against the JSON frame.
- **Console (Vitest):** decoupled parser/store/WS-client/supervisor + LAN pairing.
- Latency: instrument the full pipeline (LSL timestamp → WSS → React render); target p95 < 250 ms (§9.1).
- Vision: validate joint-angle estimates against a goniometer ground-truth rig before trusting ROM
  scoring; verify MediaPipe angles on a **remote** aiortc stream still match ground truth.

### 13.2 Integration / system
- **End-to-end latency re-measured on the web path:** EEG sample → sidecar → LAN server → WSS → React
  render. Re-validate p95 < 250 ms.
- **WebRTC video-path:** aiortc receives the patient track; **frame-drop / camera-deny correctly degrades
  to EEG-only** (§7.3) rather than fabricating clean trials.
- **Pairing/security:** single-claimant enforcement, code expiry, LAN-only binding, rejection of off-LAN /
  wrong-origin connections.
- **Installer smoke test:** one-click install on a clean Windows machine brings up Electron + sidecar +
  Unicorn bridge + LAN server; an offline (no internet) full-session run still succeeds.

### 13.3 Usability (non-clinical, internal)
- Healthy-volunteer pilot first (team + a few volunteers) to shake out UX/ergonomics before patient
  contact. Then a small supervised usability pilot with stroke survivors (under ethics oversight if any
  data is retained): setup time, comfort, instruction comprehension, subjective engagement (Likert),
  fatigue.

### 13.4 Signal/classifier validation
- Per-patient calibration accuracy tracked as a first-class metric (§6 step 5) — the ongoing production
  validation signal, not a one-time check.
- **Offline replay ("shadow mode"):** store raw EEG+pose for a cohort and replay through pipeline updates
  to verify no regression before deploying a new classifier/preprocessing version.

### 13.5 Clinical pilot study design (future, with IRB)
- Small-N (n≈10–15) single-arm feasibility/engagement pilot first (feasibility, usability, safety — **not**
  an efficacy claim). If promising, a properly powered RCT (active control = equivalent-dose standard
  therapy or sham-feedback BCI) with a biostatistician and the FMA-UE/ARAT outcome data this system is
  already structured to support.

### 13.6 On-head hardware validation schedule (four gated sessions)

Everything validatable with synthetic/mock data must be, before touching the headset. Only four things
genuinely require a real brain signal: amplitude/ERD ground-truth, labeled MI calibration data, end-to-end
perceptual latency, and clinical-workflow validation.

| Session | Gate | What it confirms |
|---|---|---|
| **H1 — Signal quality + ERD ground-truth** | §4-required items done (pytest markers, dead-channel flag) | µV amplitudes 10–100 µV on C3/Cz/C4; DCOffsetRemover latches on-head DC; self-paced MI → mu-ERD > 15% at C3, LI > 0; IMU noise floor. Sets production thresholds. |
| **H2 — Calibration + classifier** | Graz block + CSP+LDA built & mock-tested | Full 8-min block (60 s rest + 20 cued MI); CSP+LDA CV accuracy ≥ 60% to proceed EEG-led (else Blended); per-patient filter versioning round-trips; 5-min live ERD→classifier correlation. First real calibration dataset. |
| **H3 — End-to-end stack + latency** | Fusion service + WS server + patient web all mock-tested | Full live pipeline Unicorn → signal-engine → WSS → React; instrument p95 < 250 ms; subjective responsiveness; EMA τ tuning; console trace < 500 ms behind signal. First closed-loop proof. |
| **H4 — Usability pilot + workflow** | Console complete, hardening done, camera/CV integrated (or `w_kin=0` stub) | Full 30–40 min protocol; setup < 10 min; adaptive staircase holds 70–80% band; fatigue proxy triggers console flag; dead-channel indicator fires on bad contact; full SQLite log + PDF export. Go/no-go for §13.5. |

---

## 14. Deployment Architecture

### 14.1 One-click Electron installer
- **electron-builder** produces a single Windows installer bundling: the Electron app (main + renderer),
  the **PyInstaller-frozen sidecar**, the React patient build (served by the LAN server), and the Unicorn
  software (caveat §14.2). Post-install wizard: Bluetooth pairing, cert provisioning (§12.3), Wi-Fi/LAN
  confirmation, a self-test that boots the sidecar and serves a test pairing.
- Electron **main** supervises the sidecar (start/stop/restart/health) — the clinician never touches a
  terminal (the operational win over the old terminal-launched Python service).
- **Offline-first preserved:** the whole stack runs with no internet. Update is a manual-trigger "check for
  clinic update" (change-control friendly), never silent auto-update.

### 14.2 g.tec Unicorn software bundling — **licensing flag (legal decision required)**
Bundling the Unicorn Suite / LSL bridge is the goal, but g.tec's software **likely cannot be
redistributed without a redistribution agreement.** A legal/business decision, not engineering. Two paths:
- **(Preferred, pending agreement):** obtain redistribution rights → true single-artifact install.
- **(Fallback):** the installer **detects and auto-launches** an existing Unicorn install, or guides a
  one-time vendor-installer step in the wizard — still "one download + a guided step," without
  redistributing g.tec binaries.
Engineering should build against the fallback and treat full bundling as a flag flipped once legal clears.

### 14.3 Multi-station scaling
Each station is an independent local deployment by default; a clinic-LAN central record server remains a
deliberate future decision, not baked in early (real IT/security scope).

---

## 15. Development Roadmap

**Delivered (v1 signal core + v2 web/console foundation):** signal acquisition, preprocessing, ERD
features, Graz calibration orchestrator, CSP+LDA classifier, IntentScore fusion + threaded scoring
service, WebSocket transport, the full clinician console (C1–C5, mock/in-memory), the patient web client
(Welcome/Calibration/Garden/StarCatch/Summary), and the LAN server + session-code pairing spine. See
`docs/todos.md` for the component-level status and test inventory.

| Phase | Scope | Status |
|---|---|---|
| **V2-0 — Sidecar + LAN spike** | Electron spawns the sidecar + serves the React page over HTTPS; one device pairs and renders the live IntentScore | ✅ foundation done (console C1–C5, S1 LAN + pairing) |
| **V2-1 — Patient web client** | Port `PlantGrowthModel`/`SessionStats`/parser to TS; Garden Grow + Star Catcher in React; Welcome/Calibration/Garden/Summary; WSS score client. Delete `game-client/`. | ✅ done & merged |
| **V2-2 — Remote camera (WebRTC)** | Patient `getUserMedia` → WebRTC publish; `aiortc` receive → existing MediaPipe; frame-drop/deny → EEG-only fallback; framing-check setup step; `kinematic_score` fusion | ⏳ next (signaling is an echo stub; S2) |
| **V2-3 — Clinician workflow** | Engine control channel (pause/rest/end/switch-mode), camera-link health panel, SQLite/FastAPI persistence, live monitor over IPC | ⏳ pending (S3) |
| **V2-4 — Packaging & hardening** | electron-builder one-click installer, cert provisioning + local CA, Unicorn-launch fallback (§14.2), offline smoke test, re-measure p95 < 250 ms on the web path, security/pairing suite | ⏳ pending |

Optional upgrades (post-MVP): Riemannian/EEGNet classifier with cross-patient pretraining + few-shot
fine-tuning; PixiJS render upgrade; OSC transport; VR export; multi-station clinic-server mode.

---

## 16. Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| ~40% of patients show weak/no decodable ERD ("BCI illiteracy") | Core mechanic unusable for a meaningful minority | Blended Mode fallback (§8.3) — camera-led scoring still yields an engaging, valid session |
| Fixed 8-channel montage limits classifier ceiling | Lower decode accuracy than research-grade caps | Riemannian methods, cross-patient pretraining + fine-tuning, honest expectation-setting |
| `getUserMedia` secure-context requirement | Patient camera won't work over plain http; setup friction | Local CA / TOFU cert provisioning baked into installer (§12.3); EEG-only fallback (§7.3) |
| g.tec software not redistributable | Can't ship a true single-artifact installer | Build against detect-and-launch fallback (§14.2); pursue redistribution agreement in parallel |
| Patient-owned camera quality/angle/lighting variability | Noisier kinematic scoring than a fixed/RGB-D camera | Relative rest-pose calibration, framing-check, conservative thresholds, clinician override; drop RGB-D |
| LAN video jitter/frame drop mis-scored as movement | False covert-MI passes / false compensation flags | Treat missing pose as *absent* evidence, not clean; confidence-gating extended to arrival gaps (§7.3) |
| Wider attack surface (LAN web app + paired peer) | Security/privacy exposure | LAN-only binding, single-use code, per-session socket binding, origin allowlist, no PHI on patient channel (§12.1) |
| Electron + frozen Python sidecar packaging fragility on clinic Windows | Install/boot failures on-site | electron-builder + supervised sidecar, clean-machine smoke test in CI, post-install self-test (§14.1) |
| Latency creep degrades sense-of-agency | Reduced engagement/therapeutic value | Continuous latency instrumentation + budget enforced in CI; re-measure on the web path early |
| Overclaiming therapeutic benefit before evidence | Regulatory/ethical exposure, patient-trust harm | Hedged in-product language, explicit regulatory-path decision early (§12), pilot-before-claims roadmap |
| Clinic IT blocks Bluetooth/camera/network ports | Deployment failure on-site | Offline-first local-only architecture, pre-deployment IT checklist, minimal port/permission footprint |
| Patient fatigue / frustration from a bad session | Adherence drop, distress for a vulnerable population | Adaptive difficulty floor, fatigue-detection flag, clinician override to end/pause anytime, encouraging UX copy |
| Electrode setup too long for clinic throughput | Adoption resistance | Dry-electrode default, signal-quality UI that speeds troubleshooting, target < 10 min tracked as a hard metric |

---

## Appendix A — Electrode Montage Reference

Default Unicorn Hybrid Black 8-channel montage: **Fz, C3, Cz, C4, Pz, PO7, Oz, PO8**, mastoid reference
(M1/M2).
- **MI-primary:** C3 (right-hand/left-hemisphere motor cortex), C4 (left-hand/right-hemisphere), Cz
  (central/bilateral).
- **Artifact/context:** Fz (frontal, EOG-proxy), Pz/PO7/PO8/Oz (posterior alpha/visual-attention, quality
  monitoring — not primary MI signal).

## Appendix B — Frequency Bands Reference

| Band | Range | Relevance |
|---|---|---|
| Delta | 1–4 Hz | Filtered out / drift, not used for MI |
| Theta | 4–8 Hz | Excluded from MI scoring; monitored for drowsiness |
| **Mu (sensorimotor alpha)** | **8–12 Hz** | **Primary ERD signal for MI** |
| **Beta** | **13–30 Hz** | **Secondary ERD/ERS signal, often modulated alongside mu** |
| Gamma | >30 Hz | Not reliable at scalp level for this use case; excluded |

## Appendix C — Key Reference Threads to Track in Literature

- ERD/ERS characterization in chronic stroke using MI-BCI for upper-limb rehab (cortical reorganization).
- RCT BCI + robotic feedback trials for chronic stroke upper-limb hemiparesis (BCI-Manus-style), FMA-UE
  outcome.
- BCI + functional electrical stimulation pilot RCTs in severe upper-limb paresis, ARAT outcome.
- Multicenter placebo-controlled BCI hand-exoskeleton trials in severe paralysis.
- VR-embodied BCI training (EEG + fMRI) examining ipsilesional/contralesional motor-cortex changes.
- "BCI illiteracy" / insufficient-mu-ERD prevalence and adjunct strategies (e.g. priming stimulation).

## Appendix D — v1 → v2 Change Log (delivery-architecture pivot)

NeuroReach's signal-processing and clinical core is **unchanged** across the pivot; only the delivery
layer moved. Three architectural changes, decided with stakeholders:

| # | v1 | v2 (current) |
|---|----|----|
| **C1** | Patient game = Unity 2022 LTS native client, installed per-platform | Patient game = **React web app**, in-browser, zero-install, any device |
| **C2** | Clinician console = local React + FastAPI in a browser | Clinician console = **Electron desktop app**, one-click installer, bundles the Python signal-engine as a sidecar + g.tec software |
| **C3** | Camera plugged into the clinic PC; everything LAN-local | Camera lives on the **patient's display device**; video streamed to the clinic PC, where vision still runs |

**Binding decisions that scope those changes:**
- **In-clinic, decoupled display.** Patient + headset are physically with the clinician; the headset still
  BT-pairs to the clinic PC. Only the *display* moved to a browser on any local device. **No cloud;
  offline-first, LAN-only preserved.**
- **Unity is fully replaced** — `game-client/` deleted; `patient-web/` is the one patient client. Its
  pure-logic contracts were ported to TypeScript with their unit tests.
- **Vision stays clinician-side** — only the camera *source* moved (patient device, streamed via WebRTC →
  aiortc → MediaPipe on the clinic PC).
- **Signal-engine ships as a PyInstaller-frozen sidecar** — validated Python DSP/classifier code is not
  rewritten; Electron supervises it over local IPC/WebSocket.

**Critical secondary consequence (of C3):** the patient browser must call `getUserMedia()`, permitted
**only in a secure context** (HTTPS/WSS or `localhost`). A LAN device on plain `http://<clinic-ip>` cannot
get camera access — so the patient channel **must** be served over HTTPS/WSS with a local cert (§12.3).
This reverses the "plain http is fine" assumption that would otherwise hold for a display-only client.

**Numbering note:** v2's standalone "§5 Session-Code Pairing" is **§4.4** here (folded under the LAN
server); v1's "§5 Signal Acquisition & Preprocessing" keeps §5. Sections 6–16 are aligned across both
revisions.

---

*End of specification. NeuroReach preserves the validated v1 signal/clinical core while delivering it
through a web patient client, an Electron clinician console with a Python sidecar, and a patient-device
camera streamed back for clinic-side vision. Recommended next step: V2-2 (real WebRTC camera + kinematic
fusion), the last piece before Blended/Active modes and verified-ROM games become possible.*
