"""Kinematic score engine: PoseFrame (+ per-session rest pose) -> KinematicResult.

Scoring:
- ``kinematic_score`` is adaptive rest->observed-max ROM: the calibrated rest
  reach anchors 0; the best reach seen this session anchors 100 (mirrors the EEG
  ``IntentScoreEngine`` min-max spirit, but rest-anchored so rest reads ~0
  immediately without a warmup transient).
- ``compensation_penalty`` / ``compensation_flag`` fire when trunk displacement
  from the rest pose exceeds a conservative threshold — a clinical guardrail.
- Confidence gating: if the key landmarks (shoulders, affected wrist/hip) drop
  below the visibility floor, or no frame arrives, the result is *absent
  evidence* (``pose_valid=False``) — briefly bridged by last-known-good so a
  single dropped frame doesn't blank the score. Absent is never scored as 0.
"""
from __future__ import annotations

import time

import numpy as np

from vision import kinematics as kin
from vision.types import KinematicResult, PoseFrame, RestPose


class KinematicScoreEngine:
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
        self._last_good: KinematicResult | None = None

    def set_rest_pose(self, rest: RestPose | None) -> None:
        self._rest = rest
        self._min = 0.0
        self._max = 1e-6

    def _key_visible(self, frame: PoseFrame) -> bool:
        idx = kin.side_indices(self.affected_side)
        needed = [kin.LEFT_SHOULDER, kin.RIGHT_SHOULDER, idx["wrist"], idx["hip"]]
        return all(frame.pose[i, 3] >= self.visibility_threshold for i in needed)

    def _invalid(self, ts: float) -> KinematicResult:
        # Bridge a brief dropout with the last good score, else absent evidence.
        if self._last_good is not None and (ts - self._last_good.timestamp) <= self.lkg_max_age_s:
            g = self._last_good
            return KinematicResult(g.kinematic_score, 0.0, False, False, True, ts,
                                   g.shoulder_flexion_deg, g.shoulder_abduction_deg, g.elbow_deg,
                                   g.wrist_dx, g.wrist_dy)
        return KinematicResult(0.0, 0.0, False, False, False, ts)

    def compute(self, frame: PoseFrame | None) -> KinematicResult:
        now = time.time()
        if frame is None or self._rest is None or not self._key_visible(frame):
            ts = now if frame is None else frame.timestamp
            return self._invalid(ts)

        reach = kin.reach_extent(frame.pose, self.affected_side)
        disp = kin.trunk_displacement(frame.pose, self._rest)
        base = self._rest.reach_extent

        # Rest-anchored adaptive normalization: rest -> 0, best-so-far -> 100.
        self._max = max(self._max, reach, base + 1e-6)
        self._min = min(base, reach)
        span = max(self._max - self._min, 1e-6)
        score = float(np.clip((reach - self._min) / span * 100.0, 0.0, 100.0))

        flag = disp > self.compensation_threshold
        penalty = (
            float(min(self.max_penalty, (disp - self.compensation_threshold) * 100.0))
            if flag else 0.0
        )
        moved = abs(reach - base) > self.movement_deadband or flag

        angles = dict(
            shoulder_flexion_deg=kin.shoulder_flexion_angle(frame.pose, self.affected_side),
            shoulder_abduction_deg=kin.shoulder_abduction_angle(frame.pose, self.affected_side),
            elbow_deg=kin.elbow_extension_angle(frame.pose, self.affected_side),
        )
        wdx, wdy = kin.wrist_offset(frame.pose, self.affected_side)
        angles["wrist_dx"], angles["wrist_dy"] = wdx, wdy
        result = KinematicResult(score, penalty, flag, moved, True, frame.timestamp, **angles)
        self._last_good = result
        return result
