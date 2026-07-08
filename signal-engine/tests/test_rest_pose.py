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
