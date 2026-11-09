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
        self._rest_wrist = None
        self._peak_wrist = {}

    def add(self, frame: PoseFrame) -> None:
        idx = kin.side_indices(self.affected_side)
        needed = [kin.LEFT_SHOULDER, kin.RIGHT_SHOULDER, idx["wrist"], idx["hip"]]
        if any(frame.pose[i, 3] < self.visibility_threshold for i in needed):
            return
        wrist = kin.wrist_offset(frame.pose, self.affected_side)
        if self._rest_wrist is None:
            self._rest_wrist = wrist
        for j in _JOINTS:
            angle = _ANGLE_FN[j](frame.pose, self.affected_side)
            if angle > self._max[j]:
                self._max[j] = angle
                self._peak_wrist[j] = wrist
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
            if j in self._peak_wrist and self._rest_wrist is not None and mx - rest > 3:
                start, peak = self._rest_wrist, self._peak_wrist[j]
                out[j]["target_wrist"] = [a + self.target_fraction * (b-a) for a,b in zip(start,peak)]
        return out
