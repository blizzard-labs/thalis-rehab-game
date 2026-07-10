"""Background bridge: VideoFrameSink -> PoseEstimator -> KinematicScoreEngine.

Runs on its own thread at a fixed cadence (below the 20 Hz scoring tick), pulling
only the newest frame from the sink (dedup by ``frame_count``) so a slow MediaPipe
inference drops stale frames rather than backing up. The freshest ``KinematicResult``
is published to a thread-safe ``LatestKinematic`` holder that the ScoringService reads.

Calibration mode: ``begin_calibration()`` diverts incoming pose frames into a
``RestPoseCalibrator``; once enough clean frames are collected the resulting
``RestPose`` is installed on the engine and normal scoring resumes.
"""
from __future__ import annotations

import logging
import threading

from vision.kinematic_engine import KinematicScoreEngine
from vision.rest_pose import RestPoseCalibrator
from vision.types import KinematicResult

logger = logging.getLogger(__name__)


class LatestKinematic:
    """Thread-safe single-slot holder for the newest KinematicResult."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._value: KinematicResult | None = None

    def set(self, result: KinematicResult | None) -> None:
        with self._lock:
            self._value = result

    def get(self) -> KinematicResult | None:
        with self._lock:
            return self._value


class KinematicWorker:
    def __init__(self, sink, estimator, engine: KinematicScoreEngine, latest: LatestKinematic,
                 rate_hz: float = 15.0, rest_min_frames: int = 75):
        self.sink = sink
        self.estimator = estimator
        self.engine = engine
        self.latest = latest
        self.rate_hz = float(rate_hz)
        self.rest_min_frames = int(rest_min_frames)

        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._last_count = -1
        self._calibrator: RestPoseCalibrator | None = None
        self._cal_status = "idle"
        # Newest PoseFrame from estimate(), for the console camera overlay. Set on
        # every processed frame (including during calibration) so the overlay is
        # live even before scoring resumes.
        self._pose_lock = threading.Lock()
        self._latest_pose = None  # Optional[PoseFrame]

    def latest_pose(self):
        with self._pose_lock:
            return self._latest_pose

    # -- calibration -----------------------------------------------------------

    def begin_calibration(self) -> None:
        self._calibrator = RestPoseCalibrator(
            affected_side=self.engine.affected_side, min_frames=self.rest_min_frames
        )
        self._cal_status = "collecting"

    def calibration_status(self) -> str:
        return self._cal_status

    def reset_calibration(self) -> None:
        """Drop any in-progress or completed calibration (e.g. affected side
        changed, so the existing rest pose no longer applies)."""
        self._calibrator = None
        self._cal_status = "idle"

    # -- lifecycle -------------------------------------------------------------

    def start(self) -> "KinematicWorker":
        if self._thread is not None and self._thread.is_alive():
            raise RuntimeError("KinematicWorker already running")
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="KinematicWorker", daemon=True)
        self._thread.start()
        return self

    def stop(self, join_timeout: float = 2.0) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=join_timeout)
        self._thread = None

    # -- loop ------------------------------------------------------------------

    def _run(self) -> None:
        period = 1.0 / self.rate_hz
        try:
            while not self._stop.is_set():
                count = self.sink.frame_count
                if count != self._last_count and self.sink.latest() is not None:
                    self._last_count = count
                    self._process(self.sink.latest())
                self._stop.wait(timeout=period)
        except Exception:
            logger.exception("KinematicWorker loop crashed")

    def _process(self, av_frame) -> None:
        pose_frame = self.estimator.estimate(av_frame)
        with self._pose_lock:
            self._latest_pose = pose_frame
        if self._calibrator is not None:
            if pose_frame is not None:
                self._calibrator.add(pose_frame)
            if self._calibrator.is_complete():
                self.engine.set_rest_pose(self._calibrator.build())
                self._cal_status = "complete"
                self._calibrator = None
            return
        self.latest.set(self.engine.compute(pose_frame))
