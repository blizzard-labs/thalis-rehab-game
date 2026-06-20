# Motor-Imagery Rehabilitation Game — Engineering Specification

**System name (working title):** NeuroReach
**Target hardware:** g.tec Unicorn Hybrid Black (8-ch EEG) + RGB-D or RGB camera + clinic PC
**Document status:** v0.1 — engineering planning draft
**Audience:** firmware/signal-processing engineers, game developers, clinical stakeholders, regulatory/QA

---

## 0. Executive Summary

NeuroReach is a closed-loop neurofeedback game that turns motor-imagery (MI) quality — and, where the patient retains some movement, actual movement quality — into real-time game mechanics for stroke survivors doing upper-limb rehabilitation. Two signal streams are fused into a single trustworthy "intent score":

1. **EEG** (Unicorn Hybrid Black, 8 channels, 250 Hz) → sensorimotor rhythm (mu/beta) event-related desynchronization (ERD) → classified MI engagement.
2. **Camera (RGB or RGB-D)** → skeletal/hand pose tracking → confirms genuine attempted movement and flags compensatory "cheating" movements that would invalidate a covert-MI trial.

Both streams are synchronized through **Lab Streaming Layer (LSL)**, processed in a Python real-time pipeline, and drive a Unity-based game client over a local low-latency bridge. The system is designed to be clinic-deployable: offline-first, no patient data leaves the LAN by default, sub-10-minute setup, a clinician console for protocol configuration and progress reporting, and a roadmap toward IRB-backed pilot validation.

This document specifies the full stack: hardware, signal processing, ML classification, computer-vision verification, sensor fusion, game design, clinical workflow, data/privacy architecture, safety, testing, and deployment.

---

## 1. Clinical & Scientific Foundations (design constraints derived from evidence)

These are not appendix trivia — they directly drive engineering decisions made later in this document.

- **Mechanism.** Motor imagery and motor observation activate the sensorimotor cortex and mirror-neuron system, producing event-related desynchronization in the mu (8–12 Hz) and beta (12–30 Hz) bands over C3/Cz/C4-region electrodes. This ERD is the core signal NeuroReach decodes and gamifies.
- **"BCI illiteracy."** Roughly 40% of stroke patients show insufficient mu-ERD modulation to control a classifier reliably. **Design implication:** the system must (a) screen for MI aptitude during onboarding, (b) offer a fallback/blended mode (movement-attempt + camera-led scoring) for patients who don't decode well from EEG alone, and (c) never let a patient feel like a "BCI failure" — game design must reward effort, not just classifier output.
- **Outcome measures used in the literature** (for the clinician dashboard and any future trial): Fugl-Meyer Assessment – Upper Extremity (FMA-UE, 0–66) and Action Research Arm Test (ARAT, 0–57), with an ARAT minimal clinically important difference around 6 points. NeuroReach should log session-level proxy metrics (ERD magnitude, classifier accuracy, laterality index, ROM) that correlate with these clinical scales, and export data in a format a clinician can cross-reference against periodic FMA-UE/ARAT assessments.
- **Trial designs to emulate.** Published MI-BCI rehab studies pair the EEG decode with a contingent, embodied reward: robotic feedback (e.g., BCI-Manus shoulder-elbow robot), functional electrical stimulation, an exoskeleton, or a virtual avatar/VR task (e.g., a bimanual rowing game). NeuroReach follows this same "decode → contingent embodied feedback" pattern, substituting an engaging 2D/3D game + camera-verified movement for the robotic/FES hardware most clinics won't have.
- **Severity matters.** Patients with more severe baseline impairment show smaller/less reliable ERD changes. **Design implication:** difficulty and reward curves must be calibrated per-patient (Section 9.4), not fixed.
- **Effect sizes are real but modest, and BCI is an adjunct, not a replacement for standard therapy.** This must be reflected honestly in clinician-facing materials and in any marketing language — see Section 12 (Regulatory) for why we do not claim therapeutic efficacy without a clinical trial.

---

## 2. System Architecture Overview

```
┌──────────────────────────┐        ┌────────────────────────────┐
│   Unicorn Hybrid Black    │  BLE   │   Webcam / RGB-D Camera     │
│  8ch EEG, 24-bit, 250 Hz  │───────▶│   30–60 fps RGB(+depth)     │
│  + 6-axis IMU @ 250 Hz    │        └──────────────┬─────────────┘
└─────────────┬─────────────┘                       │
              │ Unicorn LSL App (Bluetooth→LSL)      │ OpenCV capture
              ▼                                      ▼
   ┌────────────────────┐                 ┌─────────────────────┐
   │   LSL: EEG stream    │                 │  Vision Worker (Py)  │
   │   LSL: IMU stream     │                │  MediaPipe Pose/Hands│
   └─────────┬────────────┘                 │  → LSL: Pose stream  │
             │                              └──────────┬───────────┘
             ▼                                          │
   ┌──────────────────────────────────────────────────────────────┐
   │              Real-Time Processing Engine (Python)              │
   │  ─ LSL inlets, ring buffers, clock sync                        │
   │  ─ Preprocessing: notch/bandpass, artifact rejection, CAR       │
   │  ─ Feature extraction: band power / CSP / Riemannian            │
   │  ─ Online classifier: LDA / EEGNet → continuous ERD score        │
   │  ─ Movement verification: pose velocity, joint angle, ROM        │
   │  ─ Fusion & Scoring Engine → unified 0–100 "Intent Score"         │
   │  ─ Session logger → local encrypted DB (SQLite)                   │
   └───────────────────────────┬────────────────────────────────────┘
                                │ WebSocket / OSC, ~20–60 Hz score stream
                                ▼
                  ┌───────────────────────────┐
                  │   Game Client (Unity)       │       ┌───────────────────────┐
                  │  Patient-facing rehab game   │◀─────▶│  Clinician Console (web) │
                  │  Calibration UI               │       │  Protocol config, live   │
                  │  Adaptive difficulty           │      │  monitor, reports         │
                  └───────────────────────────┘       └───────────────────────────┘
```

**Design principle:** every component communicates over LSL or a local WebSocket on `localhost`/LAN only. No cloud dependency is required for a session to run — this is essential for clinic IT approval and for offline reliability (Section 13).

---

## 3. Hardware Specification

### 3.1 EEG headset — g.tec Unicorn Hybrid Black

| Spec | Value | Engineering relevance |
|---|---|---|
| Channels | 8 EEG (default montage Fz, C3, Cz, C4, Pz, PO7, Oz, PO8) | C3/Cz/C4 are the MI-relevant electrodes; the other 5 are used for artifact rejection, reference, and posterior alpha monitoring |
| Resolution | 24-bit | Effectively no quantization noise concern |
| Sampling rate | 250 Hz | Sets Nyquist limit (125 Hz); plenty for mu/beta band (8–30 Hz) |
| Reference | Linked mastoid (M1/M2) | Use consistent reference scheme in preprocessing; do not re-reference to common average without checking impact on laplacian-style spatial filters |
| Onboard IMU | 3-axis accelerometer + 3-axis gyroscope, sampled at 250 Hz | Used for head-movement artifact detection, NOT a substitute for limb tracking |
| Electrodes | Hybrid dry/wet (g.SAHARA) | Dry is faster for clinic setup; wet/gel improves signal quality for harder cases (spasticity, hair, tremor) |
| Connectivity | Bluetooth, ~3 hr battery | Plan for a charging/rotation protocol if running back-to-back patients all day |
| Native APIs | Python, C, .NET, Android, Unity, MATLAB Simulink, **LSL**, UDP | We use the LSL path exclusively for vendor neutrality and synchronization |

**Electrode placement note:** the headset has a fixed montage — there is no flexibility to add C1/C2/CP3/CP4 for finer spatial resolution. This constrains our spatial-filtering choices (Section 5.3) and is the single biggest hardware-driven limitation on classifier ceiling performance. If a future hardware revision is considered, prioritize denser sensorimotor coverage over channel count elsewhere.

### 3.2 Camera

| Option | Recommendation | Rationale |
|---|---|---|
| **RGB webcam (1080p, 60fps, e.g., Logitech Brio)** | **Baseline / MVP** | Zero extra hardware cost beyond what most clinics own; MediaPipe Pose/Hands runs robustly on RGB alone |
| **RGB-D (Intel RealSense D435i / Azure Kinect successor)** | **Recommended for v2** | Adds true 3D joint position and depth-robust tracking through occlusion (important — hemiparetic limb often partially occluded by torso) |
| Mounting | Articulated arm or tripod, fixed relative to chair | Movement of the camera itself must not be confused with patient movement; calibrate a static extrinsic transform per session |

### 3.3 Clinic compute

| Component | Minimum | Recommended |
|---|---|---|
| CPU | 6-core modern x86 | 8-core (i7/Ryzen 7) |
| GPU | Integrated (CPU-only inference is fine for LDA/EEGNet-tiny + MediaPipe Lite) | Discrete GPU (RTX-class) if running heavier pose models or larger deep nets |
| RAM | 16 GB | 32 GB |
| OS | Windows 10/11 (Unicorn vendor tooling is Windows-first) | Same — Linux is possible via community `unicorn2lsl` reimplementations but adds support burden; **default to Windows for clinic deployments** |
| Display | One patient-facing monitor/TV (≥24") | Second monitor or tablet for clinician console |
| Peripherals | USB Bluetooth dongle (if PC lacks BT5), camera, chin-height adjustable mount | — |

---

## 4. Software Stack & Repository Layout

| Layer | Technology | Why |
|---|---|---|
| Device bridge | g.tec **Unicorn Suite** (DevTools → LSL Interface) or `UnicornLSL.exe` | Vendor-supported, zero-code path to get EEG+IMU into LSL |
| Stream transport | **Lab Streaming Layer (`liblsl` / `pylsl`)** | Cross-language, sub-millisecond clock sync across EEG, camera, markers, and game events — the backbone of the whole system |
| Real-time signal processing | **Python 3.11**, `pylsl`, `numpy`, `scipy`, `mne`, `mne-realtime` or custom ring buffer, `scikit-learn`, `pyriemann` | Mature EEG ecosystem; MNE has built-in CSP, filtering, ICA |
| Online deep classifier (optional/v2) | `braindecode` (EEGNet, ShallowConvNet implementations), `torch` (CPU or small GPU) | Pretrained-friendly, designed for online MI decoding |
| Computer vision | `mediapipe` (Pose + Hands), `opencv-python` | Best-in-class CPU-only real-time pose, runs comfortably alongside EEG pipeline |
| Fusion/scoring service | Python, exposes **WebSocket** (`websockets` lib) and/or OSC (`python-osc`) | Game engine consumes a simple normalized score stream, decoupled from EEG/CV internals |
| Game client | **Unity 2022 LTS, C#**, `LSL4Unity` package or a thin WebSocket client | Mature engine, strong asset/animation pipeline, used in published MI-BCI rehab research (e.g., NeuRow-style VR tasks); also exports to Win/Mac/tablet/VR if the clinic later wants VR |
| Clinician console | Local web app: **React + Vite**, served by a small **FastAPI** backend reading the session SQLite DB | Browser-based = zero install on a second device, easy PDF/CSV export |
| Local data store | **SQLite** (session/event logs), file-based EEG raw capture in **BDF/EDF** via Unicorn Recorder or `pyedflib` | Clinically-familiar format (EDF is the standard EEG interchange format), easy to hand off to a biostatistician later |
| Packaging/deployment | Windows installer (Inno Setup) bundling Python venv (PyInstaller) + Unity build + local services as Windows services/tray app | One-click clinic install, auto-start, no terminal required for clinicians |
| Version control / CI | Git, GitHub Actions (lint, unit tests on signal-processing module, Unity build) | Standard |

### 4.1 Repository layout

```
neuroreach/
├── docs/                          # this spec, protocols, clinician SOPs
├── signal-engine/                 # Python real-time processing service
│   ├── acquisition/               # LSL inlets, ring buffers, clock sync
│   ├── preprocessing/             # filters, artifact rejection, CAR/Laplacian
│   ├── features/                  # band power, CSP, Riemannian covariance
│   ├── classifiers/                # LDA baseline, EEGNet, calibration routines
│   ├── vision/                    # MediaPipe pose worker, kinematic features
│   ├── fusion/                    # Intent Score engine, anti-cheat logic
│   ├── server/                    # WebSocket/OSC server to game + console
│   └── tests/
├── game-client/                   # Unity project
│   ├── Assets/Scripts/Scoring/    # consumes Intent Score stream
│   ├── Assets/Scripts/Calibration/
│   ├── Assets/Scenes/             # MainMenu, Calibration, MiniGames/*, Summary
│   └── Assets/Art/
├── clinician-console/             # React + FastAPI
├── deployment/                    # installer scripts, service wrappers
└── data-schema/                   # SQLite migrations, EDF export tooling
```

---

## 5. Signal Acquisition & Preprocessing Pipeline

### 5.1 Acquisition

- All streams (EEG, IMU, pose, game-event markers) are LSL streams discovered by name/type at runtime (`resolve_byprop`). This means the signal engine never hard-codes a device — it just looks for `type == 'EEG'`, `type == 'Pose'`, etc.
- A **marker stream** (`NeuroReach-Markers`) is created by the signal engine itself and used to timestamp every trial event (cue onset, MI window start/end, feedback delivered, score). This is what lets us later reconstruct exact trial-locked ERD curves for clinical reporting.
- Ring buffer: rolling 6-second window per channel (1.5 s pre-cue baseline + up to 4 s MI window + margin), updated every pull at ~20–50 Hz for low-latency scoring.
- **Clock sync:** rely on LSL's built-in clock offset correction (`time_correction()`), polled every few seconds, applied to all inlets so EEG, video, and markers share one timeline within ~1 ms.

### 5.2 Preprocessing (per incoming chunk)

1. **Bandpass filter** 1–40 Hz (Butterworth, order 4, zero-phase via `filtfilt` on buffered data; causal IIR for the true real-time path to avoid lookahead).
2. **Notch filter** at line frequency (60 Hz US / 50 Hz EU) + harmonic if needed.
3. **Artifact rejection / quality gating:**
   - Amplitude threshold reject (>100 µV peak-to-peak in a 1s window over C3/Cz/C4 → flag as contaminated, suppress scoring that window).
   - IMU-based head-movement gating: if accelerometer/gyro variance exceeds threshold, suppress EEG-based scoring for that window (prevents jaw clench / head turn from being misread as ERD).
   - Eye-blink influence is limited at C3/Cz/C4 vs frontal sites, but Fz is monitored as an EOG-proxy channel; large Fz deflections trigger a brief scoring hold.
4. **Spatial filter — Common Average Reference (CAR) or small Laplacian** using the fixed 8-channel montage (e.g., approximate small Laplacian at C3 using Fz/Cz/PO7 neighbors — note this is a compromise given the montage; true Hjorth Laplacian wants immediate neighbors which this cap doesn't have. CAR across all 8 channels is the simpler, robust default).
5. Per-channel z-score normalization using a rolling baseline (updated each trial's pre-cue period) to handle slow drift and inter-session impedance differences.

### 5.3 Feature extraction

Two tracks, used depending on calibration data volume and patient performance (Section 6):

- **Band-power ERD/ERS (baseline, always available, interpretable):**
  - Compute mu (8–12 Hz) and beta (13–30 Hz) power at C3, Cz, C4 via Welch/short-time FFT over a sliding 1 s window, 250 ms step.
  - ERD% relative to the patient's own pre-trial baseline: `ERD% = (Pbaseline − Ptask) / Pbaseline × 100`.
  - **Laterality Index** `LI = (ERD_C3 − ERD_C4) / (ERD_C3 + ERD_C4)` for affected-hand-specific tasks — directly mirrors the metric used in the clinical literature, useful for both classification and clinician reporting.
- **Common Spatial Patterns (CSP) + LDA (per-patient trained, higher ceiling performance):**
  - Trained on the patient's own calibration session (Section 6) — CSP filters are *not* generalizable across patients/sessions and must be retrained or adapted each session/week.
  - With only 8 fixed-position channels, train CSP with 2–4 spatial filter pairs max (more risks overfitting on this channel count).
- **Optional v2 — Riemannian geometry (`pyriemann`) or EEGNet:**
  - Riemannian (covariance + tangent space + LDA/SVM) tends to be more robust with limited channels/trials than CSP and is a strong "v1.5" upgrade path.
  - EEGNet (compact CNN) is the v2 deep-learning option once enough cross-session data exists to pretrain a population model that's then fine-tuned per patient (few-shot transfer learning) — this addresses the "every session needs full recalibration" cold-start problem.

---

## 6. Calibration Protocol (per patient, per session)

Stroke patients frequently cannot move the affected limb, so we cannot label MI trials using actual EMG-confirmed movement on the affected side. NeuroReach uses the standard **Graz-style cue-paced paradigm**, which only requires the patient to imagine on cue — no movement confirmation needed for labeling.

**Calibration block structure (≈8–10 minutes, done at the start of each session or once per week once classifier is stable):**

1. **Baseline rest** — 60 s eyes-open fixation, used to compute the resting spectral baseline.
2. **Cued trials** (≈20 per class — "imagine affected-hand grasp" vs "rest", or affected vs unaffected hand for patients who can do both):
   - 2 s fixation cross
   - 1.25 s directional cue (arrow / iconic hand image)
   - 4 s imagery window (patient imagines *kinesthetically* — "feel the movement," not just picture it — per best-practice MI instruction; the clinician console includes scripted instructions to read aloud)
   - 2–3 s rest, randomized inter-trial interval to avoid anticipation
3. **Camera concurrently records** to flag any compensatory movement during "covert" trials — these trials are marked invalid and excluded from CSP/LDA training (see Section 7).
4. CSP filters + LDA (or Riemannian) are fit offline immediately after the block (sub-second fit time at this data volume) and loaded into the online classifier for the gameplay session.
5. **Quality gate:** if cross-validated calibration accuracy is below a threshold (e.g., 60% for 2-class), the system flags "BCI low-confidence" and automatically switches the session into **Blended Mode** (Section 8.3), where camera-confirmed attempted movement carries more of the scoring weight than the EEG decode. This directly addresses the ~40% "BCI illiteracy" population — nobody is locked out of a usable, motivating session.
6. Calibration data and resulting filters are versioned and stored per patient so week-over-week classifier drift/improvement is itself a tracked clinical metric.

---

## 7. Camera-Based Movement Verification

### 7.1 Why camera tracking matters here specifically

Two distinct jobs, not one:

1. **Confound detection during covert-MI trials.** A classic MI-BCI validity problem: patients (consciously or not) tense or move during "imagine only" trials, which can inflate EEG ERD through movement artifact rather than genuine cortical modulation. The camera is the ground-truth check that a "pure MI" trial actually stayed covert.
2. **Kinematic scoring during attempted-movement trials.** For patients with partial volitional control, later-stage protocol phases ask for an actual movement attempt (reach, grasp, wrist extension). Here the camera supplies the primary, clinically meaningful signal: range of motion (ROM), movement smoothness, compensatory trunk lean (a very common stroke compensation pattern that good rehab practice specifically wants to discourage).

### 7.2 Pipeline

- `mediapipe.Pose` (33 landmarks) for trunk/shoulder/elbow/wrist tracking; `mediapipe.Hands` (21 landmarks/hand) layered in when finger/grasp tasks are active.
- Landmarks are pushed to LSL as a `Pose` stream (`[x,y,z,visibility] × N landmarks`, 30–60 Hz) so they share the same timeline as EEG.
- Derived kinematic features per frame:
  - Joint angles (shoulder flexion, elbow flexion, wrist extension) computed from landmark triplets.
  - **Trunk displacement** relative to a calibrated seated-rest pose — this is the key "compensatory movement" / trunk-lean detector. Threshold exceedance during a covert-MI trial invalidates that trial; threshold exceedance during an attempted-movement trial reduces (but doesn't zero) the kinematic score and triggers an on-screen "keep your trunk still, reach with your arm" cue — this maps directly to standard physical-therapy compensation-avoidance coaching.
  - Movement velocity/smoothness (jerk metric) as a simple movement-quality proxy, in addition to raw ROM.
- **Calibration:** a 5-second "sit still in rest position" capture at session start defines the per-patient/per-session rest pose used for all relative-displacement calculations (accounts for chair position, camera angle, body size).
- **Affected-side auto-detection:** clinician sets affected side once in patient profile; pipeline mirrors landmark indices accordingly so the same code path serves left- or right-hemiparetic patients.

### 7.3 Robustness considerations

- Partial occlusion (affected arm tucked against torso) is common — RGB-D depth strongly improves robustness here over RGB-only; flag low-confidence landmarks (`visibility` score) and don't let a noisy keypoint silently corrupt the kinematic score (fall back to last-known-good with decay, or simply exclude that joint's contribution for that frame).
- Lighting/clinic environment variability — recommend a fixed, diffuse light source near the camera as part of the clinic setup checklist (Section 10).
- Wheelchair users / non-standard seated posture — rest-pose calibration handles most of this automatically since everything is relative, not absolute.

---

## 8. Sensor Fusion & Scoring Engine

### 8.1 The "Intent Score"

A single normalized 0–100 value, updated at ~20 Hz, drives all game mechanics. It is a weighted blend whose weights depend on the **session mode**:

```
IntentScore = w_eeg · EEG_Score + w_kin · Kinematic_Score − Penalty_Compensation
```

- `EEG_Score`: classifier output mapped to 0–100 — for LDA this is the calibrated distance-to-hyperplane (sigmoid-squashed); for band-power mode it's normalized ERD% relative to the patient's calibrated dynamic range.
- `Kinematic_Score`: normalized ROM/velocity progress toward the trial's target movement (0 in covert-MI mode by design — see below).
- `Penalty_Compensation`: subtracted when trunk-lean/compensatory movement exceeds threshold, regardless of mode — this is a hard clinical-quality guardrail, not a tunable game difficulty knob.

### 8.2 Mode A — Covert Motor Imagery (early-stage / severe impairment)

- `w_eeg = 1.0`, `w_kin = 0` for the *reward* score, **but** any detected movement during the imagery window converts the trial to "invalid — please keep still and just imagine" with gentle on-screen feedback, and that trial is excluded from both score and classifier training data. This is the camera acting purely as a validity gate, not a reward contributor — matching the actual clinical intent of covert MI training.

### 8.3 Mode B — Blended (default for most patients; required fallback for "BCI illiteracy")

- `w_eeg = 0.5–0.7`, `w_kin = 0.3–0.5` (clinician-tunable per patient, with a sensible default and an auto-adjustment if calibration accuracy was low — Section 6 step 5).
- Patient is cued to *attempt* the movement while imagining it; both channels reward effort, so a patient who cannot decode well from EEG but can generate *some* movement is still meaningfully engaged and scored, preserving motivation.

### 8.4 Mode C — Active Movement Practice (later-stage recovery)

- `w_eeg = 0.2–0.3`, `w_kin = 0.7–0.8` — shifts toward task-specific practice (a well-established stroke rehab principle: real, attempted, task-relevant movement drives more reliable recovery than imagery alone once *any* volitional movement is present), while EEG engagement is still tracked and lightly rewarded to keep reinforcing the imagery-execution coupling.

### 8.5 Anti-discouragement smoothing

- Apply a short exponential moving average (e.g., τ ≈ 300 ms) to `IntentScore` before it reaches the game, so visual feedback feels responsive but not jittery/noisy — jittery feedback is a known source of patient frustration and poor classifier-trust in MI-BCI UX literature.
- A **per-session adaptive floor/ceiling** normalizes against that patient's own day's best/worst range (not a fixed absolute scale), so a patient having a harder day still experiences a playable, motivating dynamic range rather than a flat low score all session.

---

## 9. Game Design

### 9.1 Core feedback loop principles (evidence-grounded, not arbitrary)

- **Continuous, not binary, feedback.** A continuously-moving game element (filling bar, rising avatar, growing plant) driven directly by `IntentScore` outperforms simple pass/fail feedback for sensorimotor-rhythm learning — this is the core neurofeedback design pattern used across the cited clinical trials (marble games, rowing avatars, robotic reach).
- **Low latency.** Target end-to-end latency (EEG sample → visible game response) **under 250 ms**; published BCI-game UX work treats >300–500 ms as perceptibly "laggy" and erodes the patient's sense of agency, which is itself part of the therapeutic mechanism (sense of control over one's own brain activity).
- **Embodiment.** Where possible, the on-screen avatar's *affected limb* visually mirrors the task (a virtual arm reaching, a virtual hand opening) rather than an abstract cursor — embodied avatar feedback has shown stronger engagement/recovery signal in the cited VR-BCI studies than abstract feedback.
- **Short trials, frequent rest.** 4 s MI window + rest matches the calibration paradigm and avoids fatigue; sustained attention beyond this in stroke patients (many with concurrent cognitive/attentional deficits) degrades signal quality, not just enjoyment.

### 9.2 Mini-game concepts (one game engine, multiple "skins" mapped to the same Intent Score input)

| Mini-game | Mechanic | Best for |
|---|---|---|
| **Garden Grow** | A flower/tree grows in real time with sustained Intent Score; wilts slightly on low engagement, recovers — never punitive resets | Covert MI, early-stage, lowest cognitive load |
| **Reach & Collect** | Avatar arm reaches toward fruit/stars positioned at clinically-relevant ROM targets; reach extends proportionally to combined EEG+kinematic score | Blended/Active modes, ROM-specific therapy goals |
| **River Rowing** | Bimanual or unimanual rowing avatar (directly inspired by published NeuRow-style VR-BCI paradigm), good for bilateral/symmetric tasks | Bimanual coordination goals |
| **Star Catcher** | Simple, large-target, high-contrast catch game | Patients with visual-field deficits (hemianopia) or higher cognitive load sensitivity — accessibility-first variant |
| **Story Mode "Lighthouse Keeper"** | Light narrative wrapper across sessions (the lighthouse gets repaired bit by bit) for longer-term motivation and session-to-session continuity | Multi-week engagement / adherence |

### 9.3 Accessibility requirements (non-negotiable, stroke-specific)

- **Hemianopia / visual neglect:** primary game elements must default to the patient's intact visual field side, with a clinician-configurable layout; avoid relying on peripheral or far-lateral cues.
- **Aphasia:** UI uses icons/pictograms over text wherever possible; any text is short, high-contrast, large font; audio cues are simple and non-verbal where feasible (tones, chimes) with optional spoken instructions.
- **Fatigue & cognitive load:** sessions default to 15–20 minutes of active gameplay with built-in rest blocks; difficulty/complexity ramps are conservative by default and clinician-adjustable.
- **One-handed/seated operation:** no game requires bimanual unaffected-hand input to operate menus — clinician console, not the patient, drives session start/navigation by default, with optional large-button patient-facing controls.
- **Color/contrast:** WCAG-AA-equivalent contrast, colorblind-safe palettes (avoid red/green as sole signal).

### 9.4 Adaptive difficulty

- Per-trial target thresholds (e.g., "reach 60% Intent Score to make the flower bloom") auto-adjust using a simple up/down staircase: 2–3 consecutive successes raise the bar slightly, a miss lowers it slightly, keeping the patient in a ~70–80% success-rate flow-state band — a standard adaptive-difficulty pattern, tuned here to avoid the specific failure mode of "patient never succeeds → gives up."
- Weekly progression is tracked so increasing baseline difficulty over weeks is itself a visible progress indicator for the patient ("you're playing at a higher level than last week"), independent of raw clinical score changes which can be slow/noisy.

### 9.5 Engine & client architecture

- **Unity (C#)** patient-facing client. `LSL4Unity` or a lightweight WebSocket client subscribes to the Intent Score stream (and raw sub-scores for richer game logic, e.g., separate EEG vs kinematic components driving different visual layers).
- Game scenes: `Onboarding`, `Calibration` (mirrors the clinician console's calibration controls, with large clear instructions), `MiniGameSelect`, individual mini-game scenes, `SessionSummary` (patient-facing, simple/encouraging — "You played for 18 minutes and your best streak was 6 in a row!").
- All game-session events (trial start/end, score, mode, mini-game played) are emitted back onto the LSL marker stream / logged to SQLite for the clinician console and outcome reporting.

---

## 10. Clinical Workflow & Session Protocol

### 10.1 Setup checklist (target: <10 minutes)

1. Don Unicorn Hybrid Black, position per montage diagram (Appendix A), check/improve electrode contact via Unicorn Recorder's signal-quality scope (or an in-house quality widget reusing the same impedance/quality data over LSL).
2. Position camera, run 5 s rest-pose calibration.
3. Select/confirm patient profile in clinician console (affected side, prior session history, current mode).
4. Run calibration block (Section 6), ~8–10 min.
5. Begin gameplay session.

### 10.2 Session structure (typical 30–40 minute clinic slot)

| Phase | Duration | Notes |
|---|---|---|
| Setup + impedance check | 5–8 min | Clinician-led |
| Calibration (full, weekly; abbreviated 2–3 min daily refresh otherwise) | 3–10 min | |
| Gameplay block 1 | 8–10 min | |
| Rest | 2–3 min | |
| Gameplay block 2 | 8–10 min | |
| Cooldown + session summary shown to patient | 2 min | |
| Doff + clean | 3–5 min | |

### 10.3 Clinician console responsibilities

- Patient profile management (affected side, impairment severity notes, contraindications).
- Live session monitor: raw EEG quality trace, current ERD/Laterality Index, classifier confidence, kinematic ROM trace, current game mode — so the clinician can intervene (re-seat electrode, switch mode, end session early) without needing to interpret raw EEG themselves (translated into plain-language status indicators: "Good signal," "Check Cz contact," "Switching to Blended Mode — low MI decode confidence").
- Session history & trend charts (ERD over weeks, classifier accuracy over weeks, ROM over weeks, game difficulty level over weeks).
- Export: PDF session summary, CSV/EDF raw data export for research use.
- Protocol editor: trial counts, rest durations, which mini-games are enabled, mode weighting overrides.

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

- `Trial.valid_flag` is what records the camera's role as a covert-MI validity gate (Section 7.1) — important for both real-time scoring exclusion and later research-quality data cleaning.
- `ClinicalAssessment` lets the clinician periodically enter formal FMA-UE/ARAT scores so the dashboard can plot system-derived proxy metrics (ERD magnitude, classifier accuracy, ROM) against real clinical outcomes over time — this is the data backbone for any future efficacy analysis.

### 11.2 Storage & privacy

- **Local-first:** SQLite + flat-file EDF/pose logs on the clinic PC by default. No cloud sync unless explicitly configured by the clinic's IT (e.g., to a clinic-controlled, BAA-covered server).
- **Encryption at rest:** SQLite DB and raw capture files stored on an encrypted volume (BitLocker on the clinic PC) at minimum; consider field-level encryption for any direct identifiers.
- **De-identification for research export:** export pipeline strips/pseudonymizes direct identifiers, retaining only a study ID — required before any data leaves the clinic for analysis, consistent with HIPAA de-identification practice (Safe Harbor or expert determination, to be confirmed with the clinic's privacy officer).
- **Access control:** clinician console requires login; role separation between "clinician" (full access) and "patient-facing kiosk" (no PHI visible, session-control only) on the game client itself.

---

## 12. Safety, Regulatory & Ethical Considerations

> This section is engineering guidance, not legal advice — final regulatory strategy needs review by qualified regulatory/legal counsel before clinical claims are made.

- **Intended use framing matters a great deal.** A system marketed as a "general wellness" / motor-skills engagement and biofeedback game sits in a very different regulatory bucket than one making explicit claims to "treat" or "improve recovery from" stroke. Decide early, with regulatory counsel, whether this is positioned as (a) a research tool used under IRB oversight, (b) a non-claims "wellness"/engagement product used as a clinician-supervised adjunct, or (c) a path toward FDA Software-as-a-Medical-Device clearance — each has very different documentation, validation, and labeling requirements. Do not let the engineering roadmap silently assume one path; this should be an explicit early stakeholder decision.
- **No autonomous clinical claims in-product.** All in-app and clinician-console copy describing benefit should be hedged and descriptive ("track your engagement and movement over time") rather than promissory, until/unless a real clinical trial and any required regulatory clearance back stronger claims.
- **Electrical/physical safety:** Unicorn Hybrid Black is a CE-marked, battery-powered, isolated (no mains connection to the patient) device — standard EEG safety practices apply (skin check for electrode irritation/allergy to gel, sensible session-length limits, comfortable strap fit for spasticity/abnormal tone).
- **Photosensitive seizure risk:** screen flicker/strobing must be avoided in all game visuals (standard game-accessibility flashing-content guidelines apply) — relevant given stroke survivors can have a higher seizure-risk profile than the general population.
- **Fatigue monitoring:** the clinician console should surface a fatigue/attention proxy (e.g., declining signal quality + declining classifier confidence + declining kinematic engagement together) and prompt a "consider ending session" flag rather than silently degrading the experience.
- **IRB/ethics approval** required before any data is collected for research purposes (as opposed to pure clinical-care documentation) — build the data pipeline (Section 11) to be IRB-protocol-compliant from day one (consent tracking field on `Patient`, de-identification export path) so a future study doesn't require a retrofit.
- **Informed consent / assent:** plain-language explanation script for patients (and caregivers, given potential aphasia/cognitive involvement) covering what EEG does and doesn't do (it does not read thoughts/words; it measures broad rhythmic brain activity patterns), data use, and the ability to stop anytime.

---

## 13. Testing & Validation Plan

### 13.1 Bench / unit testing

- Signal-processing module: unit tests against synthetic EEG with known injected ERD patterns (simulate mu suppression of known magnitude, verify detection within tolerance).
- Latency testing: instrument the full pipeline (LSL timestamp → WebSocket send → Unity frame update) and log end-to-end latency distribution; target p95 < 250 ms (Section 9.1).
- Vision pipeline: validate joint-angle estimates against a simple ground-truth rig (e.g., goniometer-measured static poses) before trusting ROM scoring clinically.

### 13.2 Usability testing (non-clinical, internal)

- Healthy-volunteer pilot first (engineering team + a few external volunteers) to shake out UX/ergonomics issues before any patient contact.
- Then a small supervised usability pilot with actual stroke survivors (under appropriate ethics oversight even for usability-only testing if any data is retained) focused on: setup time, comfort, comprehension of instructions, subjective engagement (simple Likert-scale post-session questionnaire), fatigue.

### 13.3 Signal/classifier validation

- Per-patient calibration accuracy tracked as a first-class metric (Section 6 step 5) — this *is* the ongoing validation signal in production, not just a one-time check.
- Offline replay testing: store raw EEG+pose for a cohort and replay through pipeline updates to verify no regression before deploying a new classifier/preprocessing version to clinics ("shadow mode" testing).

### 13.4 Clinical pilot study design (future phase, with IRB)

- Small-N (e.g., n=10–15) single-arm feasibility/engagement pilot first: feasibility (can patients tolerate/use it), usability, and safety — *not* an efficacy claim study.
- If promising, a properly powered RCT design (active control = equivalent-dose standard therapy or sham-feedback BCI, consistent with designs in the cited literature) is the appropriate next step before any efficacy claims, run with a biostatistician and the FMA-UE/ARAT outcome data this system is already structured to support (Section 11.1).

---

## 14. Deployment Architecture

- **Single-clinic-PC deployment** is the default target: signal engine, fusion service, Unity client, and clinician console (FastAPI + static React build) all run as local services on one Windows machine, auto-started via a small tray application, with the patient-facing display on the primary monitor and clinician console on a secondary monitor/tablet.
- **Installer:** PyInstaller-frozen signal engine + Inno Setup bundling Unity build, Unicorn Suite redistributable, and Python services into one click-through Windows installer; post-install wizard handles Bluetooth pairing and camera selection.
- **Update mechanism:** versioned installer with a "check for clinic update" button in the clinician console (manual-trigger, not silent auto-update, since clinics will want change control over a device used in patient care) — pulls from a private release channel.
- **Offline-first:** the system must run a full session with zero internet connectivity; only optional features (e.g., cloud backup, multi-site aggregate reporting) require connectivity, and must degrade gracefully (queue-and-retry) if offline.
- **Multi-room/multi-license scaling (future):** if a clinic wants several stations, each remains an independent local deployment by default; a future "clinic server" mode could centralize patient records across stations on the clinic LAN, but this adds real IT/security scope and should be a deliberate v2+ decision, not baked in early.

---

## 15. Development Roadmap

| Phase | Scope | Rough duration |
|---|---|---|
| **0 — Spike** | LSL plumbing: get Unicorn EEG + a basic webcam pose stream both flowing into a Python script with synchronized timestamps; verify latency budget is achievable at all | 1–2 weeks |
| **1 — MVP signal pipeline** | Preprocessing, band-power ERD scoring, Graz-style calibration block, basic CSP+LDA classifier, single mini-game (Garden Grow) in Unity consuming a WebSocket score stream | 4–6 weeks |
| **2 — Vision fusion** | MediaPipe pose integration, compensatory-movement detection, Blended/Active modes, Intent Score fusion engine, 2nd & 3rd mini-games | 4–6 weeks |
| **3 — Clinical workflow** | Clinician console (patient profiles, live monitor, history charts), SQLite data model, session protocol editor, accessibility pass (hemianopia/aphasia/fatigue accommodations) | 4–6 weeks |
| **4 — Hardening & packaging** | Latency optimization to hit p95<250ms, installer, offline-mode robustness, signal-quality UX, internal usability pilot | 3–4 weeks |
| **5 — Clinical pilot prep** | IRB documentation, consent materials, de-identified export pipeline, small-N feasibility pilot | parallel-track, 4–8 weeks |
| **6 — v2 stretch** | RGB-D camera support, Riemannian/EEGNet classifier upgrade with cross-patient pretraining + few-shot fine-tuning, VR export, multi-station deployment | post-MVP |

---

## 16. Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| ~40% of patients show weak/no decodable ERD ("BCI illiteracy") | Core mechanic unusable for a meaningful minority | Blended Mode fallback (Section 8.3) ensures camera-led scoring still produces an engaging, valid session |
| Fixed 8-channel montage limits classifier ceiling | Lower decode accuracy than research-grade caps | Riemannian methods, cross-patient pretraining + fine-tuning, honest expectation-setting with clinicians |
| Camera occlusion of affected limb (common in hemiparesis) | Bad kinematic scores, false compensation flags | RGB-D upgrade path, confidence-gated landmark use, conservative default thresholds with clinician override |
| Latency creep degrades sense-of-agency | Reduced engagement/therapeutic value | Continuous latency instrumentation + budget enforced in CI/perf testing, not just at design time |
| Overclaiming therapeutic benefit before evidence exists | Regulatory/ethical exposure, patient trust harm if expectations aren't met | Hedged in-product language, explicit regulatory-path decision early (Section 12), pilot-before-claims roadmap |
| Clinic IT blocks Bluetooth/camera/network ports | Deployment failure on-site | Offline-first local-only architecture, pre-deployment IT checklist, minimal port/permission footprint |
| Patient fatigue / frustration from a bad session | Adherence drop, possible distress for a vulnerable population | Adaptive difficulty floor, fatigue-detection flag, clinician override to end/pause anytime, encouraging (never punitive) UX copy |
| Electrode setup time too long for clinic throughput | Adoption resistance from clinic staff | Dry-electrode default, signal-quality UI that speeds troubleshooting, target <10 min setup tracked as a hard product metric |

---

## Appendix A — Electrode Montage Reference

Default Unicorn Hybrid Black 8-channel montage: **Fz, C3, Cz, C4, Pz, PO7, Oz, PO8**, mastoid reference (M1/M2).

- **MI-primary:** C3 (right-hand/left-hemisphere motor cortex), C4 (left-hand/right-hemisphere motor cortex), Cz (central/bilateral).
- **Artifact/context channels:** Fz (frontal, EOG-proxy), Pz/PO7/PO8/Oz (posterior, alpha/visual-attention monitoring, not primary MI signal but useful for overall vigilance/quality checks).

## Appendix B — Frequency Bands Reference

| Band | Range | Relevance |
|---|---|---|
| Delta | 1–4 Hz | Filtered out / drift, not used for MI |
| Theta | 4–8 Hz | Generally excluded from MI scoring; monitored for drowsiness |
| **Mu (sensorimotor alpha)** | **8–12 Hz** | **Primary ERD signal for MI** |
| **Beta** | **13–30 Hz** | **Secondary ERD/ERS signal, often modulated alongside mu** |
| Gamma | >30 Hz | Generally not reliable at scalp level for this use case, excluded |

## Appendix C — Key Reference Threads to Track in Literature

(For the team to review primary sources directly rather than relying solely on this document.)

- ERD/ERS characterization in chronic stroke using MI-BCI for upper-limb rehab (cortical reorganization framing).
- Randomized controlled BCI + robotic feedback trials for chronic stroke upper-limb hemiparesis (e.g., BCI-Manus-style designs), using FMA-UE as outcome.
- BCI + functional electrical stimulation pilot RCTs in severe upper-limb paresis, using ARAT as outcome.
- Multicenter placebo-controlled BCI-controlled hand exoskeleton trials in severe paralysis.
- VR-embodied BCI training studies (EEG + fMRI) examining ipsilesional/contralesional motor cortex activity changes.
- "BCI illiteracy" / insufficient mu-ERD prevalence literature, and adjunct strategies (e.g., priming stimulation) — relevant context even though NeuroReach does not itself include a stimulation component.

---

*End of specification draft. Recommended next step: review Sections 8 (Fusion/Scoring) and 12 (Regulatory) with clinical and regulatory stakeholders before locking the Phase 1 engineering scope, since these two sections most directly shape what "MVP" should mean.*