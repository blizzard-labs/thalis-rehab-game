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
    def __init__(self, mode):
        self.session_mode = mode


class _Clock:
    def __init__(self):
        self.t = 1000.0

    def now(self):
        return self.t


def _monitor(clk, *, mode="B", state="connected"):
    m = VisionHealthMonitor(
        _Receiver(state), _Sink(), _Latest(), _Engine(mode),
        staleness_s=0.3, now=clk.now,
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
