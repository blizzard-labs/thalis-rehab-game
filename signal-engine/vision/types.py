"""Lightweight kinematic data objects (NumPy only — no MediaPipe/av imports).

Kept dependency-free so the pure-geometry and engine unit tests stay hermetic;
the real MediaPipe estimator (``pose_estimator.py``) produces ``PoseFrame``s and
the fusion engine consumes ``KinematicResult``s.
"""
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
    shoulder_flexion_deg: float = 0.0
    shoulder_abduction_deg: float = 0.0
    elbow_deg: float = 0.0


@dataclass
class RestPose:
    shoulder_mid: np.ndarray         # (3,)
    shoulder_width: float
    reach_extent: float
    timestamp: float
