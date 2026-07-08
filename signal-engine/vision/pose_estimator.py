"""Pose estimation seam.

``PoseEstimator`` is a Protocol so unit tests inject a fake emitting synthetic
landmarks — no MediaPipe model or camera in CI. ``MediaPipePoseEstimator`` is the
real implementation; ``mediapipe`` is imported lazily so importing this module
stays cheap and hermetic.
"""
from __future__ import annotations

import time
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

        return PoseFrame(pose=pose, hands=hands, timestamp=time.time())
