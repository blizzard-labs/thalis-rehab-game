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


def test_shoulder_abduction_arm_straight_down_is_zero():
    # +y is down (hip below shoulder); arm hanging down = elbow along +y -> 0 deg
    pose = _pose({kin.RIGHT_SHOULDER: (0, 0, 0), kin.RIGHT_HIP: (0, 1, 0),
                  kin.RIGHT_ELBOW: (0, 1, 0), kin.RIGHT_WRIST: (0, 2, 0)})
    assert kin.shoulder_abduction_angle(pose, "right") < 5.0


def test_shoulder_abduction_arm_out_sideways_is_ninety():
    # upper-arm horizontal (frontal plane) -> ~90 deg from the downward trunk axis
    pose = _pose({kin.RIGHT_SHOULDER: (0, 0, 0), kin.RIGHT_HIP: (0, 1, 0),
                  kin.RIGHT_ELBOW: (1, 0, 0), kin.RIGHT_WRIST: (2, 0, 0)})
    assert abs(kin.shoulder_abduction_angle(pose, "right") - 90.0) < 10.0


def test_shoulder_flexion_arm_forward_is_ninety():
    # upper-arm horizontal in the sagittal plane (forward = +z) -> ~90 deg
    pose = _pose({kin.RIGHT_SHOULDER: (0, 0, 0), kin.RIGHT_HIP: (0, 1, 0),
                  kin.RIGHT_ELBOW: (0, 0, 1), kin.RIGHT_WRIST: (0, 0, 2)})
    assert abs(kin.shoulder_flexion_angle(pose, "right") - 90.0) < 10.0


def test_elbow_extension_straight_arm_is_wide():
    pose = _pose({kin.RIGHT_SHOULDER: (0, 0, 0), kin.RIGHT_ELBOW: (0, -1, 0),
                  kin.RIGHT_WRIST: (0, -2, 0)})
    assert kin.elbow_extension_angle(pose, "right") > 170.0


def test_angles_degenerate_zero_length_return_zero():
    pose = _pose()  # all points at origin
    assert kin.shoulder_flexion_angle(pose, "right") == 0.0
    assert kin.shoulder_abduction_angle(pose, "right") == 0.0


def test_wrist_offset_normalized_direction():
    pose = _pose({kin.RIGHT_SHOULDER: (0.0, 0.0, 0.0),
                  kin.RIGHT_HIP: (0.0, 0.5, 0.0),        # torso length 0.5
                  kin.RIGHT_WRIST: (0.25, -0.5, 0.0)})   # 0.25 right, 0.5 up
    dx, dy = kin.wrist_offset(pose, "right")
    assert dx == pytest.approx(0.5)    # 0.25 / 0.5 torso
    assert dy == pytest.approx(-1.0)   # -0.5 / 0.5 torso (up is negative image-y)


def test_wrist_offset_zero_torso_returns_zero():
    pose = _pose()  # all at origin -> torso 0
    assert kin.wrist_offset(pose, "right") == (0.0, 0.0)
