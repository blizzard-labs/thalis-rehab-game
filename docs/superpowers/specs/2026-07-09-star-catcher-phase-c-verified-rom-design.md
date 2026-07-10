# Star Catcher — Phase C Verified-ROM Game (Design)

**Date:** 2026-07-09
**Status:** Approved, pending implementation plan
**Supersedes the Phase-A slice of:** `docs/reachcollect.md` (Phase C section)
**Related specs:** `docs/specs.md` §7.2 (kinematic pipeline), §8 (fusion), §9.2/§9.3 (Reach & Collect, accessibility), §10.3 (protocol/trends — mostly out of scope here)

## 1. Summary

Turn the Star Catcher mini-game (`patient-web/src/scenes/StarCatchScene.tsx` +
`reach/ReachModel.ts`) from its current **Phase A** form — a single fixed target
whose reach is driven by the fused `intent_score` magnitude on a one-segment arm
— into the spec's **Phase C verified-ROM** game: discrete cued trials over a
catalogue of clinically-relevant joint movements, each verified against the
patient's own calibrated range of motion, with a two-bone avatar arm that
mirrors the patient's real measured pose.

The vision pipeline (`signal-engine/vision/`) is built and already fuses a scalar
`kinematic_score` into `IntentScore`. This feature extends it to emit **per-joint
angles** and adds a **per-joint max-ROM calibration**, then rebuilds the patient
scene around verified per-target reaching.

### Decisions locked (from brainstorming)

| Dimension | Decision |
|---|---|
| Scope | Phase C-full — per-joint **verified** ROM (not just cued) |
| Joints | Shoulder flexion, shoulder abduction, elbow extension. Grasp/wrist → future (todos) |
| Target angles | **Per-patient calibrated**: rest = 0, per-joint max capture sets ceiling; target = rest + X·(max − rest), X = 0.70 |
| Trial structure | **Discrete cued trials**: cue → reach → hold/verify → collect → rest → next; catalogue cycles per trial |
| Arm drive | **FK mirrors real measured pose**; EEG (`intentScore`) gates engagement/credit but does not move the arm |
| Console | **Minimal** — per-joint max-ROM capture step only; catalogue hardcoded in patient-web; no protocol editor, no trend charts |
| Trials | Open-ended cycling; End-session button ends the session (as today) — no fixed trial count |

## 2. Data contract (the spine)

The `intent_score` WS frame is a single contract shared **byte-identically** by
`patient-web` and `clinician-console` (see the `intentScoreMessage.ts` invariant).
It grows one **additive, backward-compatible** nested object; all existing fields
(`intent_score`, `erd_score`, `classifier_score`, `kinematic_score`,
`compensation_flag`, `is_artifact`, `mode`, `timestamp`) are unchanged.

```jsonc
{
  "type": "intent_score",
  "intent_score": 71.2,
  "kinematic_score": 64.0,
  "compensation_flag": false,
  "joints": {
    "shoulder_flexion_deg": 62.4,
    "shoulder_abduction_deg": 18.1,
    "elbow_deg": 148.0,
    "pose_valid": true
  },
  "timestamp": 1720000000.0
}
```

- `joints` is present whenever a pose is being processed. When pose is absent /
  low-visibility, `pose_valid` is `false` and the angle numbers hold their
  last-known-good (mirroring the engine's existing LKG bridge) — never scored as
  a hard 0.
- EEG remains fused into `intent_score`; the patient scene reads `intent_score`
  only as the **engagement gate**, not for arm motion.

### Per-patient targets (delivered once, not per-frame)

On `start_session`, the backend sends a distinct message carrying the calibrated
per-joint targets computed during ROM calibration:

```jsonc
{
  "type": "rom_targets",
  "targets": {
    "shoulder_flexion": { "rest_deg": 12.0, "max_deg": 84.0, "target_deg": 62.4 },
    "shoulder_abduction": { "rest_deg": 8.0, "max_deg": 70.0, "target_deg": 51.4 },
    "elbow_extension":   { "rest_deg": 95.0, "max_deg": 165.0, "target_deg": 144.0 }
  }
}
```

`target_deg = rest_deg + 0.70 · (max_deg − rest_deg)` (X = 0.70, a module-level
constant, not per-frame). If ROM calibration was skipped (dev / no-camera),
patient-web falls back to hardcoded default targets so the game is still playable.

## 3. Backend (signal-engine)

### 3.1 Angle geometry — `vision/kinematics.py`

Add pure functions (NumPy only, unit-testable with synthetic poses):

- `shoulder_flexion_angle(pose, side)` — elevation of the upper-arm
  (shoulder→elbow) relative to the trunk (hip→shoulder) in the **sagittal** plane.
- `shoulder_abduction_angle(pose, side)` — elevation in the **frontal** plane.
- Elbow reuses existing `joint_angle(shoulder, elbow, wrist)`.

**Modeling risk (documented, accepted):** monocular MediaPipe pose separates
**abduction** (frontal x–y, with the camera facing the patient) reliably, but
**flexion** depends on the depth (z) estimate and is **approximate**. Flexion is
computed from the sagittal elevation using z; treated as approximate and tuned
conservatively. This is called out so downstream clinical claims stay honest
(spec §12 — no claims beyond the signal). The two-bone FK render uses the
shoulder **elevation** angle actually driving the on-screen arm (frontal-plane
dominant), so the avatar remains faithful even where flexion depth is noisy.

### 3.2 Result + engine — `vision/types.py`, `vision/kinematic_engine.py`

- Extend `KinematicResult` with `shoulder_flexion_deg`, `shoulder_abduction_deg`,
  `elbow_deg` (defaults preserve existing constructors/tests).
- `KinematicScoreEngine.compute` attaches the three angles every frame; the LKG
  bridge carries them through a brief dropout alongside the existing score.

### 3.3 Per-joint max-ROM calibration

New `RomCalibrator` (mirrors `RestPoseCalibrator`): over a capture window it
tracks the **max** angle seen per joint (from clean, visible frames), then builds
a targets structure using rest angles as the floor. Add a worker mode:

- `KinematicWorker.begin_rom_calibration()` / `rom_calibration_status()` /
  `rom_targets()` — same shape as the existing rest-pose calibration hooks; while
  active, frames feed the `RomCalibrator` instead of scoring, then normal scoring
  resumes and the targets are retained for the session.

### 3.4 WS server — `server/ws_server.py`

- Emit `joints` inside each `intent_score` frame.
- Emit a `rom_targets` message on `start_session` (from the worker's computed
  targets). Gated to the active session like `intent_score`.
- Handle a `begin_rom_calibration` command (console-triggered), analogous to the
  existing rest-pose calibration command.

## 4. Shared parser (both apps)

`intentScoreMessage.ts` — **byte-identical** in `patient-web` and
`clinician-console` — gains a parsed `joints` field on `ScoreFrame`:

```ts
joints: {
  shoulderFlexionDeg: number | null;
  shoulderAbductionDeg: number | null;
  elbowDeg: number | null;
  poseValid: boolean;
} | null;
```

Absent `joints` → `null` (backward compatible with pre-Phase-C frames). Both
copies change together; parser tests updated in both packages.

## 5. patient-web

### 5.1 `RomTrialModel` (new — replaces `ReachModel` for this scene)

Pure, renderer-agnostic (mirrors `PlantGrowthModel`/`ReachModel` shape):

- Holds the **catalogue** (hardcoded, cycling): `shoulder_flexion → shoulder_abduction → elbow_extension → …`.
- Holds current target `{ joint, targetDeg }` from the `rom_targets` message
  (or hardcoded defaults if none).
- Each `update(frame, engaged, dt)`: reads the measured angle for the current
  joint from `frame.joints`; `achieved = clamp01(measuredDeg / targetDeg)`
  (rest-relative). Collect when `achieved ≥ 1` **and** `engaged` (EEG gate), held
  for `HOLD_S`. On collect: increment stars, emit a trial log
  `{ joint, targetDeg, achievedDeg, compensationFlag }`, advance the catalogue,
  enter a brief rest, then present the next cue.
- **No staircase** (calibrated ceiling replaces it; staircase deferred to todos).
- Asymmetric ease / hysteresis / non-punitive philosophy retained for the
  smoothed on-screen values.

### 5.2 Two-bone FK avatar arm — `StarCatchScene`

Replace the single shoulder→hand segment with a two-bone rig:
shoulder → elbow → wrist, drawn via forward kinematics from
`(shoulderElevationAngle, elbowAngle)` taken from `frame.joints`. The avatar
**mirrors the patient's real arm** — lifts on flexion/abduction, straightens on
elbow extension. Anchored on the affected side (config), target/cue in the intact
visual field (spec §9.3).

### 5.3 Trial loop + cueing

Scene states: **cue → reaching → verifying/hold → collected(⭐ celebrate) →
rest → next**. Per-target aphasia-friendly cue text + icon (no jargon), e.g.
"reach up high" (flexion), "reach out to the side" (abduction), "straighten your
arm" (elbow). `compensationFlag` keeps the existing "keep your trunk still" cue
(`KinematicOverlay`, non-blocking). "Reach power" meter stays a single fused
number.

## 6. Console (minimal)

Add a **Range of motion** calibration sub-step after rest-pose capture: three
quick per-joint max captures, triggered like the existing rest calibration
(reuses the patient camera / pose stream over WebRTC; console renders no camera
itself — pose lives in signal-engine). Sends the `begin_rom_calibration` command
and reflects `rom_calibration_status`. No protocol editor, no trend charts.

## 7. Testing

- **Backend:** angle-math unit tests on synthetic poses (flexion/abduction/elbow,
  including degenerate/zero-length cases); `RomCalibrator` max-tracking + target
  computation; `KinematicResult`/frame schema carries angles + LKG bridge; WS
  emits `joints` and `rom_targets` (session-gated).
- **Shared parser:** `joints` parsed identically in both packages; absent-field
  backward compatibility; byte-identical diff check.
- **patient-web:** `RomTrialModel` (achieve/collect/EEG-gate/advance/log,
  default-target fallback); FK rig geometry (angles → joint positions); trial-loop
  component states + cue text; `KinematicOverlay` compensation cue unchanged.
- **Console:** ROM max-capture step (start/status/complete, affected-side reset).

## 8. Out of scope → `docs/todos.md`

- Grasp / wrist-extension target (needs `mediapipe.Hands`; `PoseFrame.hands`
  already present but unused here).
- Protocol editor (§10.3) — clinician-editable/ordered catalogue.
- Live per-trial ROM readout + ROM-over-time trend charts (§10.3).
- Mode-dependent arm drive (covert/MI mode → fused-score drive instead of FK
  mirror).
- Adaptive staircase **within** the calibrated range.

## 9. Rollout notes

- Backward compatible: pre-Phase-C frames (no `joints`) still parse; no ROM
  calibration → hardcoded default targets keep the game playable in dev/no-camera.
- Cross-app change set touches all three subsystems + the shared parser; land as
  one coordinated feature branch. Update `docs/todos.md` per project rules and
  fold the deferred items above into it.
