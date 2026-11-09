import numpy as np

from vision.kinematic_engine import KinematicScoreEngine
from vision.rest_pose import RestPoseCalibrator
from vision.types import PoseFrame


def _frame(wrist_x=0.6, shoulder_shift=0.0, vis=1.0, ts=0.0):
    p = np.zeros((33, 4))
    p[:, 3] = vis
    p[11, :3] = [-0.5 + shoulder_shift, 0, 0]
    p[12, :3] = [0.5 + shoulder_shift, 0, 0]
    p[16, :3] = [wrist_x, 0, 0]
    p[24, :3] = [0.5, 1.0, 0]
    return PoseFrame(pose=p, hands={}, timestamp=ts)


def _engine_with_rest():
    cal = RestPoseCalibrator(min_frames=10)
    for _ in range(15):
        cal.add(_frame(wrist_x=0.6))
    eng = KinematicScoreEngine(norm_warmup=2)
    eng.set_rest_pose(cal.build())
    return eng


def test_score_rises_as_arm_extends():
    eng = _engine_with_rest()
    lows = [eng.compute(_frame(wrist_x=0.6, ts=i * 0.05)).kinematic_score for i in range(6)]
    highs = [eng.compute(_frame(wrist_x=2.5, ts=(6 + i) * 0.05)).kinematic_score for i in range(6)]
    assert max(highs) > max(lows)


def test_trunk_lean_flags_and_penalizes():
    eng = _engine_with_rest()
    r = eng.compute(_frame(wrist_x=1.5, shoulder_shift=0.5))
    assert r.compensation_flag is True
    assert r.compensation_penalty > 0.0


def test_absent_frame_is_invalid_not_zero():
    eng = _engine_with_rest()
    r = eng.compute(None)
    assert r.pose_valid is False
    assert r.compensation_penalty == 0.0


def test_all_low_visibility_is_invalid():
    eng = _engine_with_rest()
    r = eng.compute(_frame(vis=0.05))
    assert r.pose_valid is False


def test_last_known_good_is_not_valid_measurement_during_dropout():
    eng = _engine_with_rest()
    eng.compute(_frame(wrist_x=2.5, ts=1.00))            # good, high reach
    bridged = eng.compute(_frame(vis=0.05, ts=1.05))     # dropout within lkg window
    assert bridged.pose_valid is False


def test_compute_reports_joint_angles():
    import vision.kinematics as kin
    from vision.types import RestPose

    eng = KinematicScoreEngine(affected_side="right")
    eng.set_rest_pose(RestPose(shoulder_mid=np.zeros(3), shoulder_width=1.0,
                               reach_extent=0.5, timestamp=0.0))
    pose = np.zeros((33, 4)); pose[:, 3] = 1.0
    pose[kin.RIGHT_SHOULDER, :3] = (0, 0, 0)
    pose[kin.RIGHT_HIP, :3] = (0, 1, 0)
    pose[kin.RIGHT_ELBOW, :3] = (1, 0, 0)
    pose[kin.RIGHT_WRIST, :3] = (2, 0, 0)
    res = eng.compute(PoseFrame(pose=pose, hands={}, timestamp=1.0))
    assert abs(res.shoulder_abduction_deg - 90.0) < 10.0
    assert res.elbow_deg > 150.0
