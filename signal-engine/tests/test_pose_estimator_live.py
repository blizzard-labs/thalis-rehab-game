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
