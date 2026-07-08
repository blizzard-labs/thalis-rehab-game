import numpy as np
import pytest

from vision import kinematics as kin
from vision.types import PoseFrame, KinematicResult, RestPose


def _pose(overrides=None):
    p = np.zeros((33, 4), dtype=float)
    p[:, 3] = 1.0  # fully visible
    if overrides:
        for idx, xyz in overrides.items():
            p[idx, :3] = xyz
    return p


def test_joint_angle_right_angle():
    a = np.array([0.0, 1.0, 0.0])
    b = np.array([0.0, 0.0, 0.0])
    c = np.array([1.0, 0.0, 0.0])
    assert kin.joint_angle(a, b, c) == pytest.approx(90.0, abs=1e-6)


def test_side_indices_left_and_right():
    r = kin.side_indices("right")
    assert (r["shoulder"], r["elbow"], r["wrist"], r["hip"]) == (12, 14, 16, 24)
    left = kin.side_indices("left")
    assert (left["shoulder"], left["elbow"], left["wrist"], left["hip"]) == (11, 13, 15, 23)


def test_reach_extent_grows_when_arm_extends():
    idx = kin.side_indices("right")
    tucked = _pose({idx["shoulder"]: [0, 0, 0], idx["wrist"]: [0.1, 0, 0], idx["hip"]: [0, 1, 0]})
    extended = _pose({idx["shoulder"]: [0, 0, 0], idx["wrist"]: [1.0, 0, 0], idx["hip"]: [0, 1, 0]})
    assert kin.reach_extent(extended, "right") > kin.reach_extent(tucked, "right")


def test_trunk_displacement_zero_at_rest():
    p = _pose({11: [-0.5, 0, 0], 12: [0.5, 0, 0]})
    rest = RestPose(shoulder_mid=np.array([0.0, 0.0, 0.0]), shoulder_width=1.0,
                    reach_extent=0.2, timestamp=0.0)
    assert kin.trunk_displacement(p, rest) == pytest.approx(0.0, abs=1e-6)
    leaned = _pose({11: [0.0, 0, 0], 12: [1.0, 0, 0]})  # shoulders shifted +0.5 in x
    assert kin.trunk_displacement(leaned, rest) == pytest.approx(0.5, abs=1e-6)


def test_jerk_zero_for_constant_velocity():
    dt = 0.05
    positions = [np.array([float(i), 0.0, 0.0]) for i in range(5)]
    assert kin.jerk(positions, dt) == pytest.approx(0.0, abs=1e-6)


def test_kinematic_result_fields():
    r = KinematicResult(50.0, 0.0, False, True, True, 1.0)
    assert r.kinematic_score == 50.0 and r.pose_valid is True
