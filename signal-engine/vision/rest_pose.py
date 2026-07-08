"""Per-session rest-pose calibration.

Collects a few seconds of clean rest ``PoseFrame``s and reduces them to a median
``RestPose`` used for all relative-displacement calculations (trunk lean, reach
extent). Median absorbs the odd jittery frame; low-visibility frames are dropped.
"""
from __future__ import annotations

import numpy as np

from vision import kinematics as kin
from vision.types import PoseFrame, RestPose


class RestPoseCalibrator:
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
