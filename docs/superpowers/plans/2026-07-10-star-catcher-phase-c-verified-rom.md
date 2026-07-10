# Star Catcher — Phase C Verified-ROM Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Star Catcher from a single-target EEG-magnitude reach into a discrete-trial, per-joint **verified-ROM** game whose avatar arm mirrors the patient's real measured pose.

**Architecture:** signal-engine emits per-joint angles (shoulder flexion/abduction, elbow) on the `intent_score` frame plus a per-session `rom_targets` message from a new ROM max-capture calibration; the byte-identical shared parser gains a `joints` field; the LAN relay forwards `rom_targets`; patient-web rebuilds the scene around a `RomTrialModel` + two-bone FK arm; the console adds a ROM max-capture calibration step. EEG (`intentScore`) gates engagement/credit but does not move the arm.

**Tech Stack:** Python 3.10 (conda env `eeg`, NumPy, pytest), TypeScript + React + Vite + Vitest (patient-web, clinician-console), Electron (console main/LAN).

## Global Constraints

- Run all Python via `conda run -n eeg` from the **repo root** (conftest puts `signal-engine/` on `sys.path`).
- `intentScoreMessage.ts` is **byte-identical** across `patient-web/src/scoring/` and `clinician-console/src/scoring/` — every edit is applied to **both** files identically.
- The `intent_score` frame is one contract; changes are **additive only** (existing fields unchanged, absent new fields parse to `null`/`false`).
- `eeg_quality` / `camera_frame` / `vision_health` frames are clinician-only and must never reach the patient channel. The LAN `scoreRelay` allowlist is the enforcement point.
- Target angle fraction constant: **X = 0.70** (`target = rest + 0.70·(max − rest)`), module-level, not per-frame.
- Absent/low-visibility pose is **absent evidence** — never scored as 0 or as movement (existing LKG bridge pattern in `kinematic_engine.py`).
- No `Co-Authored-By` trailer in commits (user preference).
- Update `docs/todos.md` after the work (project rule); do **not** re-add Unity `game-client/`.

---

### Task 1: Per-joint angle geometry (`vision/kinematics.py`)

Pure NumPy functions for shoulder flexion, shoulder abduction, and an elbow-extension convenience wrapper. Fully unit-testable with synthetic poses.

**Files:**
- Modify: `signal-engine/vision/kinematics.py`
- Test: `signal-engine/tests/test_kinematics.py`

**Interfaces:**
- Consumes: existing `side_indices`, `joint_angle`, landmark index constants in this module.
- Produces:
  - `shoulder_flexion_angle(pose: np.ndarray, side: str) -> float` — degrees, elevation of upper-arm above the downward trunk axis in the sagittal (y–z) plane.
  - `shoulder_abduction_angle(pose: np.ndarray, side: str) -> float` — degrees, elevation in the frontal (x–y) plane.
  - `elbow_extension_angle(pose: np.ndarray, side: str) -> float` — degrees, = `joint_angle(shoulder, elbow, wrist)` (≈180° straight, ≈40° fully flexed).

- [ ] **Step 1: Write the failing tests**

```python
# append to signal-engine/tests/test_kinematics.py
import numpy as np
from vision import kinematics as kin


def _pose(**pts):
    """33x4 pose; pass landmark_index=(x,y,z) overrides, visibility=1."""
    p = np.zeros((33, 4), float)
    p[:, 3] = 1.0
    for idx, xyz in pts.items():
        p[idx, :3] = xyz
    return p


def test_shoulder_abduction_arm_straight_down_is_zero():
    # right side: shoulder above hip, wrist straight below shoulder -> 0 deg
    pose = _pose(**{kin.RIGHT_SHOULDER: (0, 0, 0), kin.RIGHT_HIP: (0, 1, 0),
                    kin.RIGHT_ELBOW: (0, -1, 0), kin.RIGHT_WRIST: (0, -2, 0)})
    assert kin.shoulder_abduction_angle(pose, "right") < 5.0


def test_shoulder_abduction_arm_out_sideways_is_ninety():
    # upper-arm horizontal (frontal plane) -> ~90 deg from the downward trunk axis
    pose = _pose(**{kin.RIGHT_SHOULDER: (0, 0, 0), kin.RIGHT_HIP: (0, 1, 0),
                    kin.RIGHT_ELBOW: (1, 0, 0), kin.RIGHT_WRIST: (2, 0, 0)})
    assert abs(kin.shoulder_abduction_angle(pose, "right") - 90.0) < 10.0


def test_shoulder_flexion_arm_forward_is_ninety():
    # upper-arm horizontal in the sagittal plane (forward = +z) -> ~90 deg
    pose = _pose(**{kin.RIGHT_SHOULDER: (0, 0, 0), kin.RIGHT_HIP: (0, 1, 0),
                    kin.RIGHT_ELBOW: (0, 0, 1), kin.RIGHT_WRIST: (0, 0, 2)})
    assert abs(kin.shoulder_flexion_angle(pose, "right") - 90.0) < 10.0


def test_elbow_extension_straight_arm_is_wide():
    pose = _pose(**{kin.RIGHT_SHOULDER: (0, 0, 0), kin.RIGHT_ELBOW: (0, -1, 0),
                    kin.RIGHT_WRIST: (0, -2, 0)})
    assert kin.elbow_extension_angle(pose, "right") > 170.0


def test_angles_degenerate_zero_length_return_zero():
    pose = _pose()  # all points at origin
    assert kin.shoulder_flexion_angle(pose, "right") == 0.0
    assert kin.shoulder_abduction_angle(pose, "right") == 0.0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `conda run -n eeg pytest signal-engine/tests/test_kinematics.py -k "abduction or flexion or elbow_extension or degenerate" -v`
Expected: FAIL with `AttributeError: module 'vision.kinematics' has no attribute 'shoulder_abduction_angle'`.

- [ ] **Step 3: Implement the angle functions**

```python
# append to signal-engine/vision/kinematics.py

def _elevation_angle(shoulder, elbow, hip, plane_axes) -> float:
    """Angle (deg) of the upper-arm above the downward trunk axis, projected
    onto the given 2 coordinate axes. 0 = arm hangs down along the trunk."""
    upper = (np.asarray(elbow, float) - np.asarray(shoulder, float))[list(plane_axes)]
    trunk_down = (np.asarray(hip, float) - np.asarray(shoulder, float))[list(plane_axes)]
    denom = np.linalg.norm(upper) * np.linalg.norm(trunk_down)
    if denom < 1e-9:
        return 0.0
    cos = float(np.clip(np.dot(upper, trunk_down) / denom, -1.0, 1.0))
    return float(np.degrees(np.arccos(cos)))


def shoulder_abduction_angle(pose: np.ndarray, side: str) -> float:
    """Frontal-plane (x, y) elevation of the upper-arm — reliable from a
    patient-facing monocular camera. 0 = arm down, ~90 = arm out sideways."""
    idx = side_indices(side)
    return _elevation_angle(
        pose[idx["shoulder"], :3], pose[idx["elbow"], :3], pose[idx["hip"], :3], (0, 1)
    )


def shoulder_flexion_angle(pose: np.ndarray, side: str) -> float:
    """Sagittal-plane (z, y) elevation of the upper-arm. Depends on the pose
    depth (z) estimate, so treat as APPROXIMATE (see design §3.1)."""
    idx = side_indices(side)
    return _elevation_angle(
        pose[idx["shoulder"], :3], pose[idx["elbow"], :3], pose[idx["hip"], :3], (2, 1)
    )


def elbow_extension_angle(pose: np.ndarray, side: str) -> float:
    """Interior elbow angle (deg): ~180 straight, ~40 fully flexed."""
    idx = side_indices(side)
    return joint_angle(pose[idx["shoulder"], :3], pose[idx["elbow"], :3], pose[idx["wrist"], :3])
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `conda run -n eeg pytest signal-engine/tests/test_kinematics.py -v`
Expected: PASS (all, including pre-existing).

- [ ] **Step 5: Commit**

```bash
git add signal-engine/vision/kinematics.py signal-engine/tests/test_kinematics.py
git commit -m "feat(vision): per-joint angle geometry (flexion/abduction/elbow)"
```

---

### Task 2: Attach joint angles to `KinematicResult` (`vision/types.py`, `vision/kinematic_engine.py`)

Every scoring tick carries the three measured angles; the LKG bridge carries them through a brief dropout.

**Files:**
- Modify: `signal-engine/vision/types.py`
- Modify: `signal-engine/vision/kinematic_engine.py`
- Test: `signal-engine/tests/test_kinematic_engine.py`

**Interfaces:**
- Consumes: `kinematics.shoulder_flexion_angle/shoulder_abduction_angle/elbow_extension_angle` (Task 1).
- Produces: `KinematicResult` gains fields `shoulder_flexion_deg: float = 0.0`, `shoulder_abduction_deg: float = 0.0`, `elbow_deg: float = 0.0` (defaults keep existing constructors/tests valid).

- [ ] **Step 1: Write the failing test**

```python
# append to signal-engine/tests/test_kinematic_engine.py
def test_compute_reports_joint_angles():
    from vision.kinematic_engine import KinematicScoreEngine
    from vision.types import PoseFrame, RestPose
    import numpy as np, vision.kinematics as kin

    eng = KinematicScoreEngine(affected_side="right")
    eng.set_rest_pose(RestPose(shoulder_mid=np.zeros(3), shoulder_width=1.0,
                               reach_extent=0.5, timestamp=0.0))
    pose = np.zeros((33, 4)); pose[:, 3] = 1.0
    pose[kin.RIGHT_SHOULDER, :3] = (0, 0, 0)
    pose[kin.RIGHT_HIP, :3] = (0, 1, 0)
    pose[kin.RIGHT_ELBOW, :3] = (1, 0, 0)
    pose[kin.RIGHT_WRIST, :3] = (2, 0, 0)
    res = eng.compute(PoseFrame(pose=pose, timestamp=1.0))
    assert abs(res.shoulder_abduction_deg - 90.0) < 10.0
    assert res.elbow_deg > 150.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `conda run -n eeg pytest signal-engine/tests/test_kinematic_engine.py::test_compute_reports_joint_angles -v`
Expected: FAIL with `AttributeError: 'KinematicResult' object has no attribute 'shoulder_abduction_deg'`.

- [ ] **Step 3: Extend the dataclass and populate it**

In `signal-engine/vision/types.py`, extend `KinematicResult`:

```python
@dataclass
class KinematicResult:
    kinematic_score: float
    compensation_penalty: float
    compensation_flag: bool
    movement_detected: bool
    pose_valid: bool
    timestamp: float
    shoulder_flexion_deg: float = 0.0
    shoulder_abduction_deg: float = 0.0
    elbow_deg: float = 0.0
```

In `signal-engine/vision/kinematic_engine.py`, `compute`, replace the `result = KinematicResult(...)` construction (currently `types.py`-style positional) with angle-populated fields:

```python
        angles = dict(
            shoulder_flexion_deg=kin.shoulder_flexion_angle(frame.pose, self.affected_side),
            shoulder_abduction_deg=kin.shoulder_abduction_angle(frame.pose, self.affected_side),
            elbow_deg=kin.elbow_extension_angle(frame.pose, self.affected_side),
        )
        result = KinematicResult(score, penalty, flag, moved, True, frame.timestamp, **angles)
        self._last_good = result
        return result
```

Also carry angles through the LKG bridge in `_invalid`:

```python
    def _invalid(self, ts: float) -> KinematicResult:
        if self._last_good is not None and (ts - self._last_good.timestamp) <= self.lkg_max_age_s:
            g = self._last_good
            return KinematicResult(g.kinematic_score, 0.0, False, False, True, ts,
                                   g.shoulder_flexion_deg, g.shoulder_abduction_deg, g.elbow_deg)
        return KinematicResult(0.0, 0.0, False, False, False, ts)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `conda run -n eeg pytest signal-engine/tests/test_kinematic_engine.py -v`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add signal-engine/vision/types.py signal-engine/vision/kinematic_engine.py signal-engine/tests/test_kinematic_engine.py
git commit -m "feat(vision): carry per-joint angles on KinematicResult + LKG bridge"
```

---

### Task 3: ROM max-capture calibration (`vision/rom_calibrator.py`, worker hooks)

A `RomCalibrator` tracks the max angle per joint over a capture window, then builds a targets dict using rest angles as the floor and X=0.70. The worker gains a ROM-calibration mode analogous to rest-pose calibration.

**Files:**
- Create: `signal-engine/vision/rom_calibrator.py`
- Modify: `signal-engine/vision/kinematic_worker.py`
- Test: `signal-engine/tests/test_rom_calibrator.py`

**Interfaces:**
- Consumes: `kinematics` angle functions (Task 1), `PoseFrame`.
- Produces:
  - `RomCalibrator(affected_side, min_frames=45, visibility_threshold=0.5, target_fraction=0.70)` with `.add(frame)`, `.is_complete() -> bool`, `.build(rest_angles: dict) -> dict`.
  - `build` returns `{"shoulder_flexion": {"rest_deg","max_deg","target_deg"}, "shoulder_abduction": {...}, "elbow_extension": {...}}`.
  - Worker: `begin_rom_calibration()`, `rom_calibration_status() -> str` (`"idle"|"collecting"|"complete"`), `rom_targets() -> dict | None`.

- [ ] **Step 1: Write the failing tests**

```python
# signal-engine/tests/test_rom_calibrator.py
import numpy as np
import vision.kinematics as kin
from vision.rom_calibrator import RomCalibrator
from vision.types import PoseFrame


def _frame(elbow_xyz, ts):
    p = np.zeros((33, 4)); p[:, 3] = 1.0
    p[kin.RIGHT_SHOULDER, :3] = (0, 0, 0)
    p[kin.RIGHT_HIP, :3] = (0, 1, 0)
    p[kin.RIGHT_ELBOW, :3] = elbow_xyz
    p[kin.RIGHT_WRIST, :3] = tuple(2 * c for c in elbow_xyz)
    return PoseFrame(pose=p, timestamp=ts)


def test_rom_calibrator_captures_max_and_targets():
    cal = RomCalibrator(affected_side="right", min_frames=3, target_fraction=0.5)
    cal.add(_frame((0, -1, 0), 0.0))   # arm down: abduction ~0
    cal.add(_frame((1, 0, 0), 0.1))    # arm out: abduction ~90 (the max)
    cal.add(_frame((0.5, -0.5, 0), 0.2))
    assert cal.is_complete()
    targets = cal.build(rest_angles={"shoulder_abduction": 10.0,
                                     "shoulder_flexion": 5.0, "elbow_extension": 90.0})
    ab = targets["shoulder_abduction"]
    assert ab["max_deg"] > 80.0
    assert ab["rest_deg"] == 10.0
    # target = rest + 0.5*(max-rest)
    assert abs(ab["target_deg"] - (10.0 + 0.5 * (ab["max_deg"] - 10.0))) < 1e-6


def test_rom_calibrator_incomplete_below_min_frames():
    cal = RomCalibrator(affected_side="right", min_frames=5)
    cal.add(_frame((1, 0, 0), 0.0))
    assert not cal.is_complete()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `conda run -n eeg pytest signal-engine/tests/test_rom_calibrator.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'vision.rom_calibrator'`.

- [ ] **Step 3: Implement `RomCalibrator`**

```python
# signal-engine/vision/rom_calibrator.py
"""Per-joint max-ROM calibration: track the largest angle seen per joint over a
short capture, then derive per-patient target angles (rest floor + fraction of
the achievable range). Mirrors RestPoseCalibrator's shape."""
from __future__ import annotations

from vision import kinematics as kin
from vision.types import PoseFrame

_JOINTS = ("shoulder_flexion", "shoulder_abduction", "elbow_extension")
_ANGLE_FN = {
    "shoulder_flexion": kin.shoulder_flexion_angle,
    "shoulder_abduction": kin.shoulder_abduction_angle,
    "elbow_extension": kin.elbow_extension_angle,
}


class RomCalibrator:
    def __init__(self, affected_side: str = "right", min_frames: int = 45,
                 visibility_threshold: float = 0.5, target_fraction: float = 0.70):
        self.affected_side = affected_side
        self.min_frames = int(min_frames)
        self.visibility_threshold = float(visibility_threshold)
        self.target_fraction = float(target_fraction)
        self._max = {j: 0.0 for j in _JOINTS}
        self._n = 0

    def add(self, frame: PoseFrame) -> None:
        idx = kin.side_indices(self.affected_side)
        needed = [kin.LEFT_SHOULDER, kin.RIGHT_SHOULDER, idx["wrist"], idx["hip"]]
        if any(frame.pose[i, 3] < self.visibility_threshold for i in needed):
            return
        for j in _JOINTS:
            self._max[j] = max(self._max[j], _ANGLE_FN[j](frame.pose, self.affected_side))
        self._n += 1

    def is_complete(self) -> bool:
        return self._n >= self.min_frames

    def build(self, rest_angles: dict) -> dict:
        out = {}
        for j in _JOINTS:
            rest = float(rest_angles.get(j, 0.0))
            mx = max(self._max[j], rest)
            out[j] = {
                "rest_deg": rest,
                "max_deg": mx,
                "target_deg": rest + self.target_fraction * (mx - rest),
            }
        return out
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `conda run -n eeg pytest signal-engine/tests/test_rom_calibrator.py -v`
Expected: PASS.

- [ ] **Step 5: Add worker ROM-calibration hooks**

In `signal-engine/vision/kinematic_worker.py`: import `RomCalibrator`; add state in `__init__` (`self._rom_calibrator = None`, `self._rom_status = "idle"`, `self._rom_targets = None`); add methods and wire into `_process`.

```python
# __init__ additions
        self._rom_calibrator = None
        self._rom_status = "idle"
        self._rom_targets = None

    def begin_rom_calibration(self) -> None:
        from vision.rom_calibrator import RomCalibrator
        self._rom_calibrator = RomCalibrator(affected_side=self.engine.affected_side)
        self._rom_status = "collecting"

    def rom_calibration_status(self) -> str:
        return self._rom_status

    def rom_targets(self):
        return self._rom_targets
```

Extend `_process` so ROM capture runs after rest-pose capture and does not block scoring — insert before the `self.latest.set(...)` line:

```python
        if self._rom_calibrator is not None and pose_frame is not None:
            self._rom_calibrator.add(pose_frame)
            if self._rom_calibrator.is_complete():
                rest_angles = self._rest_angles()
                self._rom_targets = self._rom_calibrator.build(rest_angles)
                self._rom_status = "complete"
                self._rom_calibrator = None
```

Add a helper to derive rest angles from the engine's stored rest pose (or zeros if absent):

```python
    def _rest_angles(self) -> dict:
        rest = getattr(self.engine, "_rest", None)
        pose = self.latest_pose()
        if pose is None:
            return {}
        from vision import kinematics as kin
        side = self.engine.affected_side
        return {
            "shoulder_flexion": kin.shoulder_flexion_angle(pose.pose, side),
            "shoulder_abduction": kin.shoulder_abduction_angle(pose.pose, side),
            "elbow_extension": kin.elbow_extension_angle(pose.pose, side),
        }
```

- [ ] **Step 6: Write + run a worker ROM-mode test**

```python
# append to signal-engine/tests/test_kinematic_worker.py
def test_worker_rom_calibration_completes_and_builds_targets():
    # Build a worker with a stub sink/estimator that yields abduction poses.
    import numpy as np, vision.kinematics as kin
    from vision.kinematic_engine import KinematicScoreEngine
    from vision.kinematic_worker import KinematicWorker, LatestKinematic
    from vision.types import PoseFrame

    def _pose():
        p = np.zeros((33, 4)); p[:, 3] = 1.0
        p[kin.RIGHT_SHOULDER, :3] = (0, 0, 0); p[kin.RIGHT_HIP, :3] = (0, 1, 0)
        p[kin.RIGHT_ELBOW, :3] = (1, 0, 0); p[kin.RIGHT_WRIST, :3] = (2, 0, 0)
        return PoseFrame(pose=p, timestamp=0.0)

    class Est:  # returns a fixed abduction pose
        def estimate(self, _): return _pose()
    class Sink:
        frame_count = 0
        def latest(self): return object()

    w = KinematicWorker(Sink(), Est(), KinematicScoreEngine("right"), LatestKinematic())
    w._rom_calibrator = __import__("vision.rom_calibrator", fromlist=["RomCalibrator"]).RomCalibrator("right", min_frames=2)
    w._rom_status = "collecting"
    for _ in range(3):
        w._process(object())
    assert w.rom_calibration_status() == "complete"
    assert w.rom_targets()["shoulder_abduction"]["max_deg"] > 80.0
```

Run: `conda run -n eeg pytest signal-engine/tests/test_kinematic_worker.py -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add signal-engine/vision/rom_calibrator.py signal-engine/vision/kinematic_worker.py signal-engine/tests/test_rom_calibrator.py signal-engine/tests/test_kinematic_worker.py
git commit -m "feat(vision): ROM max-capture calibrator + worker mode"
```

---

### Task 4: WS server — emit `joints`, `rom_targets`, handle `begin_rom_calibration`

The frame gains `joints`; a `rom_targets` message is broadcast on `start_session`; a new command triggers ROM capture.

**Files:**
- Modify: `signal-engine/server/ws_server.py`
- Test: `signal-engine/tests/test_ws_server.py`

**Interfaces:**
- Consumes: `IntentScoreResult` (unchanged; angles read from the worker's latest kinematic — see below), worker `begin_rom_calibration/rom_calibration_status/rom_targets` (Task 3).
- Produces: frame key `joints`; message `{"type":"rom_targets","targets":{...}}`; dispatch entry `"begin_rom_calibration"`.

**Note on angle source:** `IntentScoreResult` does not carry angles. `_format` reads the freshest `KinematicResult` from the worker's `LatestKinematic` holder (`self.kinematic_worker.latest.get()`), which now carries the angles (Task 2). When absent, `joints` is `null`.

- [ ] **Step 1: Write the failing tests**

```python
# append to signal-engine/tests/test_ws_server.py
def test_format_includes_joints_from_worker(monkeypatch):
    # A server whose worker.latest holds a KinematicResult with angles -> frame.joints populated.
    from vision.kinematic_worker import LatestKinematic
    from vision.types import KinematicResult
    server = _make_server_with_worker()   # existing helper in this file (see below)
    latest = LatestKinematic()
    latest.set(KinematicResult(60.0, 0.0, False, True, True, 1.0,
                               shoulder_flexion_deg=40.0, shoulder_abduction_deg=88.0, elbow_deg=150.0))
    server.kinematic_worker.latest = latest
    frame = server._format(server._last_result or _dummy_result())
    assert frame["joints"]["shoulder_abduction_deg"] == 88.0
    assert frame["joints"]["pose_valid"] is True
```

If `_make_server_with_worker`/`_dummy_result` helpers don't already exist in the test file, add minimal ones near the top:

```python
def _dummy_result():
    from scoring.intent_score import IntentScoreResult
    import time
    return IntentScoreResult(50.0, 10.0, None, False, time.time())
```

(Reuse the existing server-construction fixture in `test_ws_server.py` for `_make_server_with_worker`; if none has a worker, construct `NeuroReachWSServer(scoring_service=<existing stub>, kinematic_worker=<stub with .latest>)`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `conda run -n eeg pytest signal-engine/tests/test_ws_server.py::test_format_includes_joints_from_worker -v`
Expected: FAIL with `KeyError: 'joints'`.

- [ ] **Step 3: Emit `joints` in `_format`**

In `signal-engine/server/ws_server.py`, add a helper and a key in `_format`:

```python
    def _joints_payload(self) -> dict | None:
        worker = self.kinematic_worker
        if worker is None:
            return None
        k = worker.latest.get()
        if k is None:
            return None
        return {
            "shoulder_flexion_deg": float(k.shoulder_flexion_deg),
            "shoulder_abduction_deg": float(k.shoulder_abduction_deg),
            "elbow_deg": float(k.elbow_deg),
            "pose_valid": bool(k.pose_valid),
        }
```

In `_format`'s returned dict, add `"joints": self._joints_payload(),` before `"timestamp"`.

- [ ] **Step 4: Add `rom_targets` broadcast on start_session + the command**

Add dispatch entry in `__init__._dispatch`: `"begin_rom_calibration": self._cmd_begin_rom_calibration,`.

```python
    async def _cmd_begin_rom_calibration(self, websocket, data) -> None:
        worker = self.kinematic_worker
        if worker is None:
            await self._send(websocket, {"type": "error", "message": "no kinematic worker"})
            return
        worker.begin_rom_calibration()
        await self._send(websocket, {"type": "rom_calibration", "status": worker.rom_calibration_status()})
```

In `_session_command`, after `self._session_active = arm`, broadcast targets when arming:

```python
        if arm and self.kinematic_worker is not None:
            targets = self.kinematic_worker.rom_targets()
            if targets is not None:
                await self._broadcast(json.dumps({"type": "rom_targets", "targets": targets}))
```

- [ ] **Step 5: Write + run a test for the command + targets broadcast**

```python
# append to signal-engine/tests/test_ws_server.py
def test_begin_rom_calibration_command_replies_status():
    server = _make_server_with_worker()
    sent = []
    class WS:
        async def send(self, s): sent.append(s)
    import asyncio
    asyncio.get_event_loop().run_until_complete(
        server._cmd_begin_rom_calibration(WS(), {"cmd": "begin_rom_calibration"})
    )
    assert any("rom_calibration" in s for s in sent)
```

Run: `conda run -n eeg pytest signal-engine/tests/test_ws_server.py -k "rom or joints" -v`
Expected: PASS.

- [ ] **Step 6: Full signal-engine suite green**

Run: `conda run -n eeg pytest signal-engine/tests/`
Expected: all pass (existing counts + new tests), 0 failures.

- [ ] **Step 7: Commit**

```bash
git add signal-engine/server/ws_server.py signal-engine/tests/test_ws_server.py
git commit -m "feat(ws): emit joints + rom_targets, add begin_rom_calibration command"
```

---

### Task 5: Shared parser — `joints` field (both apps, byte-identical)

**Files:**
- Modify: `patient-web/src/scoring/intentScoreMessage.ts`
- Modify: `clinician-console/src/scoring/intentScoreMessage.ts`
- Test: `patient-web/src/scoring/intentScoreMessage.test.ts`, `clinician-console/src/scoring/intentScoreMessage.test.ts`

**Interfaces:**
- Produces: `ScoreFrame.joints: { shoulderFlexionDeg: number|null; shoulderAbductionDeg: number|null; elbowDeg: number|null; poseValid: boolean } | null`.

- [ ] **Step 1: Write the failing test (add identically to BOTH test files)**

```ts
it("parses joints when present and null when absent", () => {
  const withJoints = JSON.stringify({
    type: "intent_score", intent_score: 50,
    joints: { shoulder_flexion_deg: 40, shoulder_abduction_deg: 88, elbow_deg: 150, pose_valid: true },
  });
  const r = parseIntentScoreMessage(withJoints);
  expect(r.ok).toBe(true);
  if (r.ok) {
    expect(r.frame.joints?.shoulderAbductionDeg).toBe(88);
    expect(r.frame.joints?.poseValid).toBe(true);
  }
  const noJoints = parseIntentScoreMessage(JSON.stringify({ type: "intent_score", intent_score: 50 }));
  expect(noJoints.ok && noJoints.frame.joints).toBeNull();
});
```

- [ ] **Step 2: Run to verify failure (both packages)**

Run: `cd patient-web && npx vitest run src/scoring/intentScoreMessage.test.ts`
Expected: FAIL (`joints` undefined).

- [ ] **Step 3: Implement in BOTH `intentScoreMessage.ts` files (identical bytes)**

Add to `ScoreFrame`:

```ts
  joints: {
    shoulderFlexionDeg: number | null;
    shoulderAbductionDeg: number | null;
    elbowDeg: number | null;
    poseValid: boolean;
  } | null;
```

Add a helper and populate in the returned `frame`:

```ts
function parseJoints(v: unknown): ScoreFrame["joints"] {
  if (typeof v !== "object" || v === null) return null;
  const j = v as Record<string, unknown>;
  return {
    shoulderFlexionDeg: numOrNull(j.shoulder_flexion_deg),
    shoulderAbductionDeg: numOrNull(j.shoulder_abduction_deg),
    elbowDeg: numOrNull(j.elbow_deg),
    poseValid: Boolean(j.pose_valid),
  };
}
```

In the `frame` object literal add: `joints: parseJoints(d.joints),`.

- [ ] **Step 4: Run tests (both packages) to verify pass**

Run: `cd patient-web && npx vitest run src/scoring/intentScoreMessage.test.ts` then `cd ../clinician-console && npx vitest run src/scoring/intentScoreMessage.test.ts`
Expected: PASS both.

- [ ] **Step 5: Verify byte-identical**

Run: `diff patient-web/src/scoring/intentScoreMessage.ts clinician-console/src/scoring/intentScoreMessage.ts`
Expected: no output (identical).

- [ ] **Step 6: Commit**

```bash
git add patient-web/src/scoring/intentScoreMessage.ts clinician-console/src/scoring/intentScoreMessage.ts patient-web/src/scoring/intentScoreMessage.test.ts clinician-console/src/scoring/intentScoreMessage.test.ts
git commit -m "feat(parser): add joints field to ScoreFrame (both apps, byte-identical)"
```

---

### Task 6: LAN relay forwards `rom_targets`; patient routes it

`scoreRelay` allowlists only `intent_score` — add `rom_targets`. Patient `lanClient`/`usePatientLink` route the new message to a targets callback.

**Files:**
- Modify: `clinician-console/src/main/lan/scoreRelay.ts`
- Modify: `patient-web/src/net/lanClient.ts`
- Modify: `patient-web/src/net/usePatientLink.ts`
- Test: `clinician-console/src/main/lan/scoreRelay.test.ts` (if present; else add), `patient-web/src/net/lanClient.test.ts`

**Interfaces:**
- Produces: `lanClient` calls `opts.onRomTargets(targets)` on a `rom_targets` message; `usePatientLink` exposes `romTargets` state.

- [ ] **Step 1: Write the failing relay test**

```ts
// clinician-console/src/main/lan/scoreRelay.test.ts (add case)
it("forwards rom_targets frames to the patient", () => {
  const sent: string[] = [];
  const sock: any = { onmessage: null, onclose: null, onopen: null, close() {} };
  const relay = createScoreRelay({
    sidecarWsUrl: "ws://x", createSocket: () => sock, send: (r) => sent.push(r),
  });
  relay.connect();
  sock.onmessage({ data: JSON.stringify({ type: "rom_targets", targets: {} }) });
  expect(sent.some((s) => s.includes("rom_targets"))).toBe(true);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd clinician-console && npx vitest run src/main/lan/scoreRelay.test.ts`
Expected: FAIL (rom_targets not forwarded).

- [ ] **Step 3: Add to the allowlist**

In `scoreRelay.ts` line ~34, change:

```ts
      if (parsed && (parsed.type === "intent_score" || parsed.type === "rom_targets")) opts.send(raw);
```

- [ ] **Step 4: Route on the patient side**

In `patient-web/src/net/lanClient.ts`, extend the options type with `onRomTargets?: (targets: unknown) => void;` and add a branch after the `intent_score` line:

```ts
      else if (msg.type === "rom_targets") opts.onRomTargets?.(msg.targets);
```

In `patient-web/src/net/usePatientLink.ts`, add `const [romTargets, setRomTargets] = useState<unknown>(null);`, pass `onRomTargets: setRomTargets` into the client options, and return `romTargets` from the hook.

- [ ] **Step 5: Run patient + console tests**

Run: `cd patient-web && npx vitest run src/net` then `cd ../clinician-console && npx vitest run src/main/lan/scoreRelay.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add clinician-console/src/main/lan/scoreRelay.ts clinician-console/src/main/lan/scoreRelay.test.ts patient-web/src/net/lanClient.ts patient-web/src/net/usePatientLink.ts
git commit -m "feat(lan): forward + route rom_targets to the patient game"
```

---

### Task 7: `RomTrialModel` — per-joint verified trial logic (patient-web)

Pure model: catalogue cycling, per-target achieve/collect gated on EEG engagement, per-trial log. Replaces `ReachModel` for this scene.

**Files:**
- Create: `patient-web/src/reach/RomTrialModel.ts`
- Test: `patient-web/src/reach/RomTrialModel.test.ts`

**Interfaces:**
- Consumes: `ScoreFrame` (Task 5) for `joints` + `intentScore`.
- Produces:
  - `type RomTarget = { joint: "shoulder_flexion" | "shoulder_abduction" | "elbow_extension"; label: string; cue: string; targetDeg: number };`
  - `class RomTrialModel` with:
    - `constructor(targets?: Partial<Record<RomTarget["joint"], number>>)` — target degrees per joint; missing → `DEFAULT_TARGETS`.
    - `update(frame: ScoreFrame | null, engaged: boolean, dt: number): void`
    - getters: `reach: number` (0..1 = achieved/target of current joint), `collected: number`, `justCollected: boolean`, `current: RomTarget`, `phase: "cue"|"reaching"|"rest"`, `lastTrial: {joint,targetDeg,achievedDeg,compensationFlag} | null`.
- Constants: `HOLD_S = 0.6`, `REST_S = 1.5`, `DEFAULT_TARGETS = { shoulder_flexion: 60, shoulder_abduction: 55, elbow_extension: 150 }`, catalogue order `["shoulder_flexion","shoulder_abduction","elbow_extension"]`.

- [ ] **Step 1: Write the failing tests**

```ts
// patient-web/src/reach/RomTrialModel.test.ts
import { describe, it, expect } from "vitest";
import { RomTrialModel } from "./RomTrialModel";
import type { ScoreFrame } from "../scoring/intentScoreMessage";

function frame(deg: Partial<{ flex: number; abd: number; elbow: number }>, intent = 80): ScoreFrame {
  return {
    intentScore: intent, erdScore: null, classifierScore: null, kinematicScore: 60,
    compensationFlag: false, isArtifact: false, mode: "C", timestamp: 0,
    joints: {
      shoulderFlexionDeg: deg.flex ?? 0, shoulderAbductionDeg: deg.abd ?? 0,
      elbowDeg: deg.elbow ?? 0, poseValid: true,
    },
  };
}

describe("RomTrialModel", () => {
  it("first target is shoulder_flexion with the default target", () => {
    const m = new RomTrialModel();
    expect(m.current.joint).toBe("shoulder_flexion");
    expect(m.current.targetDeg).toBe(60);
  });

  it("reach reflects achieved/target of the current joint", () => {
    const m = new RomTrialModel();
    m.update(frame({ flex: 30 }), true, 0.1); // 30/60 = 0.5
    expect(m.reach).toBeCloseTo(0.5, 1);
  });

  it("collects after holding at/above target while engaged, then advances", () => {
    const m = new RomTrialModel();
    for (let t = 0; t < 8; t++) m.update(frame({ flex: 70 }), true, 0.1); // >target, held > HOLD_S
    expect(m.collected).toBe(1);
    expect(m.lastTrial?.joint).toBe("shoulder_flexion");
    // after a collect it enters rest, then advances to the next catalogue joint
    for (let t = 0; t < 20; t++) m.update(frame({ flex: 0 }), false, 0.1);
    expect(m.current.joint).toBe("shoulder_abduction");
  });

  it("does NOT collect when not EEG-engaged even if angle is met", () => {
    const m = new RomTrialModel();
    for (let t = 0; t < 8; t++) m.update(frame({ flex: 70 }), false, 0.1);
    expect(m.collected).toBe(0);
  });

  it("uses provided per-patient targets over defaults", () => {
    const m = new RomTrialModel({ shoulder_flexion: 40 });
    expect(m.current.targetDeg).toBe(40);
  });

  it("absent pose (poseValid false) holds reach at 0, no collect", () => {
    const m = new RomTrialModel();
    const f = frame({ flex: 70 }); f.joints = { ...f.joints!, poseValid: false };
    for (let t = 0; t < 8; t++) m.update(f, true, 0.1);
    expect(m.collected).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd patient-web && npx vitest run src/reach/RomTrialModel.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `RomTrialModel`**

```ts
// patient-web/src/reach/RomTrialModel.ts
import type { ScoreFrame } from "../scoring/intentScoreMessage";

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export type JointId = "shoulder_flexion" | "shoulder_abduction" | "elbow_extension";
export type RomTarget = { joint: JointId; label: string; cue: string; targetDeg: number };

const CATALOGUE: { joint: JointId; label: string; cue: string }[] = [
  { joint: "shoulder_flexion", label: "Reach up high", cue: "Lift your arm up in front of you" },
  { joint: "shoulder_abduction", label: "Reach out wide", cue: "Lift your arm out to the side" },
  { joint: "elbow_extension", label: "Straighten your arm", cue: "Stretch your arm out straight" },
];

export const DEFAULT_TARGETS: Record<JointId, number> = {
  shoulder_flexion: 60,
  shoulder_abduction: 55,
  elbow_extension: 150,
};

type TrialLog = { joint: JointId; targetDeg: number; achievedDeg: number; compensationFlag: boolean };

export class RomTrialModel {
  static readonly HOLD_S = 0.6;
  static readonly REST_S = 1.5;

  private _targets: Record<JointId, number>;
  private _idx = 0;
  private _reach = 0;
  private _collected = 0;
  private _justCollected = false;
  private _holdTime = 0;
  private _restTime = 0;
  private _phase: "cue" | "reaching" | "rest" = "reaching";
  private _lastTrial: TrialLog | null = null;

  constructor(targets: Partial<Record<JointId, number>> = {}) {
    this._targets = { ...DEFAULT_TARGETS, ...targets };
  }

  private measured(frame: ScoreFrame): number | null {
    const j = frame.joints;
    if (!j || !j.poseValid) return null;
    switch (this.current.joint) {
      case "shoulder_flexion": return j.shoulderFlexionDeg;
      case "shoulder_abduction": return j.shoulderAbductionDeg;
      case "elbow_extension": return j.elbowDeg;
    }
  }

  get current(): RomTarget {
    const c = CATALOGUE[this._idx];
    return { ...c, targetDeg: this._targets[c.joint] };
  }
  get reach(): number { return this._reach; }
  get collected(): number { return this._collected; }
  get justCollected(): boolean { return this._justCollected; }
  get phase() { return this._phase; }
  get lastTrial() { return this._lastTrial; }

  update(frame: ScoreFrame | null, engaged: boolean, dtSeconds: number): void {
    this._justCollected = false;
    const dt = Math.max(0, dtSeconds);

    if (this._phase === "rest") {
      this._reach = 0;
      this._restTime += dt;
      if (this._restTime >= RomTrialModel.REST_S) {
        this._idx = (this._idx + 1) % CATALOGUE.length;
        this._restTime = 0;
        this._phase = "reaching";
      }
      return;
    }

    const deg = frame ? this.measured(frame) : null;
    const target = this.current.targetDeg;
    this._reach = deg === null || target <= 0 ? 0 : clamp01(deg / target);

    if (deg !== null && this._reach >= 1 && engaged) {
      this._holdTime += dt;
      if (this._holdTime >= RomTrialModel.HOLD_S) {
        this._collected += 1;
        this._justCollected = true;
        this._holdTime = 0;
        this._phase = "rest";
        this._lastTrial = {
          joint: this.current.joint, targetDeg: target, achievedDeg: deg,
          compensationFlag: Boolean(frame?.compensationFlag),
        };
      }
    } else {
      this._holdTime = 0;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd patient-web && npx vitest run src/reach/RomTrialModel.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add patient-web/src/reach/RomTrialModel.ts patient-web/src/reach/RomTrialModel.test.ts
git commit -m "feat(patient): RomTrialModel — per-joint verified trial logic"
```

---

### Task 8: Two-bone FK geometry helper (patient-web)

Pure function mapping `(shoulderElevationDeg, elbowDeg)` + anchor + segment lengths to elbow/wrist SVG points, so the avatar arm mirrors the measured pose.

**Files:**
- Create: `patient-web/src/reach/armKinematics.ts`
- Test: `patient-web/src/reach/armKinematics.test.ts`

**Interfaces:**
- Produces: `fkArm(opts: { shoulder: {x:number;y:number}; shoulderElevationDeg: number; elbowDeg: number; upperLen: number; foreLen: number; mirror: boolean }): { elbow: {x:number;y:number}; wrist: {x:number;y:number} }`.
  - `shoulderElevationDeg`: 0 = arm hangs straight down; 90 = arm horizontal. `mirror` flips X for the affected side.
  - `elbowDeg`: interior elbow angle (180 = straight).

- [ ] **Step 1: Write the failing tests**

```ts
// patient-web/src/reach/armKinematics.test.ts
import { describe, it, expect } from "vitest";
import { fkArm } from "./armKinematics";

const near = (a: number, b: number, eps = 0.5) => Math.abs(a - b) < eps;

describe("fkArm", () => {
  it("arm hanging straight down (elevation 0, elbow straight) drops in +Y", () => {
    const { elbow, wrist } = fkArm({
      shoulder: { x: 100, y: 100 }, shoulderElevationDeg: 0, elbowDeg: 180,
      upperLen: 50, foreLen: 50, mirror: false,
    });
    expect(near(elbow.x, 100)).toBe(true);
    expect(near(elbow.y, 150)).toBe(true);
    expect(near(wrist.y, 200)).toBe(true);
  });

  it("elevation 90 raises the upper arm to horizontal (+X, not mirrored)", () => {
    const { elbow } = fkArm({
      shoulder: { x: 100, y: 100 }, shoulderElevationDeg: 90, elbowDeg: 180,
      upperLen: 50, foreLen: 50, mirror: false,
    });
    expect(near(elbow.x, 150)).toBe(true);
    expect(near(elbow.y, 100)).toBe(true);
  });

  it("mirror flips the horizontal direction", () => {
    const { elbow } = fkArm({
      shoulder: { x: 100, y: 100 }, shoulderElevationDeg: 90, elbowDeg: 180,
      upperLen: 50, foreLen: 50, mirror: true,
    });
    expect(near(elbow.x, 50)).toBe(true);
  });

  it("a bent elbow (90) folds the forearm relative to the upper arm", () => {
    const { elbow, wrist } = fkArm({
      shoulder: { x: 100, y: 100 }, shoulderElevationDeg: 0, elbowDeg: 90,
      upperLen: 50, foreLen: 50, mirror: false,
    });
    // upper arm points down; a 90-deg elbow bends the forearm horizontally
    expect(near(Math.abs(wrist.x - elbow.x), 50)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd patient-web && npx vitest run src/reach/armKinematics.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `fkArm`**

```ts
// patient-web/src/reach/armKinematics.ts
type Pt = { x: number; y: number };

export function fkArm(opts: {
  shoulder: Pt;
  shoulderElevationDeg: number; // 0 = down, 90 = horizontal
  elbowDeg: number;             // interior angle, 180 = straight
  upperLen: number;
  foreLen: number;
  mirror: boolean;              // flip X for the affected side
}): { elbow: Pt; wrist: Pt } {
  const dir = opts.mirror ? -1 : 1;
  // Upper-arm direction: rotate the downward axis (+Y) up toward horizontal by elevation.
  const elev = (opts.shoulderElevationDeg * Math.PI) / 180;
  const ux = dir * Math.sin(elev);
  const uy = Math.cos(elev); // +Y is down in SVG
  const elbow = { x: opts.shoulder.x + ux * opts.upperLen, y: opts.shoulder.y + uy * opts.upperLen };

  // Forearm: bend from the upper-arm direction by (180 - elbowDeg).
  const bend = ((180 - opts.elbowDeg) * Math.PI) / 180 * dir;
  const ca = Math.cos(bend), sa = Math.sin(bend);
  const fx = ux * ca - uy * sa;
  const fy = ux * sa + uy * ca;
  const wrist = { x: elbow.x + fx * opts.foreLen, y: elbow.y + fy * opts.foreLen };
  return { elbow, wrist };
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd patient-web && npx vitest run src/reach/armKinematics.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add patient-web/src/reach/armKinematics.ts patient-web/src/reach/armKinematics.test.ts
git commit -m "feat(patient): two-bone FK arm geometry helper"
```

---

### Task 9: `StarCatchScene` — two-bone rig + trial loop + cues (patient-web)

Rewire the scene from `ReachModel` to `RomTrialModel`, render the FK arm from the measured joints, and drive the cue → reach → hold → collect → rest loop. Accept per-patient `romTargets`.

**Files:**
- Modify: `patient-web/src/scenes/StarCatchScene.tsx`
- Modify: `patient-web/src/scenes/StarCatchScene.test.tsx`
- Modify (wire prop): `patient-web/src/App.tsx` (pass `romTargets` from `usePatientLink` to the scene)

**Interfaces:**
- Consumes: `RomTrialModel` (Task 7), `fkArm` (Task 8), `ScoreStore.latest()` (frames now carry `joints`), `usePatientLink().romTargets` (Task 6).
- Produces: `StarCatchScene` gains an optional prop `romTargets?: Partial<Record<JointId, number>>` forwarded to `new RomTrialModel(romTargets)`.

- [ ] **Step 1: Write the failing component test**

```tsx
// add to patient-web/src/scenes/StarCatchScene.test.tsx
it("shows the current target cue and renders a two-bone arm", () => {
  const store = new ScoreStore();
  store.push(makeFrame({ intentScore: 80, joints: {
    shoulderFlexionDeg: 30, shoulderAbductionDeg: 0, elbowDeg: 0, poseValid: true } }));
  render(<StarCatchScene stats={new SessionStats()} engagementThreshold={60}
                         store={store} onEnd={() => {}} />);
  expect(screen.getByTestId("rom-cue")).toHaveTextContent(/reach up high/i);
  expect(screen.getByTestId("arm-upper")).toBeInTheDocument();
  expect(screen.getByTestId("arm-fore")).toBeInTheDocument();
});
```

(Use the file's existing `makeFrame` helper; extend it to accept a `joints` override if it doesn't already — a one-line spread.)

- [ ] **Step 2: Run to verify failure**

Run: `cd patient-web && npx vitest run src/scenes/StarCatchScene.test.tsx`
Expected: FAIL (`rom-cue`/`arm-upper` not found).

- [ ] **Step 3: Rewire the scene**

Key changes in `StarCatchScene.tsx`:
- Replace `import { ReachModel }` with `import { RomTrialModel, type JointId } from "../reach/RomTrialModel";` and `import { fkArm } from "../reach/armKinematics";`.
- Add prop `romTargets?: Partial<Record<JointId, number>>` to the component signature.
- `const model = useRef(new RomTrialModel(romTargets));`
- In the RAF `tick`, drive the model from the frame + engagement:

```tsx
      const latest = store.latest();
      const s = latest ? latest.intentScore : 0;
      const isEngaged = s >= engagementThreshold;
      model.current.update(latest, isEngaged, dt);
      stats.accumulate(dt, isEngaged);
      if (model.current.justCollected) { stats.incrementTrials(); celebrateUntil.current = ts + 900; }
      setReach(model.current.reach);
      setCollected(model.current.collected);
      setCue(model.current.current.label);
      setPhase(model.current.phase);
```

- Add state: `const [cue, setCue] = useState(model.current.current.label);` and `const [phase, setPhase] = useState(model.current.phase);`.
- Compute the arm from the current frame's measured joints via `fkArm`, mapping the current joint's measured degrees to `shoulderElevationDeg` (for flexion/abduction use the measured elevation directly; for elbow keep the shoulder at rest elevation and drive `elbowDeg`):

```tsx
  const j = store.latest()?.joints;
  const elevationDeg =
    model.current.current.joint === "shoulder_abduction" ? (j?.shoulderAbductionDeg ?? 0)
    : model.current.current.joint === "shoulder_flexion" ? (j?.shoulderFlexionDeg ?? 0)
    : 20; // elbow-extension trial: hold a modest shoulder elevation
  const elbowDeg = j?.elbowDeg ?? 180;
  const mirror = affectedSide === "left";
  const { elbow, wrist } = fkArm({
    shoulder, shoulderElevationDeg: elevationDeg, elbowDeg,
    upperLen: 150, foreLen: 140, mirror,
  });
```

- Replace the single `<line shoulder→hand>` with two segments + a joint dot + the hand star:

```tsx
  <line data-testid="arm-upper" x1={shoulder.x} y1={shoulder.y} x2={elbow.x} y2={elbow.y}
        stroke="#c98b6b" strokeWidth="22" strokeLinecap="round" />
  <line data-testid="arm-fore" x1={elbow.x} y1={elbow.y} x2={wrist.x} y2={wrist.y}
        stroke="#c98b6b" strokeWidth="20" strokeLinecap="round" />
  <circle cx={elbow.x} cy={elbow.y} r="12" fill="#b06a4c" />
  <circle cx={shoulder.x} cy={shoulder.y} r="16" fill="#b06a4c" />
  <path data-testid="reach-hand" data-reach={reach.toFixed(2)} d={STAR}
        transform={`translate(${wrist.x} ${wrist.y}) scale(22)`} fill="#f4c84a" stroke="#fff" strokeWidth="0.08" />
```

- Add the cue element in the banner and a rest hint:

```tsx
  <span className="rom-cue" data-testid="rom-cue" data-phase={phase}>{cue}</span>
```

- Remove the fixed-corner `goalEnd`/`nextStar`/goal-line elements that assumed a single target (they no longer apply); keep the "Reach power" meter (still `intentScore`).

In `App.tsx`, pass `romTargets={link.romTargets as any}` where `<StarCatchScene .../>` is rendered.

- [ ] **Step 4: Run tests to verify pass**

Run: `cd patient-web && npx vitest run src/scenes/StarCatchScene.test.tsx`
Expected: PASS. Also run `npx vitest run` to catch regressions from removed elements — update any now-stale assertions (e.g. `reach-goal`) that reference deleted fixed-target nodes.

- [ ] **Step 5: Commit**

```bash
git add patient-web/src/scenes/StarCatchScene.tsx patient-web/src/scenes/StarCatchScene.test.tsx patient-web/src/App.tsx
git commit -m "feat(patient): two-bone FK arm + ROM trial loop in StarCatchScene"
```

---

### Task 10: Console — ROM max-capture calibration step

Add a "Range of motion" step after rest-pose capture: fires `begin_rom_calibration`, reflects status, advances when `complete`. No editor, no charts.

**Files:**
- Modify: `clinician-console/src/renderer/` calibration flow (the component that owns rest-pose calibration — `SignalCheckStep` / `CalibrateStep`; locate the one issuing `calibrate_pose`).
- Test: the matching `*.test.tsx`.

**Interfaces:**
- Consumes: the console's sidecar command channel (same path used to send `calibrate_pose`), and the inbound `rom_calibration` / `pose_calibration` status messages.
- Produces: a `RomCaptureStep` UI (or inline sub-step) that sends `{cmd:"begin_rom_calibration"}` and shows `collecting → complete`.

- [ ] **Step 1: Locate the existing pose-calibration trigger**

Run: `cd clinician-console && grep -rn "calibrate_pose\|pose_calibration" src/renderer`
Expected: the component + message-handling site to mirror.

- [ ] **Step 2: Write the failing test**

```tsx
// e.g. clinician-console/src/renderer/RomCaptureStep.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { RomCaptureStep } from "./RomCaptureStep";

it("sends begin_rom_calibration and shows collecting", () => {
  const sent: any[] = [];
  render(<RomCaptureStep send={(m) => sent.push(m)} status="idle" onDone={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: /capture range of motion/i }));
  expect(sent).toContainEqual({ cmd: "begin_rom_calibration" });
});

it("calls onDone when status becomes complete", () => {
  const onDone = vi.fn();
  const { rerender } = render(<RomCaptureStep send={() => {}} status="collecting" onDone={onDone} />);
  rerender(<RomCaptureStep send={() => {}} status="complete" onDone={onDone} />);
  expect(onDone).toHaveBeenCalled();
});
```

- [ ] **Step 3: Run to verify failure**

Run: `cd clinician-console && npx vitest run src/renderer/RomCaptureStep.test.tsx`
Expected: FAIL (module missing).

- [ ] **Step 4: Implement `RomCaptureStep` and wire it into the calibration flow**

```tsx
// clinician-console/src/renderer/RomCaptureStep.tsx
import { useEffect } from "react";

export function RomCaptureStep({
  send, status, onDone,
}: { send: (m: { cmd: string }) => void; status: "idle" | "collecting" | "complete"; onDone: () => void }) {
  useEffect(() => { if (status === "complete") onDone(); }, [status, onDone]);
  return (
    <div className="rom-capture">
      <p>Ask the patient to reach as far as is comfortable in each direction.</p>
      <button type="button" onClick={() => send({ cmd: "begin_rom_calibration" })}
              disabled={status === "collecting"}>
        Capture range of motion
      </button>
      <span data-testid="rom-status">{status}</span>
    </div>
  );
}
```

Wire it into the calibration flow after the rest-pose step, mapping the inbound `rom_calibration` status message to the `status` prop (mirror how `pose_calibration` status is already threaded).

- [ ] **Step 5: Run tests to verify pass**

Run: `cd clinician-console && npx vitest run src/renderer/RomCaptureStep.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add clinician-console/src/renderer/RomCaptureStep.tsx clinician-console/src/renderer/RomCaptureStep.test.tsx <calibration-flow-file>
git commit -m "feat(console): ROM max-capture calibration step"
```

---

### Task 11: Full-suite verification + docs

**Files:**
- Modify: `docs/todos.md`

- [ ] **Step 1: Run every suite**

```bash
conda run -n eeg pytest signal-engine/tests/
cd patient-web && npm run test
cd ../clinician-console && npm run test
```
Expected: all green. Record the exact counts.

- [ ] **Step 2: Typecheck both TS packages**

```bash
cd patient-web && npx tsc --noEmit
cd ../clinician-console && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Byte-identical parser re-check**

Run: `diff patient-web/src/scoring/intentScoreMessage.ts clinician-console/src/scoring/intentScoreMessage.ts`
Expected: no output.

- [ ] **Step 4: Update `docs/todos.md`**

- Move Star Catcher from "Phase-A only" to "Phase C verified-ROM shipped" in the status table; update verified test counts (§6.4 rule — from the actual run in Step 1).
- Under deferred/gaps, record the **out-of-scope** items from the design §8: grasp/wrist target (needs `mediapipe.Hands`), protocol editor (§10.3), live per-trial ROM readout + ROM trend charts (§10.3), mode-dependent covert arm drive, adaptive staircase within the calibrated range.
- Reference `docs/reachcollect.md` and the design/plan docs; do not inline them.

- [ ] **Step 5: Commit**

```bash
git add docs/todos.md
git commit -m "docs: record Star Catcher Phase C verified-ROM; log deferred items"
```

---

## Self-Review

**Spec coverage:**
- §2 data contract → Tasks 2, 4 (`joints`), 4 (`rom_targets`), 5 (parser). ✓
- §3.1 angle geometry + flexion-approximation → Task 1 (documented in docstring). ✓
- §3.2 result carries angles → Task 2. ✓
- §3.3 ROM max-calibration → Task 3. ✓
- §3.4 WS emit + command → Task 4. ✓
- §4 shared parser → Task 5. ✓
- §5.1 RomTrialModel (achieve/collect/EEG-gate/advance/log/default fallback) → Task 7. ✓
- §5.2 two-bone FK arm → Tasks 8, 9. ✓
- §5.3 trial loop + cues → Task 9. ✓
- §6 console minimal max-capture → Task 10. ✓
- LAN relay forwarding (enforcement point) → Task 6. ✓
- §7 testing → each task is TDD; Task 11 full-suite gate. ✓
- §8 out-of-scope → Task 11 Step 4 logs to todos. ✓

**Placeholder scan:** angle bracket `<calibration-flow-file>` / `<existing stub>` in Tasks 4/10 are deliberate — the exact file is discovered in that task's first step (grep), because the console calibration flow file name must be confirmed against the current tree rather than guessed. No other placeholders.

**Type consistency:** `JointId` union identical in Tasks 7/9; `RomTarget.targetDeg` produced in Task 7 consumed in Task 9; `fkArm` signature identical Tasks 8/9; `joints` shape identical across Tasks 2 (Python), 5 (TS parser), 7/9 (consumers); `rom_targets` message shape identical Tasks 3 (build), 4 (broadcast), 6 (route). ✓
