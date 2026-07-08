# V2-2b — Kinematic Scoring + Fusion (design)

_Date: 2026-07-07. Reference spec: [`docs/specs.md`](../../specs.md) §7 (camera verification), §8
(fusion). Predecessor: [`2026-07-07-v2-2a-webrtc-transport-spine-design.md`](2026-07-07-v2-2a-webrtc-transport-spine-design.md)._

## 1. Goal & scope

V2-2a landed the camera transport spine: patient `getUserMedia` → WebRTC → console signaling relay →
sidecar `aiortc` answerer → decoded frames in `VideoFrameSink` (latest-frame, drop-oldest,
`av.VideoFrame`). Scoring is still EEG-only (`w_kin = 0`).

V2-2b turns those frames into a **kinematic score** and **blends it into the live `IntentScore`**.

**In scope**
- MediaPipe Pose + Hands estimation on `VideoFrameSink` frames (injectable estimator seam).
- Kinematic features: shoulder / elbow flexion, wrist extension, trunk displacement, jerk/smoothness.
- 5 s rest-pose calibration → per-session relative-displacement reference.
- `KinematicScoreEngine` → adaptive rest→max ROM score + compensation penalty + validity/movement signals.
- Background `KinematicWorker` decoupling MediaPipe cadence from the 20 Hz scoring tick.
- **Fusion wiring**: `IntentScoreEngine` blends `Kinematic_Score` per session mode (A/B/C weights) and
  subtracts the compensation penalty; kinematic now moves the game score.
- Nullable `kinematic_score` + `compensation_flag` fields on the `intent_score` WS frame (parser plumbing
  both JS sides).
- `mediapipe` installed into the `eeg` conda env.

**Explicitly deferred to V2-2c**
- Console **health-panel UX** (WebRTC state, frame rate, "vision degraded — EEG-only" banner) and the
  **framing-check** setup step ("we can see your head, shoulders, affected arm ✓").
- **Rendering** the new kinematic frame fields in the console.
- **Covert-MI trial-invalidation / classifier-training-exclusion.** Needs per-trial covert-vs-attempted
  context that the real-time path does not model yet. V2-2b emits `movement_detected`; wiring it to
  invalidate covert trials and exclude them from training comes with the trial machinery.

**Out of scope (later milestones)**
- Per-trial ROM targets driven by game state; goniometer ground-truth validation (§13); dependency-manifest
  pinning (V2-4 packaging).

## 2. Architecture

### 2.1 Data flow (extends V2-2a)

```
VideoFrameSink (latest av.VideoFrame)                       [V2-2a, existing]
  → KinematicWorker (background thread, ~15 Hz)
       PoseEstimator.estimate(frame) → PoseFrame {pose[33] + hands, visibility, ts}
       kinematics.py (pure fns)      → joint angles, trunk displacement, jerk
       KinematicScoreEngine          → KinematicResult
  → LatestKinematic holder (thread-safe, monotonic ts for staleness)
  → ScoringService 20 Hz tick reads latest (stale/absent → None)
  → IntentScoreEngine.compute(ring_buffer, artifact_clean, kinematic=None)
       IntentScore = w_eeg · EEG_Score + w_kin · Kinematic_Score − Penalty_Compensation
  → NeuroReachWSServer broadcasts intent_score (+ nullable kinematic_score, compensation_flag)
```

The MediaPipe worker runs at its own cadence and always publishes the **latest** result; the 20 Hz scoring
tick samples that holder. A slow MediaPipe frame therefore never stalls scoring — it just reads as a stale
(→ absent) kinematic sample for a tick or two.

### 2.2 Modules (`signal-engine/vision/`)

| Module | Responsibility | Depends on | Testable without |
|---|---|---|---|
| `pose_estimator.py` | `PoseEstimator` Protocol + `MediaPipePoseEstimator` (Pose+Hands). Adapter `av.VideoFrame` → `ndarray(rgb24)`. Returns `PoseFrame`. | `mediapipe`, `av` (real impl only) | camera + model (inject a fake) |
| `kinematics.py` | Pure fns: `joint_angle(a,b,c)`, `trunk_displacement(pose, rest)`, `jerk(history)`, affected-side index mirror. | `numpy` | everything (synthetic landmark arrays) |
| `rest_pose.py` | `RestPoseCalibrator` — collect 5 s of `PoseFrame`, reduce to a median rest pose (trunk reference + baseline joint angles). Insufficient-frame guard. | `kinematics` | model (feed synthetic `PoseFrame`s) |
| `kinematic_engine.py` | `KinematicScoreEngine` — `PoseFrame` + rest pose → `KinematicResult`. Adaptive rest→observed-max ROM min-max; visibility gating (exclude low-`visibility` joint / last-known-good decay); jerk → smoothness; trunk-lean → compensation penalty + flag. | `kinematics` | model |
| `kinematic_worker.py` | `KinematicWorker` — background thread pulls `VideoFrameSink.latest()` at fixed cadence, dedups already-seen frames, runs estimator + engine, publishes to `LatestKinematic`. `start()` / `stop()` (join) mirroring `ScoringService`. | `VideoFrameSink`, estimator, engine | model (fake estimator) |

`PoseEstimator` is a Protocol so unit tests inject a fake emitting synthetic landmarks — no MediaPipe model
or camera in CI, exactly the V2-2a `WebRTCReceiver` injectable-peer-factory pattern. One `@pytest.mark.live`
test exercises the real `MediaPipePoseEstimator` on a synthetic image (opt-in, deselected on CI).

### 2.3 Data objects

```python
@dataclass
class PoseFrame:
    pose: np.ndarray          # (33, 4) x,y,z,visibility  (MediaPipe Pose world/normalized)
    hands: dict               # {"left": (21,3)|None, "right": (21,3)|None}
    timestamp: float

@dataclass
class KinematicResult:
    kinematic_score: float          # 0–100, adaptive rest→max ROM
    compensation_penalty: float     # ≥0, subtracted from IntentScore in every mode
    compensation_flag: bool         # trunk lean over threshold this sample
    movement_detected: bool         # any tracked joint moved past a rest deadband
    pose_valid: bool                # enough high-visibility landmarks to score
    timestamp: float
```

`pose_valid=False` (occlusion, no person, all-low-visibility) is **absent evidence**: the engine returns a
result with `pose_valid=False` and the fusion step drops `w_kin` for that tick rather than scoring it as 0.

## 3. Kinematic scoring

- **Joint angles** from landmark triplets: shoulder flexion (hip–shoulder–elbow), elbow flexion
  (shoulder–elbow–wrist), wrist extension (elbow–wrist–hand from Hands landmarks). Angle = `arccos` of the
  normalized dot product of the two limb vectors.
- **Affected-side mirroring:** clinician sets `affected_side` in the profile (passed via `start_session` /
  `set_mode`); the engine selects left- or right-side landmark indices so one code path serves either
  hemiparesis. Default `right` until a profile is wired.
- **Trunk displacement:** horizontal offset of the shoulder-midpoint (and nose) from the calibrated rest
  reference, normalized by shoulder width (scale-invariant). This is the primary compensation detector.
- **ROM normalization:** per-session adaptive min-max on the affected-arm reach metric — rest pose = 0,
  best observed reach = 100 — mirroring `IntentScoreEngine._normalize` (warmup-guarded so one early extreme
  doesn't collapse the range). No per-trial target infrastructure.
- **Smoothness:** jerk (3rd derivative of the wrist trajectory over a short history) lightly modulates the
  score — jittery motion scores below smooth motion at equal ROM.
- **Compensation penalty:** trunk displacement over a conservative default threshold → `compensation_flag`
  and a bounded `compensation_penalty`, subtracted from `IntentScore` **regardless of mode** (a clinical
  guardrail, not a difficulty knob — spec §8.1).
- **Confidence gating:** landmarks below a `visibility` floor are excluded from their joint's contribution;
  a briefly-occluded joint falls back to last-known-good with time decay; if too few landmarks are
  trustworthy, `pose_valid=False` (absent, per §7.3) — never let a noisy keypoint silently corrupt the
  score.

## 4. Fusion changes (`scoring/intent_score.py`)

- New signature: `compute(ring_buffer, artifact_clean, kinematic: KinematicResult | None = None)`.
  **Backward compatible** — `kinematic=None` reproduces the current EEG-only path byte-for-byte.
- **Session-mode weights** (spec §8.2–8.4):

  | Mode | `w_eeg` | `w_kin` | Meaning |
  |---|---|---|---|
  | A — covert MI | 1.0 | 0.0 | camera is a validity gate only |
  | B — blended (default) | 0.6 | 0.4 | reward effort on both channels |
  | C — active practice | 0.25 | 0.75 | task-specific movement dominates |

- `IntentScore = w_eeg · EEG_Score + w_kin · Kinematic_Score − Penalty_Compensation`, clamped `[0,100]`.
- **Absent-evidence rule:** if `kinematic is None` or `pose_valid=False`, set `w_kin=0`, renormalize the EEG
  weight to 1.0, and add **no** compensation penalty — a dropped/absent frame is never scored as clean
  stillness or as movement (spec §7.3 / §8.1). Mode A already has `w_kin=0`, so covert MI is unaffected by
  camera gaps.
- Compensation penalty applies in every mode when `pose_valid` and `compensation_flag`.

## 5. Wiring & control (`server/`, `run_ws_server.py`)

- **Boot order preserved** (critical invariant): scoring service (2 s rest baseline pull) →
  `VideoFrameSink` + `WebRTCReceiver` (V2-2a) → **`KinematicWorker` attached to the sink**. The worker is
  idle/absent during the EEG baseline; it never contaminates the 2 s rest capture.
- `ScoringService` owns the `KinematicWorker` + `LatestKinematic`, reads the latest kinematic each 20 Hz
  tick, applies a **staleness timeout** (older than N ms → treated as absent), and passes it to
  `IntentScoreEngine.compute`.
- **New WS command `calibrate_pose`** → runs the 5 s `RestPoseCalibrator` capture against live frames,
  stores the rest pose in the engine, replies per-client (never broadcast) with success / insufficient
  frames. (Console/patient UX to trigger it is polished in V2-2c; the mechanism lands here.)
- **Session mode + `affected_side`** carried on `start_session` (and settable via `set_mode`); default
  **Mode B** when kinematic frames are arriving, **Mode A** when the camera is absent/denied (EEG-only
  fallback, spec §7.3). Existing patient-side camera-deny → EEG-only already holds.
- **`intent_score` frame** gains nullable `kinematic_score` and `compensation_flag`. The shared parser
  already tolerates a null sub-score (`classifier_score`), so this is additive and forward-compatible. The
  frame stays **byte-identical across patient-web and clinician-console** — both parsers updated together.
  Console **rendering** of these fields is V2-2c.

## 6. Dependencies

- Install `mediapipe` (and its `opencv`/`av` transitive needs already present) into the `eeg` conda env,
  matching the V2-2a `aiortc` approach.
- **Unpinned**, like `aiortc` — the repo still tracks no requirements/environment manifest. Recorded as a
  known gap in `docs/todos.md`; manifest + Windows-clinic install validation deferred to V2-4 packaging.

## 7. Testing

Signal-engine (pytest, `eeg` env, run from repo root):

| File | Covers |
|---|---|
| `test_kinematics.py` | joint-angle math on known triplets, trunk displacement vs rest, jerk on a synthetic trajectory, affected-side index mirror |
| `test_rest_pose.py` | 5 s capture → median rest pose; insufficient-frame guard |
| `test_kinematic_engine.py` | ROM score rises with reach; compensation penalty + flag on trunk lean; low-`visibility` joint excluded; last-known-good decay; all-low-visibility → `pose_valid=False` |
| `test_kinematic_worker.py` | fake estimator: worker pulls sink, publishes latest result, frame dedup, staleness → absent, `stop()` joins |
| `test_intent_score.py` (extend) | kinematic blends per mode A/B/C; `kinematic=None` reproduces EEG-only; `pose_valid=False` → EEG-only renormalize; compensation penalty subtracts and clamps |
| `test_ws_server.py` / new | `calibrate_pose` routes + per-client reply; `intent_score` frame carries nullable `kinematic_score` + `compensation_flag`; multi-client parity preserved |
| `test_pose_estimator_live.py` | `@pytest.mark.live` — real `MediaPipePoseEstimator` on a synthetic image yields landmarks (opt-in, deselected on CI) |

Patient-web + clinician-console (Vitest): extend the shared `intentScoreMessage` parser tests for the two
new nullable fields; assert both parsers stay byte-identical and that `eeg_quality` remains clinician-only.

## 8. Risks & mitigations

- **MediaPipe CPU cost (Pose + Hands sustained).** Worker runs at ~15 Hz (below the 20 Hz scoring tick) and
  keeps only the latest frame; a slow inference degrades to a stale→absent sample, never a scoring stall.
  If sustained load is a problem on the clinic floor, Hands can be dropped to Pose-only behind the same
  interface.
- **Silent kinematic corruption from bad keypoints.** Visibility gating + last-known-good decay +
  `pose_valid=False` absent-evidence path; conservative default compensation threshold; no fabricated clean
  or movement evidence on a dropped frame.
- **Contaminating the EEG rest baseline.** Boot order keeps the worker off until after the 2 s baseline;
  covered by an ordering assertion.
- **Frame-contract drift between the two JS clients.** Both parsers changed in the same step with
  byte-identical assertions, as the existing `intent_score` invariant requires.
```
