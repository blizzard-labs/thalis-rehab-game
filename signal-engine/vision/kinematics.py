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


def jerk(positions: list[np.ndarray], dt: float) -> float:
    """Mean magnitude of the 3rd time-derivative of a position history."""
    if len(positions) < 4 or dt <= 0:
        return 0.0
    p = np.stack([np.asarray(x, float) for x in positions])
    third = np.diff(p, n=3, axis=0) / (dt ** 3)
    return float(np.mean(np.linalg.norm(third, axis=1)))
