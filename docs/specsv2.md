# Motor-Imagery Rehabilitation Game — Engineering Specification **v2**

**System name (working title):** NeuroReach
**Target hardware:** g.tec Unicorn Hybrid Black (8-ch EEG) + patient-device camera + clinic Windows PC
**Document status:** v2.0 — architectural revision of [`specsv1.md`](specsv1.md)
**Audience:** firmware/signal-processing engineers, web/desktop developers, clinical stakeholders, regulatory/QA

---

## 0. What v2 changes (read this first)

v2 is **not** a re-spec from scratch. The signal-processing core, the clinical/scientific
foundations, calibration protocol, fusion/scoring math, game-design principles, data model,
safety, and regulatory posture from **v1 ([`specsv1.md`](specsv1.md)) all still apply unchanged.**
This document specifies only the **delivery-architecture rewrite** and the consequences that ripple
out of it. Where a v1 section is unaffected, it is referenced, not repeated.

Three architectural changes, all decided with stakeholders:

| # | v1 | v2 |
|---|----|----|
| **C1** | Patient game = **Unity 2022 LTS** native client, installed per-platform | Patient game = **React web app**, served in-browser, zero install, runs on any device |
| **C2** | Clinician console = local **React + FastAPI** opened in a browser | Clinician console = **Electron desktop app**, one-click installer, bundles the Python signal-engine as a sidecar + the g.tec Unicorn software |
| **C3** | Camera plugged into the **clinic PC**; everything LAN-local | Camera lives on the **patient's display device**; its video is streamed to the clinic PC, where vision processing still runs |

Four binding decisions that scope those changes (resolved during design):

- **Topology — in-clinic, decoupled display.** Patient and headset are physically with the clinician.
  The headset Bluetooth-pairs to the clinician's Windows PC exactly as in v1. What moves is the
  *display*: the game now renders in a browser on any local device (TV, tablet, laptop) instead of a
  Unity build. **No cloud. v1's offline-first, LAN-only rule is fully preserved.**
- **Unity is fully replaced.** `game-client/` is deleted; a new `patient-web/` React project takes its
  place. There is one patient client going forward.
- **Vision stays clinician-side.** MediaPipe Pose/Hands and the whole fusion engine still run on the
  clinic PC. The *only* change (C3) is that the camera *source* is now the patient device, streamed
  over the LAN — see §7.
- **Signal-engine ships as a Python sidecar.** The validated v1 Python DSP/classifier code is **not**
  rewritten. Electron bundles it as a PyInstaller-frozen sidecar process and talks to it over local
  IPC/WebSocket.

> **Critical secondary consequence of C3 (camera on patient device):** the patient's browser must call
> `getUserMedia()` to access its webcam, which browsers permit **only in a secure context**
> (HTTPS / WSS, or `localhost`). A LAN device loaded over plain `http://<clinic-ip>` cannot get camera
> access. Therefore the patient channel in v2 **must be served over HTTPS/WSS** with a local cert — this
> reverses the "plain http is fine" assumption that would otherwise hold for a display-only client. See
> §4.3 and §12.

---

## 1. Clinical & Scientific Foundations

**Unchanged from v1 §1.** The mechanism (mu/beta ERD over C3/Cz/C4), the ~40% "BCI illiteracy"
constraint and its Blended-Mode mitigation, the FMA-UE / ARAT outcome measures, per-patient
difficulty calibration, and the honest "adjunct, not a cure" framing all carry forward verbatim. None
of the v2 delivery changes touch the science.

---

## 2. System Architecture Overview (v2)

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
   ┌───────────────────────────────────────┐
   │  PATIENT DEVICE  (any browser, no install) │
   │   React web game  (Garden Grow, etc.)      │
   │   • receives IntentScore over WSS          │
   │   • captures webcam (getUserMedia)         │
   │   • sends video to clinic PC over WebRTC   │
   └───────────────────────────────────────┘
```

**Design principle (preserved from v1):** every link is `localhost` or clinic-LAN only. A full session
runs with **zero internet connectivity**. The only thing that crosses the LAN is (a) the React app
bytes, (b) the 0–100 IntentScore + game state going to the patient, and (c) the patient's webcam video
coming back. No PHI leaves the clinic PC.

---

## 3. Hardware Specification

- **EEG headset (v1 §3.1) — unchanged.** Same Unicorn Hybrid Black, same fixed montage
  (Fz, C3, Cz, C4, Pz, PO7, Oz, PO8), same Bluetooth-to-clinic-PC path.
- **Camera (v1 §3.2) — relocated.** No longer a webcam plugged into the clinic PC. v2 uses **whatever
  camera the patient's display device already has** (tablet/laptop front camera, or a USB webcam on the
  patient-side machine). This trades the v1 "fixed, calibrated, clinic-mounted camera" for "the device
  the patient is already looking at," which is more convenient but introduces variable camera quality,
  angle, and lighting — addressed in §7.3. A clinic may still position a dedicated tablet on a mount to
  recover a controlled view.
- **Clinic compute (v1 §3.3) — unchanged minimums,** but note the clinic PC now additionally runs the
  Electron shell + LAN server + `aiortc` video receive + MediaPipe. The recommended 8-core / 32 GB
  spec is now the practical floor, not a luxury, because MediaPipe Pose on an incoming WebRTC stream is
  the heaviest sustained CPU load.
- **Patient device — new.** Any device with: a modern evergreen browser (Chromium/Firefox/Safari ≥ last
  2 years), a front-facing camera, and clinic-LAN connectivity (Wi-Fi or Ethernet). No app install, no
  GPU requirement. Screen ≥ 10".

---

## 4. Software Stack & Repository Layout (v2)

### 4.1 Stack changes

| Layer | v1 | v2 | Why |
|---|---|---|---|
| Patient client | Unity 2022 LTS / C# | **React + TypeScript + Vite**, canvas rendering via **PixiJS** (2D mini-games) | Zero-install, runs on any device, far faster iteration than Unity for 2D neurofeedback visuals |
| Patient ↔ engine transport | NativeWebSocket (Unity) | **WSS** (score/control) + **WebRTC** (patient→clinic video) | Browser-native; WebRTC is the right tool for live video, WSS for the 20 Hz score |
| Clinician console | React + FastAPI in a browser | **Electron** (Chromium renderer + Node main) wrapping the same React UI; FastAPI retained inside the sidecar | One-click installable desktop app the clinic owns; can spawn/supervise the Python sidecar and host the LAN server |
| Signal engine | Python service, run from terminal | **Same Python**, PyInstaller-frozen **sidecar** launched by Electron | Reuse 100% of validated v1 DSP/classifier code; no rewrite risk |
| Video ingest (clinic side) | OpenCV local capture | **`aiortc`** (Python WebRTC) receives the patient track, hands frames to MediaPipe | Lets the existing Python vision pipeline consume a remote camera with minimal change |
| Packaging | Inno Setup + PyInstaller + Unity build | **electron-builder** producing a one-click Windows installer bundling Electron + frozen sidecar + Unicorn software (licensing caveat, §14.2) | Single artifact, single download, clinician double-clicks once |

**Unchanged:** LSL transport, `liblsl`/`pylsl`, the entire `numpy`/`scipy`/`mne`/`scikit-learn`/
`pyriemann` signal stack, MediaPipe Pose/Hands models, SQLite + EDF data layer, `websockets`/FastAPI.

### 4.2 Repository layout (v2)

```
neuroreach/
├── docs/                          # specsv1.md, specsv2.md, protocols, SOPs
├── signal-engine/                 # Python real-time service — UNCHANGED internals
│   ├── acquisition/  preprocessing/  features/  classifiers/
│   ├── vision/                    # MediaPipe worker; gains an aiortc video-receive front-end
│   ├── fusion/  server/  tests/
│   └── packaging/                 # NEW: PyInstaller spec for the frozen sidecar
├── clinician-console/             # NEW shape: Electron app
│   ├── main/                      # Electron main: sidecar supervisor, LAN server,
│   │                              #   session-code pairing, WebRTC signaling
│   ├── renderer/                  # the v1 React console UI, ported into the renderer
│   └── build/                     # electron-builder config + installer assets
├── patient-web/                   # NEW: React + TS + Vite patient game (replaces game-client/)
│   ├── src/scenes/                # Calibration / Garden / Summary as routes
│   ├── src/games/                 # PixiJS mini-games (GardenGrow first)
│   ├── src/net/                   # WSS score client + WebRTC camera publisher
│   └── src/scoring/               # IntentScore buffer/parse (ported from C#)
├── deployment/                    # electron-builder installer, sidecar bundling, cert provisioning
└── data-schema/                   # SQLite migrations, EDF export — UNCHANGED
```

`game-client/` (Unity) is **removed**. Its pure-logic contracts (`PlantGrowthModel` state machine,
`SessionStats` summary text, IntentScore parsing) are **ported to TypeScript** in `patient-web/` and
keep their unit tests (now Vitest instead of NUnit).

### 4.3 The Electron LAN server (new component, detailed)

Lives in `clinician-console/main/`. Responsibilities:

1. **Serve the React patient build** as static assets over HTTPS on the clinic LAN.
2. **Session-code pairing** (§5): mint code, render QR, authorize exactly one patient socket per live
   session, expire on session end.
3. **Score broadcast:** subscribe to the sidecar's existing 20 Hz IntentScore WS, fan it out to the
   paired patient over WSS.
4. **WebRTC signaling:** broker the SDP/ICE handshake between the patient browser (camera publisher)
   and the sidecar's `aiortc` receiver. On a single LAN, host ICE candidates suffice — **no STUN/TURN,
   no internet.**
5. **Local TLS:** terminate HTTPS/WSS with a clinic-local certificate (§12.3). Required because the
   patient page calls `getUserMedia()` + WebRTC, both of which demand a secure context.

The sidecar keeps owning DSP, fusion, MediaPipe, SQLite/EDF, and FastAPI REST for the clinician UI.
Electron main owns process supervision + everything patient-facing on the LAN.

---

## 5. Session-Code Pairing (new)

Replaces "launch the Unity build on the clinic display." Goal: connect one arbitrary browser device to
one live clinician session, securely, with no typing of IP addresses.

**Flow:**

1. Clinician clicks **Start Session** in the Electron console. Main process generates a short,
   human-readable **session code** (e.g. 6 chars, ambiguity-free alphabet) and a **QR code** encoding
   `https://<clinic-pc-lan-host>:<port>/?c=<code>`.
2. Patient device scans the QR (or opens the URL + types the code). The browser loads the React app
   **from the clinic PC** over HTTPS.
3. The app opens a **WSS** connection and presents the code; the LAN server validates it, binds that
   socket to the live session, and rejects any second claimant.
4. The app requests camera permission (`getUserMedia`) and starts publishing video to the sidecar via
   WebRTC (signaled through the LAN server).
5. Pairing is **scoped and ephemeral**: the code authorizes exactly that session, carries no PHI, and
   is invalidated when the clinician ends the session or it times out.

**Security properties:** LAN-only reachability, single-use binding, short TTL, no PHI on the patient
channel (only game state + the 0–100 score). The patient device is a **kiosk peer** — it can *see* a
score and *send* its camera, nothing more (preserves v1's clinician/patient role separation, §11.2).

---

## 6. Calibration Protocol

**Unchanged from v1 §6.** Same Graz-style cue-paced paradigm, same ~8–10 min block, same CSP+LDA (or
Riemannian) offline fit, same <60% cross-val → auto-switch to Blended Mode quality gate, same
per-patient versioned filter persistence. The only surface change: the calibration **cues and
instructions now render in the React app** on the patient device instead of a Unity scene. The
clinician still drives calibration from the console; cue markers still flow on the LSL marker stream.

---

## 7. Camera-Based Movement Verification (v2)

### 7.1 What stays the same

Both jobs from v1 §7 are unchanged: (1) **covert-MI validity gating** (flag movement during
"imagine-only" trials) and (2) **kinematic scoring** (ROM, smoothness, trunk-lean/compensation
penalty). MediaPipe Pose (33 landmarks) + Hands (21/ hand), joint-angle derivation, rest-pose
calibration, affected-side mirroring, confidence-gated landmark use — **all unchanged, all still on the
clinic PC.**

### 7.2 What changes: the camera is now remote (C3)

```
Patient browser  getUserMedia(webcam)
   → RTCPeerConnection video track
   → [WebRTC over clinic LAN, host candidates only]
   → aiortc receiver in the Python sidecar
   → frames → MediaPipe Pose/Hands → kinematic features
   → fusion engine (unchanged) → IntentScore
```

- **Transport:** WebRTC, not raw frames over WebSocket — it gives hardware-accelerated encode on the
  patient device, congestion control, and low latency. Signaling is brokered by the Electron LAN
  server (§4.3); on one LAN no STUN/TURN is needed.
- **Where vision runs:** still the sidecar. `aiortc` decodes the incoming track to frames and feeds the
  **existing** MediaPipe worker. The fusion engine downstream is untouched.
- **Pose is no longer published as its own LSL stream by an OpenCV worker.** Instead the sidecar's
  aiortc→MediaPipe path produces the same kinematic feature objects the fusion engine already consumes.
  The LSL **marker** stream (trial events) is unaffected.

### 7.3 New robustness considerations (consequences of a patient-owned camera)

- **Variable camera/angle/lighting.** v1 assumed a fixed, clinic-mounted, optionally RGB-D camera. v2's
  patient-device camera is RGB-only, arbitrary height/angle, uncontrolled lighting. Mitigations:
  rest-pose calibration (already relative, absorbs angle/body differences); a **framing-check step**
  during setup ("we can see your head, shoulders, and affected arm — ✓"); conservative default
  compensation thresholds; clinician override. RGB-D is no longer assumed (the patient device won't
  have depth) — the v1 RGB-D upgrade path is **dropped** for the in-clinic-decoupled topology.
- **Network jitter on the LAN** can drop/delay video frames. The fusion engine must treat **missing
  pose as "no kinematic evidence,"** not as "no movement" — a dropped frame must never fabricate a
  clean covert-MI trial or a false compensation flag. Reuse v1's confidence-gating / last-known-good
  decay; extend it to cover frame-arrival gaps.
- **Camera permission denial / no camera.** If the patient device can't supply video, the session must
  fall back to **EEG-only scoring** (Mode A covert-MI with the camera validity-gate disabled, or a
  clinician-acknowledged EEG-only mode) rather than blocking the session. Surface this clearly in the
  clinician console.

---

## 8. Sensor Fusion & Scoring Engine

**Unchanged from v1 §8.** Same IntentScore formula, same Modes A/B/C and their weightings, same
compensation penalty, same EMA smoothing (τ ≈ 300 ms) and per-session adaptive floor/ceiling. The
engine consumes the same `EEG_Score` and `Kinematic_Score` inputs; only the *source* of the kinematic
input changed (remote camera via aiortc, §7), not the math. One added input-validity rule: see §7.3 on
treating dropped remote frames as absent evidence.

---

## 9. Game Design (v2 client)

### 9.1 Principles — unchanged

All v1 §9.1 principles hold: continuous (not binary) feedback, **end-to-end latency < 250 ms**,
embodiment, short trials / frequent rest. The latency budget now explicitly includes the WSS hop over
the LAN (negligible) and must be re-measured on the web client (§13).

### 9.2 Mini-games — same concepts, web implementation

Same catalogue (Garden Grow, Reach & Collect, River Rowing, Star Catcher, Lighthouse story mode), same
mapping to the single IntentScore input. Implemented in **React + PixiJS** instead of Unity.
**Garden Grow ships first**, porting the v1 `PlantGrowthModel` state machine to TypeScript verbatim
(it was already pure, Unity-independent logic — the port is mechanical and keeps its unit tests).

### 9.3 Accessibility — unchanged requirements, web realization

All v1 §9.3 requirements are binding (hemianopia/neglect default-side layout, aphasia-friendly
iconography, fatigue/cognitive-load limits, one-handed operation, WCAG-AA contrast + colorblind-safe
palettes). The web stack makes some easier (browser zoom, OS-level high-contrast, screen-reader
semantics via ARIA) and adds responsibilities (the React app must honor `prefers-reduced-motion` and
must **not** rely on small touch targets). The **photosensitivity / no-strobe** rule (§12) is enforced
in the PixiJS render layer.

### 9.4 Adaptive difficulty — unchanged (v1 §9.4).

### 9.5 Client architecture

- React + TS + Vite, PixiJS canvas per mini-game. Routes: `Onboarding`, `Calibration`,
  `MiniGameSelect`, individual games, `SessionSummary`.
- `src/net/`: a **WSS score client** (subscribes to IntentScore + raw sub-scores for layered visuals)
  and a **WebRTC camera publisher**. Reconnect/backoff on socket drop; on the LAN this should be rare.
- `src/scoring/`: IntentScore buffer + message parser ported from the C# `IntentScoreBuffer` /
  `IntentScoreMessage`. Same JSON frame contract the v1 WS server already emits — **the wire format is
  unchanged**, so the sidecar's broadcast needs no modification beyond being fanned out by the LAN
  server.
- Game-session events still emitted back for logging (now over WSS to the LAN server → sidecar →
  SQLite / LSL markers).

> **Note — the existing v1 JSON score frame is preserved.** `{"type":"intent_score","intent_score":...,
> "erd_score":...,"classifier_score":...,"is_artifact":...,"mode":...,"timestamp":...}`. The React
> client parses exactly this; no breaking change to the scoring service.

---

## 10. Clinical Workflow & Session Protocol (v2)

### 10.1 Setup checklist (target still < 10 min)

1. Don the Unicorn headset, check contact via the console's quality widget (unchanged).
2. **Open the patient device, scan the session QR, grant camera permission, confirm framing-check**
   (replaces "launch the Unity build"). ~30 s.
3. Confirm patient profile, affected side, mode in the console.
4. Run calibration block (§6).
5. Begin gameplay.

### 10.2 Session structure — unchanged from v1 §10.2.

### 10.3 Clinician console responsibilities — unchanged scope (v1 §10.3),

now delivered as an Electron desktop app. Adds two small surfaces: a **pairing panel** (session code +
QR + "patient connected ✓ / camera live ✓" indicators) and a **camera-link health** readout
(WebRTC connection state, frame rate, "vision degraded — running EEG-only" warning per §7.3).

---

## 11. Data Management & Outcome Reporting

**Unchanged from v1 §11.** Same data model (`Patient`/`Session`/`CalibrationRun`/`Trial`/
`ClinicalAssessment`/`RawCapture`), same local-first SQLite + EDF, same encryption-at-rest, same
de-identified research export, same access control and clinician/kiosk role separation. The patient
web client holds **no** persistent PHI; it is a transient, code-paired peer (§5). The sidecar's FastAPI
+ SQLite layer is byte-for-byte the v1 data layer.

---

## 12. Safety, Regulatory & Security (v2 deltas)

The v1 §12 content (intended-use framing, no autonomous clinical claims, electrical safety, **no
strobe/photosensitivity**, fatigue monitoring, IRB/consent) all carries forward. v2 adds **delivery-
specific security** items:

### 12.1 Attack surface

Introducing a LAN-served web app + a paired browser peer widens the surface vs a self-contained Unity
build. Mitigations: LAN-only binding (never bind the LAN server to a routable/public interface),
single-use session-code auth, per-session socket binding (reject second claimants), short code TTL,
strict origin/CORS allowlisting, no PHI on the patient channel.

### 12.2 PHI containment

Reaffirm: the only data on the patient channel is game state + the 0–100 score (not PHI) outbound, and
the patient's own webcam video inbound to the clinic PC. **Video is processed to kinematic features and,
per the v1 data model, only feature/score data is persisted — raw patient video is not stored** unless
a clinic explicitly enables research capture under consent (then it is PHI and lives encrypted on the
clinic PC under §11). This must be a default-off, consent-gated setting.

### 12.3 Local TLS / secure context (hard requirement, new)

Because the patient page uses `getUserMedia` + WebRTC, the LAN server **must** serve HTTPS/WSS. Options,
in order of preference:
1. **Provisioned clinic-local CA + per-install leaf cert**, installer adds the CA to the clinic PC and
   the QR/setup flow walks the patient device through a one-tap trust (or the clinic standardizes on a
   managed device that already trusts it). Cleanest UX, no browser warnings.
2. **Self-signed cert with trust-on-first-use.** Simplest to ship; cost is a browser security
   interstitial the patient must accept once per device. Acceptable for a clinician-supervised setup.
3. mDNS/`.local` hostname + a real cert via a clinic-owned domain — only if the clinic already has that
   infrastructure.

The installer/provisioning flow must pick one and make it turn-key; **do not** leave cert setup as a
manual clinician chore.

---

## 13. Testing & Validation (v2 deltas)

v1 §13 stands. Additions for the new architecture:

- **Patient web client unit tests (Vitest):** port the v1 NUnit contracts for `PlantGrowthModel` and
  `SessionStats` to TS; add WSS-client parse tests against the existing JSON frame.
- **End-to-end latency, re-measured on the web path:** EEG sample → sidecar → LAN server → WSS →
  React render. Target **p95 < 250 ms** (v1 §9.1) must be re-validated; the WSS hop and browser
  render replace the Unity render.
- **WebRTC video-path validation:** verify aiortc receives the patient track, that MediaPipe joint
  angles on a remote stream still match the goniometer ground-truth rig (v1 §13.1), and that **frame
  drop / camera-deny correctly degrades to EEG-only** (§7.3) rather than fabricating clean trials.
- **Pairing/security tests:** single-claimant enforcement, code expiry, LAN-only binding, rejection of
  off-LAN / wrong-origin connections.
- **Installer smoke test:** one-click install on a clean Windows machine brings up Electron + sidecar +
  Unicorn bridge + LAN server; offline (no internet) full-session run still succeeds.

---

## 14. Deployment Architecture (v2)

### 14.1 One-click Electron installer

- **electron-builder** produces a single Windows installer bundling: the Electron app (main + renderer),
  the **PyInstaller-frozen Python signal-engine sidecar**, the React patient build (served by the LAN
  server), and the Unicorn software (caveat §14.2). Post-install wizard: Bluetooth pairing, cert
  provisioning (§12.3), Wi-Fi/LAN confirmation, a self-test that boots the sidecar and serves a test
  pairing.
- Electron **main** supervises the sidecar (start/stop/restart/health), so the clinician never touches a
  terminal — this is the operational win over v1's terminal-launched Python service.
- **Offline-first preserved:** the whole stack runs with no internet. Update is a manual-trigger
  "check for clinic update" (change-control friendly), never silent auto-update.

### 14.2 g.tec Unicorn software bundling — **licensing flag (legal decision required)**

Bundling the Unicorn Suite / LSL bridge into the installer is the stated goal, but **g.tec's software
likely cannot be redistributed without a redistribution agreement.** This is a legal/business decision,
not an engineering one. Two paths:
- **(Preferred, pending agreement):** obtain redistribution rights from g.tec → true single-artifact
  one-click install.
- **(Fallback):** the installer **detects and auto-launches** an existing Unicorn install, or guides a
  one-time vendor-installer step in the post-install wizard. Still effectively "one download + a guided
  step," without redistributing g.tec binaries.

Engineering should build against the fallback and treat full bundling as a flag flipped once legal
clears it.

### 14.3 Multi-station scaling — unchanged from v1 §14 (each station an independent local deployment;
a clinic-LAN central record server remains a deliberate future decision, not baked in).

---

## 15. Development Roadmap (v2 migration)

Builds on the v1 phases already delivered (signal engine, calibration, CSP+LDA, scoring service, WS
server are **done** — see `docs/todos.md`). The v2 rearchitecture replaces the remaining
Unity-client work.

| Phase | Scope | Rough duration |
|---|---|---|
| **V2-0 — Sidecar + LAN server spike** | PyInstaller-freeze the signal-engine; Electron main spawns it + serves a hello-world React page over HTTPS on the LAN; one browser device pairs via session code and renders the live IntentScore. Proves the whole new transport spine. | 1–2 wk |
| **V2-1 — Patient web client** | Port `PlantGrowthModel` + `SessionStats` + IntentScore parsing to TS; build Garden Grow in React/PixiJS; Calibration/Garden/Summary routes; WSS score client. Delete `game-client/`. | 3–4 wk |
| **V2-2 — Remote camera (WebRTC)** | Patient `getUserMedia` → WebRTC publish; `aiortc` receive in sidecar → existing MediaPipe; frame-drop/deny → EEG-only fallback; framing-check setup step. | 3–4 wk |
| **V2-3 — Electron clinician console** | Port v1 React console UI into the Electron renderer; pairing panel + camera-link health; sidecar supervision; live monitor over IPC. | 3–4 wk |
| **V2-4 — Packaging & hardening** | electron-builder one-click installer, cert provisioning, Unicorn-launch fallback (§14.2), offline smoke test, re-measure p95<250 ms on the web path, security/pairing test suite. | 2–3 wk |

---

## 16. Risk Register (v2-specific; v1 §16 risks still apply)

| Risk | Impact | Mitigation |
|---|---|---|
| `getUserMedia` secure-context requirement makes LAN serving non-trivial | Patient camera won't work over plain http; setup friction | Local CA / TOFU cert provisioning baked into installer (§12.3); EEG-only fallback if camera unavailable (§7.3) |
| g.tec software not redistributable | Can't ship true single-artifact installer | Build against detect-and-launch fallback (§14.2); pursue redistribution agreement in parallel |
| Patient-owned camera quality/angle/lighting variability | Noisier kinematic scoring than v1's fixed/RGB-D camera | Relative rest-pose calibration, framing-check, conservative thresholds, clinician override; drop RGB-D assumption |
| LAN video jitter/frame drop mis-scored as movement evidence | False covert-MI passes / false compensation flags | Treat missing pose as *absent* evidence, not clean; confidence-gating extended to arrival gaps (§7.3) |
| Wider attack surface (LAN web app + paired peer) | Security/privacy exposure | LAN-only binding, single-use code, per-session socket binding, origin allowlist, no PHI on patient channel (§12.1) |
| Electron + frozen Python sidecar packaging fragility on clinic Windows | Install/boot failures on-site | electron-builder + supervised sidecar, clean-machine smoke test in CI, post-install self-test (§14.1) |
| Web client can't hit p95<250 ms end-to-end | Degraded sense-of-agency | Re-measure on web path early (V2-0/V2-1); WSS hop is LAN-local; optimize PixiJS render before adding games |

---

## Appendices

Appendices A (electrode montage), B (frequency bands), and C (literature threads) are **unchanged from
[`specsv1.md`](specsv1.md)** and not duplicated here.

---

*End of v2 specification. v2 is a delivery-architecture revision: the signal/clinical core of v1 is
preserved intact, while the patient client moves to the web, the clinician console becomes an installable
Electron app with a Python sidecar, and the camera relocates to the patient device (streamed back for
clinic-side vision). Recommended next step: build the V2-0 spike (sidecar freeze + LAN server + one
paired browser rendering the live score) to de-risk the new transport spine before porting game content.*
