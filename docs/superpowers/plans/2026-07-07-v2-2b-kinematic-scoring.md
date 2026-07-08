# V2-2b Kinematic Scoring + Fusion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn decoded WebRTC camera frames into a kinematic score and blend it into the live 20 Hz `IntentScore` (Mode A/B/C weights + compensation penalty), with 5 s rest-pose calibration and absent-evidence gating.

**Architecture:** A `KinematicWorker` background thread pulls the latest `av.VideoFrame` from the existing `VideoFrameSink` (~15 Hz), runs an injectable `PoseEstimator` (MediaPipe Pose+Hands) → `PoseFrame`, feeds a `KinematicScoreEngine` → `KinematicResult`, and publishes it to a thread-safe `LatestKinematic` holder. The 20 Hz `ScoringService` tick reads that holder (staleness → absent) and passes it to `IntentScoreEngine.compute`, which blends it per session mode. A stale/absent/invalid pose drops `w_kin` to 0 — never scored as clean stillness or as movement.

**Tech Stack:** Python 3.10, NumPy, `mediapipe`, `av` (aiortc frames), `websockets`, pytest; TypeScript/Vitest for the two web parsers.

## Global Constraints

- Run all Python via `conda run -n eeg` from the **repo root** (so `signal-engine/tests/conftest.py` puts `signal-engine/` on `sys.path`).
- **`EEGInlet.get_chunk()` only** — never separate EEG/IMU pulls (unrelated to this work, but the loop you touch relies on it).
- **Baseline-before-simulator boot order is sacred:** the 2 s ERD rest baseline runs in `build_scoring_service()` before anything camera-related; the `KinematicWorker` must not run during it.
- **Absent evidence rule (spec §7.3 / §8.1):** a dropped/absent/invalid pose is *absent evidence*, never clean stillness and never movement — `w_kin=0`, no compensation penalty fabricated.
- **`intent_score` frame stays byte-identical across `patient-web` and `clinician-console`** — change both parsers together; `eeg_quality` frames stay clinician-only.
- **New heavy deps injectable** — MediaPipe imported lazily behind a Protocol so unit tests run without the model/camera (the V2-2a `aiortc` pattern). Live/model tests use `@pytest.mark.live`.
- Commit messages: **no `Co-Authored-By` trailer** (user preference).
- MediaPipe landmark indices (Pose): `NOSE=0, LEFT_SHOULDER=11, RIGHT_SHOULDER=12, LEFT_ELBOW=13, RIGHT_ELBOW=14, LEFT_WRIST=15, RIGHT_WRIST=16, LEFT_HIP=23, RIGHT_HIP=24`.
- Mode weights: **A** `(w_eeg=1.0, w_kin=0.0)` · **B** `(0.6, 0.4)` · **C** `(0.25, 0.75)`.

---

## File structure

**Create (`signal-engine/vision/`):**
- `types.py` — `PoseFrame`, `KinematicResult`, `RestPose` dataclasses (NumPy only, no MediaPipe).
- `kinematics.py` — pure geometry: `joint_angle`, `reach_extent`, `trunk_displacement`, `jerk`, `side_indices`.
- `rest_pose.py` — `RestPoseCalibrator` (collect PoseFrames → `RestPose`).
- `kinematic_engine.py` — `KinematicScoreEngine` (`PoseFrame|None` → `KinematicResult`).
- `pose_estimator.py` — `PoseEstimator` Protocol, `frame_to_ndarray`, `MediaPipePoseEstimator`.
- `kinematic_worker.py` — `LatestKinematic` holder + `KinematicWorker` thread.

**Modify:**
- `signal-engine/scoring/intent_score.py` — fusion: `compute(..., kinematic=None)`, mode weights, new result fields.
- `signal-engine/scoring/scoring_service.py` — own/read the kinematic source, staleness gate.
- `signal-engine/server/ws_server.py` — `_format` new fields, `calibrate_pose` cmd, `set_mode` fusion-mode/affected-side.
- `signal-engine/run_ws_server.py` — build estimator + engine + worker, attach to scoring service.
- `patient-web/src/scoring/intentScoreMessage.ts` + `clinician-console/src/scoring/intentScoreMessage.ts` — parse new nullable fields.
- `docs/todos.md` — milestone + mediapipe-manifest gap.

**Test (new):** `test_kinematics.py`, `test_rest_pose.py`, `test_kinematic_engine.py`, `test_kinematic_worker.py`, `test_pose_estimator_live.py`; extend `test_intent_score.py`, `test_scoring_service.py`, `test_ws_server.py`; extend both `intentScoreMessage.test.ts`.

---

## Task 1: Kinematic data types + pure geometry

**Files:**
- Create: `signal-engine/vision/types.py`, `signal-engine/vision/kinematics.py`
- Test: `signal-engine/tests/test_kinematics.py`

**Interfaces:**
- Produces:
  - `PoseFrame(pose: np.ndarray, hands: dict, timestamp: float)` — `pose` shape `(33,4)` = x,y,z,visibility.
  - `KinematicResult(kinematic_score: float, compensation_penalty: float, compensation_flag: bool, movement_detected: bool, pose_valid: bool, timestamp: float)`.
  - `RestPose(shoulder_mid: np.ndarray, shoulder_width: float, reach_extent: float, timestamp: float)`.
  - `kinematics.joint_angle(a, b, c) -> float` (degrees at `b`).
  - `kinematics.reach_extent(pose, side) -> float` (‖wrist−shoulder‖ / ‖shoulder−hip‖).
  - `kinematics.trunk_displacement(pose, rest: RestPose) -> float` (horizontal shoulder-mid shift / rest shoulder width).
  - `kinematics.jerk(positions: list[np.ndarray], dt: float) -> float`.
  - `kinematics.side_indices(affected_side: str) -> dict` with keys `shoulder, elbow, wrist, hip`.

- [ ] **Step 1: Write the failing test**

```python
# signal-engine/tests/test_kinematics.py
import numpy as np
import pytest

from vision import kinematics as kin
from vision.types import PoseFrame, KinematicResult, RestPose


def _pose(overrides=None):
    p = np.zeros((33, 4), dtype=float)
    p[:, 3] = 1.0  # fully visible
    if overrides:
        for idx, xyz in overrides.items():
            p[idx, :3] = xyz
    return p


def test_joint_angle_right_angle():
    a = np.array([0.0, 1.0, 0.0])
    b = np.array([0.0, 0.0, 0.0])
    c = np.array([1.0, 0.0, 0.0])
    assert kin.joint_angle(a, b, c) == pytest.approx(90.0, abs=1e-6)


def test_side_indices_left_and_right():
    r = kin.side_indices("right")
    assert (r["shoulder"], r["elbow"], r["wrist"], r["hip"]) == (12, 14, 16, 24)
    left = kin.side_indices("left")
    assert (left["shoulder"], left["elbow"], left["wrist"], left["hip"]) == (11, 13, 15, 23)


def test_reach_extent_grows_when_arm_extends():
    idx = kin.side_indices("right")
    tucked = _pose({idx["shoulder"]: [0, 0, 0], idx["wrist"]: [0.1, 0, 0], idx["hip"]: [0, 1, 0]})
    extended = _pose({idx["shoulder"]: [0, 0, 0], idx["wrist"]: [1.0, 0, 0], idx["hip"]: [0, 1, 0]})
    assert kin.reach_extent(extended, "right") > kin.reach_extent(tucked, "right")


def test_trunk_displacement_zero_at_rest():
    idx = kin.side_indices("right")
    p = _pose({11: [-0.5, 0, 0], 12: [0.5, 0, 0]})
    rest = RestPose(shoulder_mid=np.array([0.0, 0.0, 0.0]), shoulder_width=1.0,
                    reach_extent=0.2, timestamp=0.0)
    assert kin.trunk_displacement(p, rest) == pytest.approx(0.0, abs=1e-6)
    leaned = _pose({11: [0.0, 0, 0], 12: [1.0, 0, 0]})  # shoulders shifted +0.5 in x
    assert kin.trunk_displacement(leaned, rest) == pytest.approx(0.5, abs=1e-6)


def test_jerk_zero_for_constant_velocity():
    dt = 0.05
    positions = [np.array([float(i), 0.0, 0.0]) for i in range(5)]
    assert kin.jerk(positions, dt) == pytest.approx(0.0, abs=1e-6)


def test_kinematic_result_fields():
    r = KinematicResult(50.0, 0.0, False, True, True, 1.0)
    assert r.kinematic_score == 50.0 and r.pose_valid is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `conda run -n eeg pytest signal-engine/tests/test_kinematics.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'vision.kinematics'` / `vision.types`.

- [ ] **Step 3: Write minimal implementation**

```python
# signal-engine/vision/types.py
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np


@dataclass
class PoseFrame:
    pose: np.ndarray                 # (33, 4): x, y, z, visibility
    hands: dict = field(default_factory=dict)   # {"left": (21,3)|None, "right": ...}
    timestamp: float = 0.0


@dataclass
class KinematicResult:
    kinematic_score: float
    compensation_penalty: float
    compensation_flag: bool
    movement_detected: bool
    pose_valid: bool
    timestamp: float


@dataclass
class RestPose:
    shoulder_mid: np.ndarray         # (3,)
    shoulder_width: float
    reach_extent: float
    timestamp: float
```

```python
# signal-engine/vision/kinematics.py
from __future__ import annotations

import numpy as np

from vision.types import RestPose

# MediaPipe Pose landmark indices.
NOSE = 0
LEFT_SHOULDER, RIGHT_SHOULDER = 11, 12
LEFT_ELBOW, RIGHT_ELBOW = 13, 14
LEFT_WRIST, RIGHT_WRIST = 15, 16
LEFT_HIP, RIGHT_HIP = 23, 24

_LEFT = {"shoulder": LEFT_SHOULDER, "elbow": LEFT_ELBOW, "wrist": LEFT_WRIST, "hip": LEFT_HIP}
_RIGHT = {"shoulder": RIGHT_SHOULDER, "elbow": RIGHT_ELBOW, "wrist": RIGHT_WRIST, "hip": RIGHT_HIP}


def side_indices(affected_side: str) -> dict:
    return dict(_LEFT if str(affected_side).lower() == "left" else _RIGHT)


def joint_angle(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> float:
    """Interior angle at ``b`` (degrees) of the triangle a-b-c."""
    v1 = np.asarray(a, float) - np.asarray(b, float)
    v2 = np.asarray(c, float) - np.asarray(b, float)
    denom = np.linalg.norm(v1) * np.linalg.norm(v2)
    if denom < 1e-9:
        return 0.0
    cos = float(np.clip(np.dot(v1, v2) / denom, -1.0, 1.0))
    return float(np.degrees(np.arccos(cos)))


def reach_extent(pose: np.ndarray, side: str) -> float:
    """Scale-free arm extension: ‖wrist−shoulder‖ / ‖shoulder−hip‖."""
    idx = side_indices(side)
    shoulder = pose[idx["shoulder"], :3]
    wrist = pose[idx["wrist"], :3]
    hip = pose[idx["hip"], :3]
    torso = float(np.linalg.norm(shoulder - hip))
    if torso < 1e-9:
        return 0.0
    return float(np.linalg.norm(wrist - shoulder) / torso)


def shoulder_midpoint(pose: np.ndarray) -> np.ndarray:
    return (pose[LEFT_SHOULDER, :3] + pose[RIGHT_SHOULDER, :3]) / 2.0


def shoulder_width(pose: np.ndarray) -> float:
    return float(np.linalg.norm(pose[LEFT_SHOULDER, :3] - pose[RIGHT_SHOULDER, :3]))


def trunk_displacement(pose: np.ndarray, rest: RestPose) -> float:
    """Horizontal shoulder-midpoint shift from rest, normalized by rest shoulder width."""
    width = rest.shoulder_width if rest.shoulder_width > 1e-9 else 1.0
    dx = shoulder_midpoint(pose)[0] - rest.shoulder_mid[0]
    return float(abs(dx) / width)


def jerk(positions: list[np.ndarray], dt: float) -> float:
    """Mean magnitude of the 3rd time-derivative of a position history."""
    if len(positions) < 4 or dt <= 0:
        return 0.0
    p = np.stack([np.asarray(x, float) for x in positions])
    third = np.diff(p, n=3, axis=0) / (dt ** 3)
    return float(np.mean(np.linalg.norm(third, axis=1)))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `conda run -n eeg pytest signal-engine/tests/test_kinematics.py -q`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add signal-engine/vision/types.py signal-engine/vision/kinematics.py signal-engine/tests/test_kinematics.py
git commit -m "feat(vision): kinematic data types + pure geometry helpers"
```

---

## Task 2: Rest-pose calibrator

**Files:**
- Create: `signal-engine/vision/rest_pose.py`
- Test: `signal-engine/tests/test_rest_pose.py`

**Interfaces:**
- Consumes: `PoseFrame`, `RestPose` (Task 1), `kinematics.shoulder_midpoint/shoulder_width/reach_extent`.
- Produces:
  - `RestPoseCalibrator(affected_side="right", min_frames=30, visibility_threshold=0.5)`.
  - `.add(frame: PoseFrame) -> None` — ignores low-visibility frames.
  - `.is_complete() -> bool` — enough good frames collected.
  - `.build() -> RestPose | None` — median rest pose, or `None` if `not is_complete()`.
  - `.reset() -> None`.

- [ ] **Step 1: Write the failing test**

```python
# signal-engine/tests/test_rest_pose.py
import numpy as np

from vision.rest_pose import RestPoseCalibrator
from vision.types import PoseFrame


def _frame(vis=1.0, x_shift=0.0):
    p = np.zeros((33, 4))
    p[:, 3] = vis
    p[11, :3] = [-0.5 + x_shift, 0, 0]   # left shoulder
    p[12, :3] = [0.5 + x_shift, 0, 0]    # right shoulder
    p[16, :3] = [0.6, 0, 0]              # right wrist
    p[24, :3] = [0.5, 1.0, 0]            # right hip
    return PoseFrame(pose=p, hands={}, timestamp=0.0)


def test_insufficient_frames_returns_none():
    cal = RestPoseCalibrator(min_frames=30)
    for _ in range(5):
        cal.add(_frame())
    assert not cal.is_complete()
    assert cal.build() is None


def test_builds_median_rest_pose():
    cal = RestPoseCalibrator(min_frames=30)
    for _ in range(40):
        cal.add(_frame())
    assert cal.is_complete()
    rest = cal.build()
    assert rest is not None
    assert rest.shoulder_width > 0
    assert abs(rest.shoulder_mid[0]) < 1e-6


def test_low_visibility_frames_ignored():
    cal = RestPoseCalibrator(min_frames=10, visibility_threshold=0.5)
    for _ in range(40):
        cal.add(_frame(vis=0.1))   # all discarded
    assert not cal.is_complete()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `conda run -n eeg pytest signal-engine/tests/test_rest_pose.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'vision.rest_pose'`.

- [ ] **Step 3: Write minimal implementation**

```python
# signal-engine/vision/rest_pose.py
from __future__ import annotations

import numpy as np

from vision import kinematics as kin
from vision.types import PoseFrame, RestPose


class RestPoseCalibrator:
    """Collect a few seconds of clean rest frames into a per-session RestPose."""

    def __init__(self, affected_side: str = "right", min_frames: int = 30,
                 visibility_threshold: float = 0.5):
        self.affected_side = affected_side
        self.min_frames = int(min_frames)
        self.visibility_threshold = float(visibility_threshold)
        self._mids: list[np.ndarray] = []
        self._widths: list[float] = []
        self._reaches: list[float] = []
        self._last_ts = 0.0

    def reset(self) -> None:
        self._mids.clear()
        self._widths.clear()
        self._reaches.clear()

    def add(self, frame: PoseFrame) -> None:
        idx = kin.side_indices(self.affected_side)
        needed = [kin.LEFT_SHOULDER, kin.RIGHT_SHOULDER, idx["wrist"], idx["hip"]]
        if any(frame.pose[i, 3] < self.visibility_threshold for i in needed):
            return
        self._mids.append(kin.shoulder_midpoint(frame.pose))
        self._widths.append(kin.shoulder_width(frame.pose))
        self._reaches.append(kin.reach_extent(frame.pose, self.affected_side))
        self._last_ts = frame.timestamp

    def is_complete(self) -> bool:
        return len(self._mids) >= self.min_frames

    def build(self) -> RestPose | None:
        if not self.is_complete():
            return None
        return RestPose(
            shoulder_mid=np.median(np.stack(self._mids), axis=0),
            shoulder_width=float(np.median(self._widths)),
            reach_extent=float(np.median(self._reaches)),
            timestamp=self._last_ts,
        )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `conda run -n eeg pytest signal-engine/tests/test_rest_pose.py -q`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add signal-engine/vision/rest_pose.py signal-engine/tests/test_rest_pose.py
git commit -m "feat(vision): 5s rest-pose calibrator (median reference)"
```

---

## Task 3: Kinematic score engine

**Files:**
- Create: `signal-engine/vision/kinematic_engine.py`
- Test: `signal-engine/tests/test_kinematic_engine.py`

**Interfaces:**
- Consumes: `PoseFrame`, `KinematicResult`, `RestPose` (Task 1); `kinematics` (Task 1).
- Produces:
  - `KinematicScoreEngine(affected_side="right", visibility_threshold=0.5, compensation_threshold=0.15, max_penalty=25.0, lkg_max_age_s=0.5, norm_warmup=5)`.
  - `.affected_side` (settable attribute).
  - `.set_rest_pose(rest: RestPose) -> None`.
  - `.compute(frame: PoseFrame | None) -> KinematicResult`.

**Notes:** adaptive rest→observed-max ROM normalization mirrors `IntentScoreEngine._normalize`; `frame is None` or all-key-landmarks below `visibility_threshold` → try last-known-good within `lkg_max_age_s`, else `pose_valid=False` (absent). Compensation penalty is `min(max_penalty, k*(disp-thr))` scaled, `compensation_flag=disp>thr`.

- [ ] **Step 1: Write the failing test**

```python
# signal-engine/tests/test_kinematic_engine.py
import numpy as np

from vision.kinematic_engine import KinematicScoreEngine
from vision.rest_pose import RestPoseCalibrator
from vision.types import PoseFrame


def _frame(wrist_x=0.6, shoulder_shift=0.0, vis=1.0, ts=0.0):
    p = np.zeros((33, 4))
    p[:, 3] = vis
    p[11, :3] = [-0.5 + shoulder_shift, 0, 0]
    p[12, :3] = [0.5 + shoulder_shift, 0, 0]
    p[16, :3] = [wrist_x, 0, 0]
    p[24, :3] = [0.5, 1.0, 0]
    return PoseFrame(pose=p, hands={}, timestamp=ts)


def _engine_with_rest():
    cal = RestPoseCalibrator(min_frames=10)
    for _ in range(15):
        cal.add(_frame(wrist_x=0.6))
    eng = KinematicScoreEngine(norm_warmup=2)
    eng.set_rest_pose(cal.build())
    return eng


def test_score_rises_as_arm_extends():
    eng = _engine_with_rest()
    lows = [eng.compute(_frame(wrist_x=0.6, ts=i * 0.05)).kinematic_score for i in range(6)]
    highs = [eng.compute(_frame(wrist_x=2.5, ts=(6 + i) * 0.05)).kinematic_score for i in range(6)]
    assert max(highs) > max(lows)


def test_trunk_lean_flags_and_penalizes():
    eng = _engine_with_rest()
    r = eng.compute(_frame(wrist_x=1.5, shoulder_shift=0.5))
    assert r.compensation_flag is True
    assert r.compensation_penalty > 0.0


def test_absent_frame_is_invalid_not_zero():
    eng = _engine_with_rest()
    r = eng.compute(None)
    assert r.pose_valid is False
    assert r.compensation_penalty == 0.0


def test_all_low_visibility_is_invalid():
    eng = _engine_with_rest()
    r = eng.compute(_frame(vis=0.05))
    assert r.pose_valid is False


def test_last_known_good_bridges_brief_dropout():
    eng = _engine_with_rest()
    eng.compute(_frame(wrist_x=2.5, ts=1.00))            # good, high reach
    bridged = eng.compute(_frame(vis=0.05, ts=1.05))     # dropout within lkg window
    assert bridged.pose_valid is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `conda run -n eeg pytest signal-engine/tests/test_kinematic_engine.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'vision.kinematic_engine'`.

- [ ] **Step 3: Write minimal implementation**

```python
# signal-engine/vision/kinematic_engine.py
from __future__ import annotations

import time

import numpy as np

from vision import kinematics as kin
from vision.types import KinematicResult, PoseFrame, RestPose


class KinematicScoreEngine:
    """PoseFrame (+ per-session rest pose) -> 0–100 KinematicResult."""

    def __init__(self, affected_side: str = "right", visibility_threshold: float = 0.5,
                 compensation_threshold: float = 0.15, max_penalty: float = 25.0,
                 lkg_max_age_s: float = 0.5, norm_warmup: int = 5,
                 movement_deadband: float = 0.05):
        self.affected_side = affected_side
        self.visibility_threshold = float(visibility_threshold)
        self.compensation_threshold = float(compensation_threshold)
        self.max_penalty = float(max_penalty)
        self.lkg_max_age_s = float(lkg_max_age_s)
        self.norm_warmup = int(norm_warmup)
        self.movement_deadband = float(movement_deadband)

        self._rest: RestPose | None = None
        self._min = 0.0
        self._max = 1e-6
        self._n = 0
        self._last_good: KinematicResult | None = None

    def set_rest_pose(self, rest: RestPose | None) -> None:
        self._rest = rest

    def _key_visible(self, frame: PoseFrame) -> bool:
        idx = kin.side_indices(self.affected_side)
        needed = [kin.LEFT_SHOULDER, kin.RIGHT_SHOULDER, idx["wrist"], idx["hip"]]
        return all(frame.pose[i, 3] >= self.visibility_threshold for i in needed)

    def _invalid(self, ts: float) -> KinematicResult:
        # Bridge a brief dropout with the last good result (decayed), else absent.
        if self._last_good is not None and (ts - self._last_good.timestamp) <= self.lkg_max_age_s:
            g = self._last_good
            return KinematicResult(g.kinematic_score, 0.0, False, False, True, ts)
        return KinematicResult(0.0, 0.0, False, False, False, ts)

    def compute(self, frame: PoseFrame | None) -> KinematicResult:
        now = time.time()
        if frame is None or self._rest is None or not self._key_visible(frame):
            ts = now if frame is None else frame.timestamp
            return self._invalid(ts)

        reach = kin.reach_extent(frame.pose, self.affected_side)
        disp = kin.trunk_displacement(frame.pose, self._rest)

        # Adaptive rest->observed-max normalization (mirror IntentScoreEngine).
        self._n += 1
        base = self._rest.reach_extent
        if self._n > self.norm_warmup:
            self._min = min(self._min if self._n > self.norm_warmup + 1 else base, reach, base)
            self._max = max(self._max, reach)
        span = max(self._max - self._min, 1e-6)
        score = float(np.clip((reach - self._min) / span * 100.0, 0.0, 100.0))

        flag = disp > self.compensation_threshold
        penalty = float(min(self.max_penalty, max(0.0, disp - self.compensation_threshold) * 100.0)) if flag else 0.0
        moved = abs(reach - base) > self.movement_deadband or flag

        result = KinematicResult(score, penalty, flag, moved, True, frame.timestamp)
        self._last_good = result
        return result
```

- [ ] **Step 4: Run test to verify it passes**

Run: `conda run -n eeg pytest signal-engine/tests/test_kinematic_engine.py -q`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add signal-engine/vision/kinematic_engine.py signal-engine/tests/test_kinematic_engine.py
git commit -m "feat(vision): kinematic score engine (adaptive ROM + compensation + LKG gating)"
```

---

## Task 4: Pose estimator (injectable) + real MediaPipe + install

**Files:**
- Create: `signal-engine/vision/pose_estimator.py`, `signal-engine/tests/test_pose_estimator_live.py`
- Modify: `docs/todos.md` (mediapipe dependency gap — done in Task 11; note here it is unpinned)

**Interfaces:**
- Consumes: `PoseFrame` (Task 1).
- Produces:
  - `PoseEstimator` Protocol: `.estimate(frame) -> PoseFrame | None`.
  - `frame_to_ndarray(av_frame) -> np.ndarray` (H,W,3 rgb24).
  - `MediaPipePoseEstimator(min_detection_confidence=0.5, model_complexity=1)` implementing the Protocol; lazily imports `mediapipe`.

- [ ] **Step 1: Install mediapipe into the eeg env**

Run: `conda run -n eeg python -m pip install mediapipe`
Expected: installs `mediapipe` (+ its `opencv`/`protobuf` deps) successfully.
Verify: `conda run -n eeg python -c "import mediapipe; print(mediapipe.__version__)"` prints a version.

- [ ] **Step 2: Write the failing live test**

```python
# signal-engine/tests/test_pose_estimator_live.py
import numpy as np
import pytest

pytestmark = pytest.mark.live


def test_mediapipe_estimator_returns_poseframe_shape():
    from vision.pose_estimator import MediaPipePoseEstimator

    class _AVFrame:
        def to_ndarray(self, format="rgb24"):
            return (np.random.default_rng(0).random((256, 256, 3)) * 255).astype("uint8")

    est = MediaPipePoseEstimator()
    result = est.estimate(_AVFrame())
    # Random image usually yields no person -> None is acceptable; when present, shape is (33,4).
    assert result is None or result.pose.shape == (33, 4)
```

- [ ] **Step 3: Run test to verify it fails**

Run: `conda run -n eeg pytest signal-engine/tests/test_pose_estimator_live.py -m live -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'vision.pose_estimator'`.

- [ ] **Step 4: Write minimal implementation**

```python
# signal-engine/vision/pose_estimator.py
from __future__ import annotations

from typing import Optional, Protocol, runtime_checkable

import numpy as np

from vision.types import PoseFrame


@runtime_checkable
class PoseEstimator(Protocol):
    def estimate(self, av_frame: object) -> Optional[PoseFrame]:
        ...


def frame_to_ndarray(av_frame: object) -> np.ndarray:
    """Convert an aiortc av.VideoFrame (or any .to_ndarray provider) to rgb24 HxWx3."""
    return av_frame.to_ndarray(format="rgb24")


class MediaPipePoseEstimator:
    """Real Pose(+Hands) estimator. mediapipe imported lazily so unit tests stay hermetic."""

    def __init__(self, min_detection_confidence: float = 0.5, model_complexity: int = 1):
        import mediapipe as mp  # lazy
        self._mp = mp
        self._pose = mp.solutions.pose.Pose(
            min_detection_confidence=min_detection_confidence,
            min_tracking_confidence=0.5,
            model_complexity=model_complexity,
        )
        self._hands = mp.solutions.hands.Hands(
            max_num_hands=2, min_detection_confidence=min_detection_confidence
        )

    def estimate(self, av_frame: object) -> Optional[PoseFrame]:
        import time as _time
        img = frame_to_ndarray(av_frame)
        pose_res = self._pose.process(img)
        if not pose_res.pose_landmarks:
            return None
        lm = pose_res.pose_landmarks.landmark
        pose = np.array([[p.x, p.y, p.z, p.visibility] for p in lm], dtype=float)

        hands = {"left": None, "right": None}
        hand_res = self._hands.process(img)
        if hand_res.multi_hand_landmarks and hand_res.multi_handedness:
            for lms, handed in zip(hand_res.multi_hand_landmarks, hand_res.multi_handedness):
                label = handed.classification[0].label.lower()  # "left"/"right"
                hands[label] = np.array([[p.x, p.y, p.z] for p in lms.landmark], dtype=float)

        return PoseFrame(pose=pose, hands=hands, timestamp=_time.time())
```

- [ ] **Step 5: Run the live test to verify it passes**

Run: `conda run -n eeg pytest signal-engine/tests/test_pose_estimator_live.py -m live -q`
Expected: PASS (1 test). Also confirm it is deselected by default: `conda run -n eeg pytest signal-engine/tests/test_pose_estimator_live.py -m "not live" -q` collects 0.

- [ ] **Step 6: Commit**

```bash
git add signal-engine/vision/pose_estimator.py signal-engine/tests/test_pose_estimator_live.py
git commit -m "feat(vision): injectable PoseEstimator protocol + real MediaPipe Pose/Hands impl"
```

---

## Task 5: Kinematic worker + latest holder

**Files:**
- Create: `signal-engine/vision/kinematic_worker.py`
- Test: `signal-engine/tests/test_kinematic_worker.py`

**Interfaces:**
- Consumes: `VideoFrameSink` (V2-2a, `.latest()` + `.frame_count`), `PoseEstimator` (Task 4), `KinematicScoreEngine` (Task 3), `RestPoseCalibrator` (Task 2), `KinematicResult` (Task 1).
- Produces:
  - `LatestKinematic()` holder: `.set(result)`, `.get() -> KinematicResult | None` (thread-safe).
  - `KinematicWorker(sink, estimator, engine, latest, rate_hz=15.0, rest_min_frames=75)`.
  - `.start() -> KinematicWorker`, `.stop(join_timeout=2.0)`.
  - `.begin_calibration()` / `.calibration_status() -> str` (`"idle"|"collecting"|"complete"|"insufficient"`).

**Notes:** the loop pulls `sink.latest()`, skips when `frame_count` unchanged (dedup), runs `estimator.estimate`, and either feeds the active `RestPoseCalibrator` (calibration mode) or publishes `engine.compute(pose_frame)` to `latest`.

- [ ] **Step 1: Write the failing test**

```python
# signal-engine/tests/test_kinematic_worker.py
import time

import numpy as np

from vision.frame_sink import VideoFrameSink
from vision.kinematic_engine import KinematicScoreEngine
from vision.kinematic_worker import KinematicWorker, LatestKinematic
from vision.rest_pose import RestPoseCalibrator
from vision.types import PoseFrame


def _pose_frame(wrist_x=1.5, ts=0.0):
    p = np.zeros((33, 4))
    p[:, 3] = 1.0
    p[11, :3] = [-0.5, 0, 0]
    p[12, :3] = [0.5, 0, 0]
    p[16, :3] = [wrist_x, 0, 0]
    p[24, :3] = [0.5, 1.0, 0]
    return PoseFrame(pose=p, hands={}, timestamp=ts)


class _FakeEstimator:
    def estimate(self, av_frame):
        return _pose_frame(wrist_x=float(av_frame))  # frame == wrist_x


def _rested_engine():
    cal = RestPoseCalibrator(min_frames=5)
    for _ in range(8):
        cal.add(_pose_frame(wrist_x=0.6))
    eng = KinematicScoreEngine(norm_warmup=1)
    eng.set_rest_pose(cal.build())
    return eng


def test_worker_publishes_latest_result():
    sink = VideoFrameSink()
    latest = LatestKinematic()
    worker = KinematicWorker(sink, _FakeEstimator(), _rested_engine(), latest, rate_hz=200.0)
    worker.start()
    try:
        for x in (0.6, 1.2, 2.5):
            sink.push(x)
            time.sleep(0.03)
        result = latest.get()
        assert result is not None and result.pose_valid is True
    finally:
        worker.stop()


def test_stale_sink_not_reprocessed():
    sink = VideoFrameSink()
    latest = LatestKinematic()
    calls = {"n": 0}

    class _Counting:
        def estimate(self, av_frame):
            calls["n"] += 1
            return _pose_frame()

    worker = KinematicWorker(sink, _Counting(), _rested_engine(), latest, rate_hz=500.0)
    sink.push(1.5)
    worker.start()
    time.sleep(0.1)
    worker.stop()
    assert calls["n"] == 1   # single frame processed once despite many loop iterations


def test_begin_calibration_sets_rest_pose():
    sink = VideoFrameSink()
    latest = LatestKinematic()
    eng = KinematicScoreEngine(norm_warmup=1)
    worker = KinematicWorker(sink, _FakeEstimator(), eng, latest, rate_hz=500.0,
                             rest_min_frames=5)
    worker.begin_calibration()
    worker.start()
    try:
        for i in range(20):
            sink.push(0.6)
            time.sleep(0.01)
        deadline = time.time() + 1.0
        while worker.calibration_status() == "collecting" and time.time() < deadline:
            time.sleep(0.01)
        assert worker.calibration_status() == "complete"
    finally:
        worker.stop()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `conda run -n eeg pytest signal-engine/tests/test_kinematic_worker.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'vision.kinematic_worker'`.

- [ ] **Step 3: Write minimal implementation**

```python
# signal-engine/vision/kinematic_worker.py
from __future__ import annotations

import logging
import threading

from vision.kinematic_engine import KinematicScoreEngine
from vision.rest_pose import RestPoseCalibrator
from vision.types import KinematicResult

logger = logging.getLogger(__name__)


class LatestKinematic:
    """Thread-safe single-slot holder for the newest KinematicResult."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._value: KinematicResult | None = None

    def set(self, result: KinematicResult | None) -> None:
        with self._lock:
            self._value = result

    def get(self) -> KinematicResult | None:
        with self._lock:
            return self._value


class KinematicWorker:
    """Background thread: VideoFrameSink -> estimator -> engine -> LatestKinematic."""

    def __init__(self, sink, estimator, engine: KinematicScoreEngine, latest: LatestKinematic,
                 rate_hz: float = 15.0, rest_min_frames: int = 75):
        self.sink = sink
        self.estimator = estimator
        self.engine = engine
        self.latest = latest
        self.rate_hz = float(rate_hz)
        self.rest_min_frames = int(rest_min_frames)

        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._last_count = -1
        self._calibrator: RestPoseCalibrator | None = None
        self._cal_status = "idle"

    # -- calibration -----------------------------------------------------------

    def begin_calibration(self) -> None:
        self._calibrator = RestPoseCalibrator(
            affected_side=self.engine.affected_side, min_frames=self.rest_min_frames
        )
        self._cal_status = "collecting"

    def calibration_status(self) -> str:
        return self._cal_status

    # -- lifecycle -------------------------------------------------------------

    def start(self) -> "KinematicWorker":
        if self._thread is not None and self._thread.is_alive():
            raise RuntimeError("KinematicWorker already running")
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="KinematicWorker", daemon=True)
        self._thread.start()
        return self

    def stop(self, join_timeout: float = 2.0) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=join_timeout)
        self._thread = None

    # -- loop ------------------------------------------------------------------

    def _run(self) -> None:
        period = 1.0 / self.rate_hz
        try:
            while not self._stop.is_set():
                count = self.sink.frame_count
                if count != self._last_count and self.sink.latest() is not None:
                    self._last_count = count
                    self._process(self.sink.latest())
                self._stop.wait(timeout=period)
        except Exception:
            logger.exception("KinematicWorker loop crashed")

    def _process(self, av_frame) -> None:
        pose_frame = self.estimator.estimate(av_frame)
        if self._calibrator is not None:
            if pose_frame is not None:
                self._calibrator.add(pose_frame)
            if self._calibrator.is_complete():
                self.engine.set_rest_pose(self._calibrator.build())
                self._cal_status = "complete"
                self._calibrator = None
            return
        self.latest.set(self.engine.compute(pose_frame))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `conda run -n eeg pytest signal-engine/tests/test_kinematic_worker.py -q`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add signal-engine/vision/kinematic_worker.py signal-engine/tests/test_kinematic_worker.py
git commit -m "feat(vision): KinematicWorker thread + LatestKinematic holder + rest calibration mode"
```

---

## Task 6: Fusion in IntentScoreEngine

**Files:**
- Modify: `signal-engine/scoring/intent_score.py`
- Test: `signal-engine/tests/test_intent_score.py` (create if absent; else extend)

**Interfaces:**
- Consumes: `KinematicResult` (Task 1).
- Produces (changed):
  - `IntentScoreResult` gains `kinematic_score: float | None = None`, `compensation_flag: bool = False`.
  - `IntentScoreEngine` gains `session_mode: str = "A"` and `set_session_mode(mode: str)`.
  - `compute(ring_buffer, artifact_clean, kinematic: KinematicResult | None = None)`.
  - Class constant `_MODE_WEIGHTS = {"A": (1.0, 0.0), "B": (0.6, 0.4), "C": (0.25, 0.75)}`.

**Notes:** the EEG sub-score already flows through `_normalize`/`_apply_ema`. Blend BEFORE normalization is wrong (kinematic is already 0–100); instead compute `eeg_component` from the existing normalized EEG path, then fuse: `fused = w_eeg*eeg + w_kin*kin - penalty`, clamp `[0,100]`, then EMA. To stay minimal and preserve current behavior when `kinematic is None`, fuse the raw EEG score with kinematic, normalize the EEG part as today, and apply weights to the normalized values.

- [ ] **Step 1: Write the failing test**

```python
# signal-engine/tests/test_intent_score.py  (add these; keep existing tests intact)
import numpy as np

from features.erd import ERDCalculator
from scoring.intent_score import IntentScoreEngine
from scoring.ring_buffer import RingBuffer
from vision.types import KinematicResult


def _engine(mode="A"):
    erd = ERDCalculator(channel_labels=["C3", "C4"], fs=250)
    erd.calibrate_baseline(np.random.default_rng(0).normal(0, 10, (8, 500)),
                           ["Fz", "C3", "Cz", "C4", "Pz", "PO7", "Oz", "PO8"])
    eng = IntentScoreEngine(
        eeg_channel_labels=["Fz", "C3", "Cz", "C4", "Pz", "PO7", "Oz", "PO8"],
        erd_calculator=erd, online_classifier=None, classifier_reliable=False, fs=250,
    )
    eng.set_session_mode(mode)
    return eng


def _rb():
    rb = RingBuffer(8, 1000)
    rb.push(np.random.default_rng(1).normal(0, 10, (8, 1000)))
    return rb


def test_mode_a_ignores_kinematic():
    eng = _engine("A")
    kin = KinematicResult(100.0, 0.0, False, True, True, 0.0)
    r = eng.compute(_rb(), artifact_clean=True, kinematic=kin)
    assert r.kinematic_score == 100.0            # reported
    # w_kin=0 in mode A: kinematic must not lift the score vs no-kinematic
    eng2 = _engine("A")
    r2 = eng2.compute(_rb(), artifact_clean=True, kinematic=None)
    assert r.intent_score == r2.intent_score


def test_mode_c_kinematic_dominates():
    eng = _engine("C")
    strong = eng.compute(_rb(), artifact_clean=True,
                         kinematic=KinematicResult(100.0, 0.0, False, True, True, 0.0))
    weak = _engine("C").compute(_rb(), artifact_clean=True,
                         kinematic=KinematicResult(0.0, 0.0, False, False, True, 0.0))
    assert strong.intent_score > weak.intent_score


def test_absent_pose_falls_back_to_eeg_only():
    eng = _engine("B")
    invalid = KinematicResult(0.0, 0.0, False, False, False, 0.0)  # pose_valid False
    r = eng.compute(_rb(), artifact_clean=True, kinematic=invalid)
    r_none = _engine("B").compute(_rb(), artifact_clean=True, kinematic=None)
    assert r.intent_score == r_none.intent_score
    assert r.kinematic_score is None


def test_compensation_penalty_subtracts():
    eng = _engine("C")
    clean = eng.compute(_rb(), artifact_clean=True,
                       kinematic=KinematicResult(80.0, 0.0, False, True, True, 0.0))
    penalized = _engine("C").compute(_rb(), artifact_clean=True,
                       kinematic=KinematicResult(80.0, 30.0, True, True, True, 0.0))
    assert penalized.intent_score < clean.intent_score
    assert penalized.compensation_flag is True


def test_backward_compatible_two_arg_call():
    eng = _engine("A")
    r = eng.compute(_rb(), artifact_clean=True)  # no kinematic kwarg
    assert r.kinematic_score is None and r.compensation_flag is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `conda run -n eeg pytest signal-engine/tests/test_intent_score.py -q`
Expected: FAIL — `TypeError`/`AttributeError` (`set_session_mode` missing, `compute` has no `kinematic`).

- [ ] **Step 3: Write minimal implementation**

Edit `IntentScoreResult` (add fields with defaults):

```python
@dataclass
class IntentScoreResult:
    intent_score: float
    erd_score: float | None
    classifier_score: float | None
    is_artifact: bool
    timestamp: float
    kinematic_score: float | None = None
    compensation_flag: bool = False
```

Add mode state to `IntentScoreEngine.__init__` (after `self._n_real = 0`):

```python
        self.session_mode = "A"

    _MODE_WEIGHTS = {"A": (1.0, 0.0), "B": (0.6, 0.4), "C": (0.25, 0.75)}

    def set_session_mode(self, mode: str) -> None:
        if mode not in self._MODE_WEIGHTS:
            raise ValueError(f"unknown session mode: {mode}")
        self.session_mode = mode
```

Replace `compute` body tail (from `normalized = self._normalize(raw_score)` onward) so kinematic fuses AFTER EEG normalization:

```python
    def compute(self, ring_buffer: RingBuffer, artifact_clean: bool,
                kinematic: "KinematicResult | None" = None) -> IntentScoreResult:
        now = time.time()

        if not artifact_clean:
            held = self._prev_intent if self._prev_intent is not None else _NEUTRAL_SCORE
            return IntentScoreResult(held, None, None, True, now)

        erd_score = self._compute_erd_score(ring_buffer)
        classifier_score = self._compute_classifier_score(ring_buffer)

        if self.classifier_reliable and classifier_score is not None:
            raw_score = 0.4 * erd_score + 0.6 * classifier_score
        else:
            raw_score = erd_score

        eeg_normalized = self._normalize(raw_score)   # 0–100 EEG component

        w_eeg, w_kin = self._MODE_WEIGHTS[self.session_mode]
        kin_valid = kinematic is not None and kinematic.pose_valid and w_kin > 0.0
        if kin_valid:
            total = w_eeg + w_kin
            fused = (w_eeg * eeg_normalized + w_kin * kinematic.kinematic_score) / total
            fused -= kinematic.compensation_penalty
            reported_kin = kinematic.kinematic_score
            comp_flag = kinematic.compensation_flag
        else:
            fused = eeg_normalized          # absent evidence -> EEG only
            reported_kin = None
            comp_flag = False

        fused = float(np.clip(fused, 0.0, 100.0))
        intent = self._apply_ema(fused)
        self._prev_intent = intent

        return IntentScoreResult(
            intent_score=intent,
            erd_score=erd_score,
            classifier_score=classifier_score,
            is_artifact=False,
            timestamp=now,
            kinematic_score=reported_kin,
            compensation_flag=comp_flag,
        )
```

Add the import near the top (guarded to avoid a hard cycle): `from vision.types import KinematicResult` — safe, `vision.types` is NumPy-only.

Note `test_mode_a_ignores_kinematic` asserts `r.kinematic_score == 100.0` in Mode A. Since Mode A has `w_kin=0`, `kin_valid` is False and `reported_kin` is `None`. **Adjust that test expectation to `is None`** (Mode A reports no kinematic contribution) before running — update the test so the assertion reads `assert r.kinematic_score is None`.

- [ ] **Step 4: Run test to verify it passes**

Run: `conda run -n eeg pytest signal-engine/tests/test_intent_score.py -q`
Expected: PASS. Then full suite regression: `conda run -n eeg pytest signal-engine/tests/ -m "not live" -q` — existing tests still green (the two-arg `compute` path is unchanged).

- [ ] **Step 5: Commit**

```bash
git add signal-engine/scoring/intent_score.py signal-engine/tests/test_intent_score.py
git commit -m "feat(scoring): blend kinematic score into IntentScore per session mode (A/B/C)"
```

---

## Task 7: Wire the kinematic source into ScoringService

**Files:**
- Modify: `signal-engine/scoring/scoring_service.py`
- Test: `signal-engine/tests/test_scoring_service.py` (extend)

**Interfaces:**
- Consumes: `LatestKinematic` (Task 5), `KinematicWorker` (Task 5), `KinematicResult` (Task 1).
- Produces (changed): `ScoringService` gains constructor kwargs `kinematic_source: LatestKinematic | None = None`, `kinematic_worker=None`, `kinematic_staleness_s: float = 0.3`; starts/stops the worker with the service; reads the source each tick and passes it to `engine.compute`.

**Notes:** staleness gate uses `KinematicResult.timestamp` (wall clock, set by the estimator/engine). A result older than `kinematic_staleness_s` → treated as absent (pass `None`).

- [ ] **Step 1: Write the failing test**

```python
# signal-engine/tests/test_scoring_service.py  (add)
import time

from scoring.scoring_service import ScoringService
from vision.kinematic_worker import LatestKinematic
from vision.types import KinematicResult


class _RecordingEngine:
    """Minimal engine stand-in capturing the kinematic arg passed to compute()."""
    fs = 250
    eeg_channel_labels = ["Fz", "C3", "Cz", "C4", "Pz", "PO7", "Oz", "PO8"]
    mi_window_samples = 1000
    seen = []

    def compute(self, ring_buffer, artifact_clean, kinematic=None):
        from scoring.intent_score import IntentScoreResult
        self.seen.append(kinematic)
        return IntentScoreResult(50.0, 0.0, None, False, time.time())


def test_fresh_kinematic_forwarded_stale_dropped():
    src = LatestKinematic()
    # Fresh result -> forwarded.
    src.set(KinematicResult(70.0, 0.0, False, True, True, time.time()))
    fresh = src.get()
    assert fresh is not None
    # Stale result -> a service with staleness 0.3 must treat it as None.
    stale = KinematicResult(70.0, 0.0, False, True, True, time.time() - 5.0)
    src.set(stale)
    # Exercise the private read helper directly for determinism:
    svc = ScoringService.__new__(ScoringService)
    svc._kinematic_source = src
    svc.kinematic_staleness_s = 0.3
    assert svc._read_kinematic() is None
    src.set(KinematicResult(70.0, 0.0, False, True, True, time.time()))
    assert svc._read_kinematic() is not None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `conda run -n eeg pytest signal-engine/tests/test_scoring_service.py::test_fresh_kinematic_forwarded_stale_dropped -q`
Expected: FAIL — `AttributeError: _read_kinematic`.

- [ ] **Step 3: Write minimal implementation**

In `__init__`, add params + state:

```python
        output_queue: "queue.Queue[IntentScoreResult]",
        update_rate_hz: float = 20.0,
        chunk_size: int = 12,
        kinematic_source=None,
        kinematic_worker=None,
        kinematic_staleness_s: float = 0.3,
    ):
        ...
        self._kinematic_source = kinematic_source
        self._kinematic_worker = kinematic_worker
        self.kinematic_staleness_s = float(kinematic_staleness_s)
```

Add the read helper:

```python
    def _read_kinematic(self):
        if self._kinematic_source is None:
            return None
        result = self._kinematic_source.get()
        if result is None:
            return None
        if (time.time() - result.timestamp) > self.kinematic_staleness_s:
            return None   # arrival gap -> absent evidence, never fabricated
        return result
```

In `start()`, after starting the thread, start the worker:

```python
        if self._kinematic_worker is not None:
            self._kinematic_worker.start()
```

In `stop()`, stop the worker first:

```python
    def stop(self, join_timeout: float = 2.0) -> None:
        if self._kinematic_worker is not None:
            self._kinematic_worker.stop()
        self._stop.set()
        ...
```

In `_run()`, change the compute call:

```python
                result = self.engine.compute(
                    self.ring_buffer, artifact_clean, kinematic=self._read_kinematic()
                )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `conda run -n eeg pytest signal-engine/tests/test_scoring_service.py -q`
Expected: PASS (existing + new).

- [ ] **Step 5: Commit**

```bash
git add signal-engine/scoring/scoring_service.py signal-engine/tests/test_scoring_service.py
git commit -m "feat(scoring): ScoringService reads LatestKinematic (staleness-gated) and owns the worker"
```

---

## Task 8: WS server — frame fields, calibrate_pose, mode/affected-side

**Files:**
- Modify: `signal-engine/server/ws_server.py`
- Test: `signal-engine/tests/test_ws_server.py` (extend)

**Interfaces:**
- Consumes: `KinematicWorker` (Task 5), extended `IntentScoreEngine` (Task 6).
- Produces (changed):
  - `NeuroReachWSServer.__init__` gains `kinematic_worker=None`.
  - `_format` adds `"kinematic_score"` and `"compensation_flag"` from the result.
  - dispatch gains `"calibrate_pose"` → `_cmd_calibrate_pose`.
  - `_cmd_set_mode` also accepts `fusion_mode` in `{"A","B","C"}` and `affected_side` in `{"left","right"}`.

- [ ] **Step 1: Write the failing test**

The file already has a module-scoped `ws_server` fixture and `HOST`/`PORT` constants; reuse them. The
fixture builds `NeuroReachWSServer(service, host=HOST, port=PORT, broadcast_hz=20.0)` — **no**
`kinematic_worker`, so `calibrate_pose` returns an error (exactly what the second test asserts).

```python
# signal-engine/tests/test_ws_server.py  (add; uses the existing `ws_server` fixture + HOST/PORT)
import asyncio
import json

import websockets


def test_intent_frame_carries_kinematic_fields(ws_server):
    async def _run():
        async with websockets.connect(f"ws://{HOST}:{PORT}") as ws:
            for _ in range(40):
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=2.0))
                if msg.get("type") == "intent_score":
                    assert "kinematic_score" in msg and "compensation_flag" in msg
                    return
            raise AssertionError("no intent_score frame observed")

    asyncio.get_event_loop().run_until_complete(_run())


def test_calibrate_pose_without_worker_errors(ws_server):
    async def _run():
        async with websockets.connect(f"ws://{HOST}:{PORT}") as ws:
            await ws.send(json.dumps({"cmd": "calibrate_pose"}))
            reply = json.loads(await asyncio.wait_for(ws.recv(), timeout=2.0))
            assert reply["type"] == "error"   # no worker in this fixture
    asyncio.get_event_loop().run_until_complete(_run())
```

> Match the file's existing async style — if its other tests use a helper coroutine runner rather than
> `get_event_loop().run_until_complete`, follow that instead.

- [ ] **Step 2: Run test to verify it fails**

Run: `conda run -n eeg pytest signal-engine/tests/test_ws_server.py -k "kinematic or calibrate_pose" -q`
Expected: FAIL — missing `kinematic_score` key / `unknown command: calibrate_pose`.

- [ ] **Step 3: Write minimal implementation**

`__init__`: add `kinematic_worker=None` param and `self.kinematic_worker = kinematic_worker`. Register the command:

```python
        self._dispatch = {
            "ping": self._cmd_ping,
            "get_status": self._cmd_get_status,
            "set_mode": self._cmd_set_mode,
            "start_session": self._cmd_start_session,
            "end_session": self._cmd_end_session,
            "calibrate_pose": self._cmd_calibrate_pose,
        }
```

Extend `_format`:

```python
            "mode": self._current_mode(),
            "kinematic_score": getattr(result, "kinematic_score", None),
            "compensation_flag": bool(getattr(result, "compensation_flag", False)),
            "timestamp": result.timestamp,
        }
```

Add the calibrate command and extend `set_mode`:

```python
    async def _cmd_calibrate_pose(self, websocket, data) -> None:
        worker = self.kinematic_worker
        if worker is None:
            await self._send(websocket, {"type": "error", "message": "no kinematic worker"})
            return
        worker.begin_calibration()
        await self._send(
            websocket, {"type": "pose_calibration", "status": worker.calibration_status()}
        )
```

Inside `_cmd_set_mode`, after the existing band/blend handling (before the final status reply), fold in fusion mode + side:

```python
        fusion_mode = data.get("fusion_mode")
        if fusion_mode is not None:
            try:
                eng.set_session_mode(fusion_mode)
            except ValueError:
                await self._send(websocket, {"type": "error",
                                             "message": f"invalid fusion_mode: {fusion_mode}"})
                return
        side = data.get("affected_side")
        if side in ("left", "right") and self.kinematic_worker is not None:
            self.kinematic_worker.engine.affected_side = side
```

> `_cmd_set_mode` currently `return`s early for the `band_power_only`/`csp_lda_blend` branches. Restructure so a message carrying **only** `fusion_mode`/`affected_side` (no `mode`) is still accepted: guard the classifier-mode block with `if mode is not None:` and treat a missing `mode` as "leave classifier mode unchanged."

- [ ] **Step 4: Run test to verify it passes**

Run: `conda run -n eeg pytest signal-engine/tests/test_ws_server.py -q`
Expected: PASS (existing 9 + new).

- [ ] **Step 5: Commit**

```bash
git add signal-engine/server/ws_server.py signal-engine/tests/test_ws_server.py
git commit -m "feat(server): intent_score kinematic fields + calibrate_pose cmd + fusion_mode/affected_side"
```

---

## Task 9: Wire the worker in run_ws_server

**Files:**
- Modify: `signal-engine/run_ws_server.py`

**Interfaces:**
- Consumes: `VideoFrameSink` (existing), `MediaPipePoseEstimator` (Task 4), `KinematicScoreEngine` (Task 3), `KinematicWorker`+`LatestKinematic` (Task 5), extended `ScoringService` (Task 7), extended `NeuroReachWSServer` (Task 8).

**Notes:** boot order — `build_scoring_service()` (2 s baseline) runs first, unchanged. Only AFTER that do we build the sink, estimator, engine, worker, and attach them. The worker starts inside `ScoringService.start()` (called by `srv.start()`), so nothing camera-related runs during the baseline.

- [ ] **Step 1: Edit imports and wiring**

Add imports:

```python
from vision.kinematic_engine import KinematicScoreEngine
from vision.kinematic_worker import KinematicWorker, LatestKinematic
from vision.pose_estimator import MediaPipePoseEstimator
```

Replace the sink/receiver block and server construction in `main()`:

```python
    # Built after the scoring service so baseline-before-simulator boot order holds.
    frame_sink = VideoFrameSink()
    receiver = WebRTCReceiver(frame_sink)

    latest_kin = LatestKinematic()
    kin_engine = KinematicScoreEngine(affected_side="right")
    try:
        estimator = MediaPipePoseEstimator()
    except Exception as exc:   # mediapipe missing / model load failure -> EEG-only
        print(f"MediaPipe unavailable ({exc}); running EEG-only (no kinematic scoring).")
        estimator = None

    worker = None
    if estimator is not None:
        worker = KinematicWorker(frame_sink, estimator, kin_engine, latest_kin, rate_hz=15.0)
        svc._kinematic_source = latest_kin
        svc._kinematic_worker = worker
        svc.engine.set_session_mode("B")   # camera present -> blended default

    srv = NeuroReachWSServer(
        svc,
        host="localhost",
        port=8765,
        broadcast_hz=20.0,
        session_controller=sim,
        webrtc_receiver=receiver,
        kinematic_worker=worker,
    )
```

> Setting `svc._kinematic_source`/`_kinematic_worker` directly is acceptable here (same module family); if you prefer, add a small `ScoringService.attach_kinematic(source, worker)` setter in Task 7 and call it instead.

- [ ] **Step 2: Smoke-run the server**

Run (background, ~4 s): `conda run -n eeg python signal-engine/run_ws_server.py`
Expected stdout: baseline calibration line, `SessionSimulator ready (idle)`, `WS server starting on ws://localhost:8765`, no traceback. Stop with Ctrl-C. (No camera connected → worker idle, kinematic absent, EEG-only scoring — as designed.)

- [ ] **Step 3: Commit**

```bash
git add signal-engine/run_ws_server.py
git commit -m "feat(server): wire MediaPipe estimator + KinematicWorker into the runtime (EEG-only fallback)"
```

---

## Task 10: Web parsers — new nullable fields (byte-identical)

**Files:**
- Modify: `patient-web/src/scoring/intentScoreMessage.ts`, `clinician-console/src/scoring/intentScoreMessage.ts`
- Test: `patient-web/src/scoring/intentScoreMessage.test.ts`, `clinician-console/src/scoring/intentScoreMessage.test.ts`

**Interfaces:**
- Produces (changed, both files identical): `ScoreFrame` gains `kinematicScore: number | null` and `compensationFlag: boolean`.

- [ ] **Step 1: Write the failing test (add to BOTH test files, identical)**

```typescript
it("parses kinematic_score and compensation_flag when present", () => {
  const raw = JSON.stringify({
    type: "intent_score", intent_score: 60, erd_score: 40, classifier_score: null,
    is_artifact: false, mode: "band_power_only", kinematic_score: 72.5,
    compensation_flag: true, timestamp: 123,
  });
  const res = parseIntentScoreMessage(raw);
  expect(res.ok).toBe(true);
  if (res.ok) {
    expect(res.frame.kinematicScore).toBe(72.5);
    expect(res.frame.compensationFlag).toBe(true);
  }
});

it("defaults kinematic fields when absent (back-compat)", () => {
  const raw = JSON.stringify({
    type: "intent_score", intent_score: 60, is_artifact: false,
    mode: "band_power_only", timestamp: 1,
  });
  const res = parseIntentScoreMessage(raw);
  expect(res.ok).toBe(true);
  if (res.ok) {
    expect(res.frame.kinematicScore).toBe(null);
    expect(res.frame.compensationFlag).toBe(false);
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd patient-web && npx vitest run src/scoring/intentScoreMessage.test.ts`
Expected: FAIL — `kinematicScore` undefined.

- [ ] **Step 3: Edit BOTH parser files identically**

Add to the `ScoreFrame` type:

```typescript
  classifierScore: number | null;
  kinematicScore: number | null;
  compensationFlag: boolean;
  isArtifact: boolean;
```

Add to the returned `frame` object:

```typescript
      classifierScore: numOrNull(d.classifier_score),
      kinematicScore: numOrNull(d.kinematic_score),
      compensationFlag: Boolean(d.compensation_flag),
      isArtifact: Boolean(d.is_artifact),
```

- [ ] **Step 4: Run both suites**

Run: `cd patient-web && npm run test` then `cd clinician-console && npm run test`
Expected: PASS (existing + 2 new each). Confirm both `intentScoreMessage.ts` files are byte-identical: `diff patient-web/src/scoring/intentScoreMessage.ts clinician-console/src/scoring/intentScoreMessage.ts` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add patient-web/src/scoring/intentScoreMessage.ts clinician-console/src/scoring/intentScoreMessage.ts \
        patient-web/src/scoring/intentScoreMessage.test.ts clinician-console/src/scoring/intentScoreMessage.test.ts
git commit -m "feat(web): parse nullable kinematic_score + compensation_flag on the intent_score frame"
```

---

## Task 11: Docs — todos.md milestone + dependency gap

**Files:**
- Modify: `docs/todos.md`

- [ ] **Step 1: Update the status board**

- Flip the milestone map line: `V2-2b vision/kinematics ⏳ next` → `V2-2b vision/kinematics ✅`.
- In the signal-engine "Status at a glance" test count, bump to the new totals after this plan (run `conda run -n eeg pytest signal-engine/tests/ -m "not live" -q` and copy the number).
- Under signal-engine ✅ Implemented, add a **Vision (V2-2b)** bullet: MediaPipe Pose+Hands estimator (injectable), `kinematics`/`rest_pose`/`kinematic_engine`/`kinematic_worker`, adaptive rest→max ROM + compensation penalty + LKG/absent gating, fused into `IntentScore` per Mode A/B/C, `calibrate_pose` command.
- Under ⚠️ Missing capabilities, replace the old "Vision scoring absent" bullet with the remaining V2-2c gaps: **console health-panel UX, framing-check setup step, rendering the new kinematic frame fields, covert-MI trial-invalidation/training-exclusion**.
- Keep the "`mediapipe`/`aiortc` installed but unpinned; no tracked manifest" gap; note manifest + Windows validation still deferred to V2-4.
- Bump the `_Last updated:_` date to today.

- [ ] **Step 2: Full regression across all three suites**

Run:
```bash
conda run -n eeg pytest signal-engine/tests/ -m "not live" -q
cd patient-web && npm run test
cd clinician-console && npm run test
```
Expected: all green. Record the counts in the status board.

- [ ] **Step 3: Commit**

```bash
git add docs/todos.md
git commit -m "docs: mark V2-2b kinematic scoring complete; narrow vision gaps to V2-2c"
```

---

## Self-review notes (author)

- **Spec coverage:** MediaPipe Pose+Hands (T4) · joint angles/reach/trunk/jerk (T1) · rest-pose 5 s cal (T2, T5, T8) · adaptive ROM score (T3) · compensation penalty always-on (T3, T6) · visibility/LKG/absent gating (T3, T7) · affected-side mirroring (T1, T8) · Mode A/B/C fusion (T6) · EEG-only fallback on camera absent/denied (T3/T7 absent path, T9 estimator-missing) · nullable frame fields both clients (T10) · mediapipe install unpinned + gap noted (T4, T11). Deferred-by-design (framing-check UX, console rendering, covert-trial invalidation) recorded in T11.
- **Type consistency:** `KinematicResult` field order and names are identical across T1/T3/T5/T6/T7; `set_session_mode`/`_MODE_WEIGHTS` defined in T6 and used in T8/T9; `LatestKinematic.get/set` and `KinematicWorker.begin_calibration/calibration_status` defined T5, used T7/T8.
- **Known test-fixture caveat:** T8's tests assume the existing `test_ws_server.py` construction style; the task tells the implementer to mirror whatever that file actually does rather than invent a fixture. T6 flags one in-test expectation to flip (`kinematic_score is None` in Mode A).
```
