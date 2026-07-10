import numpy as np
import vision.kinematics as kin
from vision.rom_calibrator import RomCalibrator
from vision.types import PoseFrame


def _frame(elbow_xyz, ts):
    p = np.zeros((33, 4)); p[:, 3] = 1.0
    p[kin.RIGHT_SHOULDER, :3] = (0, 0, 0)
    p[kin.RIGHT_HIP, :3] = (0, 1, 0)
    p[kin.RIGHT_ELBOW, :3] = elbow_xyz
    p[kin.RIGHT_WRIST, :3] = tuple(2 * c for c in elbow_xyz)
    return PoseFrame(pose=p, hands={}, timestamp=ts)


def test_rom_calibrator_captures_max_and_targets():
    cal = RomCalibrator(affected_side="right", min_frames=3, target_fraction=0.5)
    cal.add(_frame((0, 1, 0), 0.0))    # arm down: abduction ~0
    cal.add(_frame((1, 0, 0), 0.1))    # arm out: abduction ~90 (the max)
    cal.add(_frame((0.5, 0.5, 0), 0.2))
    assert cal.is_complete()
    targets = cal.build(rest_angles={"shoulder_abduction": 10.0,
                                     "shoulder_flexion": 5.0, "elbow_extension": 90.0})
    ab = targets["shoulder_abduction"]
    assert ab["max_deg"] > 80.0
    assert ab["rest_deg"] == 10.0
    assert abs(ab["target_deg"] - (10.0 + 0.5 * (ab["max_deg"] - 10.0))) < 1e-6


def test_rom_calibrator_incomplete_below_min_frames():
    cal = RomCalibrator(affected_side="right", min_frames=5)
    cal.add(_frame((1, 0, 0), 0.0))
    assert not cal.is_complete()
