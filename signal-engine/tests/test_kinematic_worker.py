import time

import numpy as np

from vision.frame_sink import VideoFrameSink
from vision.kinematic_engine import KinematicScoreEngine
from vision.kinematic_worker import KinematicWorker, LatestKinematic
from vision.rest_pose import RestPoseCalibrator
from vision.types import PoseFrame


def _pose_frame(wrist_x=1.5, ts=0.0):
    p = np.zeros((33, 4))
    p[:, 3] = 1.0
    p[11, :3] = [-0.5, 0, 0]
    p[12, :3] = [0.5, 0, 0]
    p[16, :3] = [wrist_x, 0, 0]
    p[24, :3] = [0.5, 1.0, 0]
    return PoseFrame(pose=p, hands={}, timestamp=ts)


class _FakeEstimator:
    def estimate(self, av_frame):
        return _pose_frame(wrist_x=float(av_frame))  # frame == wrist_x


def _rested_engine():
    cal = RestPoseCalibrator(min_frames=5)
    for _ in range(8):
        cal.add(_pose_frame(wrist_x=0.6))
    eng = KinematicScoreEngine(norm_warmup=1)
    eng.set_rest_pose(cal.build())
    return eng


def test_worker_publishes_latest_result():
    sink = VideoFrameSink()
    latest = LatestKinematic()
    worker = KinematicWorker(sink, _FakeEstimator(), _rested_engine(), latest, rate_hz=200.0)
    worker.start()
    try:
        for x in (0.6, 1.2, 2.5):
            sink.push(x)
            time.sleep(0.03)
        result = latest.get()
        assert result is not None and result.pose_valid is True
    finally:
        worker.stop()


def test_latest_pose_returns_last_estimated_frame():
    sink = VideoFrameSink()
    worker = KinematicWorker(sink, _FakeEstimator(), _rested_engine(), LatestKinematic())
    assert worker.latest_pose() is None
    sink.push(1.5)
    worker._process(sink.latest())  # drive one tick directly
    pose = worker.latest_pose()
    assert pose is not None
    assert pose.pose.shape == (33, 4)


def test_stale_sink_not_reprocessed():
    sink = VideoFrameSink()
    latest = LatestKinematic()
    calls = {"n": 0}

    class _Counting:
        def estimate(self, av_frame):
            calls["n"] += 1
            return _pose_frame()

    worker = KinematicWorker(sink, _Counting(), _rested_engine(), latest, rate_hz=500.0)
    sink.push(1.5)
    worker.start()
    time.sleep(0.1)
    worker.stop()
    assert calls["n"] == 1   # single frame processed once despite many loop iterations


def test_reset_calibration_drops_progress():
    sink = VideoFrameSink()
    worker = KinematicWorker(sink, _FakeEstimator(), KinematicScoreEngine(), LatestKinematic())
    worker.begin_calibration()
    assert worker.calibration_status() == "collecting"
    worker.reset_calibration()
    assert worker.calibration_status() == "idle"


def test_begin_calibration_sets_rest_pose():
    sink = VideoFrameSink()
    latest = LatestKinematic()
    eng = KinematicScoreEngine(norm_warmup=1)
    worker = KinematicWorker(sink, _FakeEstimator(), eng, latest, rate_hz=500.0,
                             rest_min_frames=5)
    worker.begin_calibration()
    worker.start()
    try:
        for i in range(20):
            sink.push(0.6)
            time.sleep(0.01)
        deadline = time.time() + 1.0
        while worker.calibration_status() == "collecting" and time.time() < deadline:
            time.sleep(0.01)
        assert worker.calibration_status() == "complete"
    finally:
        worker.stop()


def test_worker_rom_calibration_completes_and_builds_targets():
    import numpy as np
    import vision.kinematics as kin
    from vision.kinematic_engine import KinematicScoreEngine
    from vision.kinematic_worker import KinematicWorker, LatestKinematic
    from vision.rom_calibrator import RomCalibrator
    from vision.types import PoseFrame

    def _pose():
        p = np.zeros((33, 4)); p[:, 3] = 1.0
        p[kin.RIGHT_SHOULDER, :3] = (0, 0, 0); p[kin.RIGHT_HIP, :3] = (0, 1, 0)
        p[kin.RIGHT_ELBOW, :3] = (1, 0, 0); p[kin.RIGHT_WRIST, :3] = (2, 0, 0)
        return PoseFrame(pose=p, hands={}, timestamp=0.0)

    class Est:
        def estimate(self, _): return _pose()

    class Sink:
        frame_count = 0
        def latest(self): return object()

    eng = KinematicScoreEngine("right")
    from vision.types import RestPose
    eng.set_rest_pose(RestPose(shoulder_mid=np.zeros(3), shoulder_width=1.0,
                               reach_extent=0.5, timestamp=0.0))
    w = KinematicWorker(Sink(), Est(), eng, LatestKinematic())
    w._rom_calibrator = RomCalibrator("right", min_frames=2)
    w._rom_status = "collecting"
    for _ in range(3):
        w._process(object())
    assert w.rom_calibration_status() == "complete"
    assert w.rom_targets()["shoulder_abduction"]["max_deg"] > 80.0
