from vision.vision_health import VisionHealthMonitor


class _Receiver:
    def __init__(self, state):
        self._state = state

    def connection_state(self):
        return self._state


class _Sink:
    def __init__(self):
        self.frame_count = 0


class _Latest:
    def __init__(self):
        self.value = None

    def get(self):
        return self.value


class _Result:
    def __init__(self, ts):
        self.timestamp = ts


class _Engine:
    def __init__(self, mode, side="right", rest=None):
        self.session_mode = mode
        self.affected_side = side
        self._rest = rest


class _Worker:
    def __init__(self, status="idle"):
        self._status = status

    def calibration_status(self):
        return self._status


class _Clock:
    def __init__(self):
        self.t = 1000.0

    def now(self):
        return self.t


def _monitor(clk, *, mode="B", state="connected", side="right", rest=None, cal="idle"):
    engine = _Engine(mode, side=side, rest=rest)
    m = VisionHealthMonitor(
        _Receiver(state), _Sink(), _Latest(), engine,
        worker=_Worker(cal), staleness_s=0.3, now=clk.now,
    )
    return m


def test_first_sample_reports_zero_fps():
    clk = _Clock()
    m = _monitor(clk)
    snap = m.sample()
    assert snap["fps"] == 0.0
    assert snap["connection"] == "connected"


def test_fps_from_frame_count_delta():
    clk = _Clock()
    m = _monitor(clk)
    m.sample()                 # prime
    m.sink.frame_count = 30
    clk.t += 2.0               # 30 frames in 2 s -> 15 fps
    snap = m.sample()
    assert abs(snap["fps"] - 15.0) < 1e-6


def test_kinematic_active_fresh_vs_stale():
    clk = _Clock()
    m = _monitor(clk)
    m.latest.value = _Result(ts=clk.t - 0.1)   # 100 ms old -> fresh
    assert m.sample()["kinematic_active"] is True
    m.latest.value = _Result(ts=clk.t - 0.5)   # 500 ms old -> stale
    assert m.sample()["kinematic_active"] is False


def test_degraded_only_in_kinematic_modes():
    clk = _Clock()
    mb = _monitor(clk, mode="B")
    assert mb.sample()["degraded"] is True
    ma = _monitor(clk, mode="A")
    assert ma.sample()["degraded"] is False


def test_not_degraded_when_kinematic_fresh():
    clk = _Clock()
    m = _monitor(clk, mode="C")
    m.latest.value = _Result(ts=clk.t)
    assert m.sample()["degraded"] is False


def test_not_degraded_when_no_connection():
    # Boot state: MediaPipe present -> Mode B, but no patient camera has
    # connected yet (connection "closed"). "degraded" means a live link dropped,
    # not "never connected" -> must stay False until the link is up.
    clk = _Clock()
    m = _monitor(clk, mode="B", state="closed")
    assert m.sample()["degraded"] is False


def test_reports_affected_side_and_calibration_state():
    clk = _Clock()
    m = _monitor(clk, side="left", rest=None, cal="collecting")
    snap = m.sample()
    assert snap["affected_side"] == "left"
    assert snap["calibration"] == "collecting"
    assert snap["rest_calibrated"] is False


def test_rest_calibrated_true_when_engine_has_rest():
    clk = _Clock()
    m = _monitor(clk, side="right", rest=object(), cal="complete")
    snap = m.sample()
    assert snap["rest_calibrated"] is True
    assert snap["calibration"] == "complete"
