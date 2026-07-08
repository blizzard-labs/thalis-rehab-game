# V2-2c — Vision UX Design

_Date: 2026-07-08. Milestone: V2-2c (spec §15). Depends on: V2-2a WebRTC transport spine,
V2-2b kinematic scoring + fusion. Reference spec: [`docs/specs.md`](../../specs.md)._

## Purpose

V2-2b landed the end-to-end vision *scoring* path (patient `getUserMedia` → WebRTC → console
signaling relay → sidecar `aiortc` → `VideoFrameSink` → MediaPipe Pose+Hands → `kinematic_score`
fused into `IntentScore` per Mode A/B/C with a trunk-lean compensation penalty). What is missing is
the **UX around it**: nothing surfaces camera-link health to the clinician, there is no framing-check
setup step, and the new `kinematic_score`/`compensation_flag` frame fields are parsed but not rendered.

V2-2c closes those gaps.

## Scope

**In scope (4 pieces):**

1. **Backend `vision_health` frame** — clinician-only WS frame surfacing WebRTC connection state,
   frame rate, and a "vision degraded — EEG-only" signal.
2. **Patient framing-check scene** — a browser-local, lightweight setup step confirming the patient is
   in frame, before calibration.
3. **Render kinematic fields (light)** — consume the existing `kinematic_score`/`compensation_flag`
   frame fields: patient compensation cue (P5) + a subtle "movement verified" indicator (P4);
   clinician live kinematic readout.
4. **Console fusion controls** — wire `calibrate_pose` / `fusion_mode` / `affected_side` to console UI
   controls (backend commands already exist from V2-2b).

**Explicitly out of scope (deferred):**

- **Covert-MI trial-invalidation / classifier-training-exclusion** — needs per-trial
  covert-vs-attempted context the real-time path does not model yet. Tracked separately.
- **Full Phase C verified-ROM game** (`reachcollect.md` Phase C) — two-bone FK arm rig, per-target
  angle-in-degrees catalogue, achieved/target angle, grasp gating. A large game-design milestone of its
  own; V2-2c renders the frame fields only, with no new game mechanics.
- **Full publisher/preview stream unification** — the framing-check reuses the existing
  `useCameraPublish` local stream + `CameraFeed` preview (one preview, not a second `getUserMedia`), but
  a complete refactor of the publish/preview stream ownership is not in scope.

## Key decisions

| Decision | Choice | Rationale |
|---|---|---|
| Vision telemetry transport | New `vision_health` WS frame, clinician-only, ~2 Hz | Mirrors the `eeg_quality` pattern; keeps unrelated subsystems out of the byte-stable `intent_score` contract; never reaches the patient channel. |
| Framing-check source | Browser-local | No sidecar dependency for the setup step; no relay hop. |
| Framing-check detection | Lightweight heuristic + manual confirm | No ML in the browser → no multi-MB MediaPipe wasm/model bundle over the LAN, no duplicate detector. Fast to ship. |
| Kinematic-field render depth | Light (consume frame fields) | Full Phase C verified-ROM is a separate game-design milestone. |

## Architecture

### 1. Backend — `vision_health` frame (`signal-engine/`)

New clinician-only frame broadcast on its own ~2 Hz loop, decoupled from the 20 Hz score frame and from
the `eeg_quality` loop:

```json
{"type":"vision_health",
 "connection":"connected",       // connecting | connected | failed | closed | disconnected
 "fps":14.8,                      // derived from VideoFrameSink.frame_count delta over the sample window
 "kinematic_active":true,         // LatestKinematic produced a fresh (non-stale) result recently
 "degraded":false,                // see rule below
 "timestamp": 1751990400.0}
```

**New component `VisionHealthMonitor`** (in `signal-engine/vision/`), constructed with references to the
`WebRTCReceiver`, the `VideoFrameSink`, and the `LatestKinematic` holder. Each sample (~2 Hz):

- `connection` ← `WebRTCReceiver.connection_state()` (new accessor reading `pc.connectionState`; returns
  `"closed"` / a sentinel when no peer connection exists yet).
- `fps` ← `(frame_count_now - frame_count_prev) / dt`. Reported `0.0` when no frames flow.
- `kinematic_active` ← `LatestKinematic` has a result whose age < the staleness threshold
  (reuse the existing `kinematic_staleness_s`, 0.3 s).
- `degraded` ← `True` only when the active fusion mode is kinematic-weighted (Mode B or C) **and**
  kinematic evidence is stale/absent beyond the staleness threshold. In Mode A, EEG-only is the expected
  design point, so `degraded` stays `False`.

**`WebRTCReceiver`** gains a `connection_state()` accessor that reads `pc.connectionState` (or a
`"closed"`-equivalent sentinel before `_ensure_pc`).

**`NeuroReachWSServer`** gains a `vision_health` broadcast loop, structured like the existing
`eeg_quality` loop — only started when a `webrtc_receiver` (or the monitor) is present. It is
**never gated by the session controller and never reaches the patient channel**, exactly like
`eeg_quality`. The 20 Hz `intent_score` contract is byte-for-byte unchanged.

**`run_ws_server.py`** constructs the `VisionHealthMonitor` after the scoring service + kinematic worker
are built (same ordering constraints as V2-2b — after the 2 s EEG baseline) and passes it to the server.
When MediaPipe / the WebRTC receiver is absent (real-headset / EEG-only boot), no monitor is built and no
`vision_health` frame is emitted.

### 2. Patient — framing-check scene (`patient-web/`)

New scene inserted **after Pairing, before Calibration** in the patient flow
(`Welcome → Pairing → FramingCheck → Calibration → GameModeSelect → Garden/StarCatch → Summary`).

- Reuses the local `useCameraPublish` stream and the existing `CameraFeed` preview component — one
  `getUserMedia`, one preview element (light stream-reuse, not a full refactor).
- Renders a framing-guide silhouette overlay ("get your head, shoulders, and affected arm in the box").
- **Lightweight heuristic gate** (no ML): confirms the stream is live (track `readyState === "live"`),
  has usable dimensions (`videoWidth`/`videoHeight` > 0), and is adequately lit — sample average
  luminance from a hidden `<canvas>` drawImage over a small downscaled frame, require it above a dark
  threshold. The "I'm in frame" button enables once the heuristic passes; the patient confirms manually.
- **Camera-denied / no-camera path:** the step is skippable and non-blocking — the session proceeds on
  the EEG-only fallback (consistent with V2-2b's absent-evidence gating). No hard block.

### 3. Patient — render kinematic fields (light; P4/P5)

Consume the `kinematicScore: number | null` and `compensationFlag: boolean` already produced by the
shared `parseIntentScoreMessage` parser (V2-2b). No parser change.

- **P5 — compensation cue:** when `compensationFlag === true`, show a non-punitive overlay: *"keep your
  trunk still — reach with your arm."* Debounced (hysteresis / min-visible-duration) so it does not
  flicker frame-to-frame. Never blocks play or zeroes the score on-screen — the penalty already applied
  in the fused `intent_score` upstream.
- **P4 — verified indicator:** a subtle "movement verified" affordance shown when
  `kinematicScore !== null` (vision is actively contributing). The plant/reach growth continues to ride
  the fused `intent_score`; no game-mechanics change.

### 4. Clinician — health panel, kinematic readout, fusion controls (`clinician-console/`)

- **`VisionHealthPanel`** in the `SessionFlow` live view: connection-state dot, fps readout, and a
  "vision degraded — EEG-only" banner driven by the `vision_health` frame's `degraded` flag. Absent
  frame (EEG-only boot) → panel shows "no camera link" / hidden.
- **Live kinematic readout:** `kinematicScore` value + a compensation indicator, from the `intent_score`
  frame the console already receives.
- **Fusion controls** (in `CalibrateStep` / `SessionFlow`):
  - Mode A/B/C selector → `set_mode` with `fusion_mode`.
  - Affected-side L/R selector → `set_mode` with `affected_side`.
  - "Calibrate rest pose" button → `calibrate_pose` command.

  All three commands already exist on the sidecar (V2-2b) — this wires UI to them.

## Parser / contract rules

- **`vision_health` is clinician-only.** It is added to the clinician-console score-client parser only,
  and must **never** be parsed or routed on the patient channel — the same invariant already enforced
  for `eeg_quality`.
- **`intent_score` frame is unchanged.** `kinematicScore`/`compensationFlag` were added byte-identically
  to both apps' `parseIntentScoreMessage` in V2-2b; V2-2c only *renders* them. The shared parser stays
  byte-identical across the two apps.

## Data flow (additions only)

```
WebRTCReceiver.pc.connectionState ─┐
VideoFrameSink.frame_count ────────┼─► VisionHealthMonitor (~2 Hz) ─► NeuroReachWSServer
LatestKinematic (freshness) ───────┘        (degraded rule)            vision_health loop
                                                                          │ (clinician-only,
                                                                          │  ungated, never to patient)
                                                                          ▼
                                                          clinician-console scoreClient parser
                                                                          ▼
                                                                  VisionHealthPanel

patient getUserMedia (existing) ─► FramingCheck heuristic ─► confirm ─► Calibration
intent_score.kinematicScore/compensationFlag (existing) ─► patient P4/P5 render + clinician readout
```

## Error handling / edge cases

- **No WebRTC receiver / MediaPipe absent (real headset or EEG-only boot):** no `VisionHealthMonitor`,
  no `vision_health` frame; console health panel shows "no camera link". Patient framing-check is
  skippable. Everything degrades to the existing EEG-only path.
- **Frames stop mid-session:** `fps` → 0, `kinematic_active` → false; in Mode B/C the `degraded` banner
  raises; scoring already falls back to EEG-only via the V2-2b staleness gate.
- **Camera denied on patient device:** framing-check non-blocking; session continues EEG-only.
- **Compensation flicker:** debounced on the patient render side.

## Testing

**signal-engine (Python):**
- `VisionHealthMonitor`: fps derivation from `frame_count` deltas; `kinematic_active` freshness;
  `degraded` rule true only in Mode B/C with stale/absent kinematic, false in Mode A.
- `WebRTCReceiver.connection_state()` accessor (pre-`_ensure_pc` sentinel + delegates to `pc`).
- `vision_health` frame: schema, ~2 Hz cadence, present only with a receiver/monitor, **never
  broadcast to a patient-role client**, `intent_score` still byte-stable.

**clinician-console (Vitest):**
- `vision_health` parse; `VisionHealthPanel` states (connected / degraded / no-link).
- Fusion controls emit the correct `set_mode{fusion_mode}` / `set_mode{affected_side}` /
  `calibrate_pose` WS commands.
- Kinematic readout renders `kinematicScore` + compensation indicator.

**patient-web (Vitest + jsdom):**
- Framing-check heuristic (live/dimensions/luminance) gates the confirm button; manual advance;
  camera-denied skip path.
- P5 compensation cue shows on `compensationFlag` with debounce; P4 verified indicator on non-null
  `kinematicScore`.

## Milestone exit criteria

- Clinician sees live camera-link health (state, fps) and a "vision degraded — EEG-only" banner when
  kinematic evidence drops in a kinematic-weighted mode.
- Patient completes a framing-check step before calibration and sees a compensation cue + verified
  indicator during play.
- Clinician can set fusion mode + affected side and trigger rest-pose calibration from the console.
- `intent_score` contract unchanged; `vision_health` never reaches the patient; all three test suites
  green.
