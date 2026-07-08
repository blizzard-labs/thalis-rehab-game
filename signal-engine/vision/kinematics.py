"""Pure kinematic geometry on MediaPipe Pose landmarks.

No MediaPipe/av dependency: functions take plain NumPy landmark arrays so the
math is fully unit-testable with synthetic poses.
"""
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
