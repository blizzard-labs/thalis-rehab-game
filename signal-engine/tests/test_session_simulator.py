from __future__ import annotations

import time

from scoring.session_simulator import SessionSimulator


class FakeOutlet:
    """Records inject_erd / inject_spike calls; no LSL."""
    def __init__(self):
        self.erd_calls = []
        self.spike_calls = []

    def inject_erd(self, channel_label, band, start_in_s, duration_s, suppression_fraction):
        self.erd_calls.append((channel_label, tuple(band), suppression_fraction))

    def inject_spike(self, amplitude_uv=200.0, n_samples=25, start_in_s=0.0):
        self.spike_calls.append(amplitude_uv)


def test_phase_at_boundaries():
    sim = SessionSimulator(FakeOutlet(), settle_s=4.0, calib_s=16.0)
    assert sim.phase_at(0.0) == "settle"
    assert sim.phase_at(3.9) == "settle"
    assert sim.phase_at(4.0) == "calibration"
    assert sim.phase_at(19.9) == "calibration"
    assert sim.phase_at(20.0) == "gameplay"
    assert sim.phase_at(120.0) == "gameplay"


def test_status_idle_before_arm():
    sim = SessionSimulator(FakeOutlet())
    st = sim.status()
    assert st == {"armed": False, "phase": "idle", "elapsed_s": 0.0}


def test_arm_drives_injections_then_disarm_stops():
    outlet = FakeOutlet()
    # Tiny arc so gameplay is reached within the test window.
    sim = SessionSimulator(outlet, seed=1, settle_s=0.0, calib_s=0.0, step_s=0.05)
    sim.arm()
    assert sim.status()["armed"] is True
    time.sleep(0.4)  # several gameplay steps
    sim.disarm()
    assert sim.status()["armed"] is False
    # Gameplay drove ERD on BOTH MI channels, mu + beta each.
    channels = {c[0] for c in outlet.erd_calls}
    assert channels == {"C3", "C4"}, f"expected both MI channels, got {channels}"
    bands = {c[1] for c in outlet.erd_calls}
    assert (8.0, 12.0) in bands and (13.0, 30.0) in bands
    # After disarm no further injections accumulate.
    n_after_disarm = len(outlet.erd_calls)
    time.sleep(0.2)
    assert len(outlet.erd_calls) == n_after_disarm


def test_arm_is_idempotent():
    outlet = FakeOutlet()
    sim = SessionSimulator(outlet, seed=2, settle_s=0.0, calib_s=0.0, step_s=0.05)
    sim.arm()
    sim.arm()  # must not spawn a second worker or raise
    time.sleep(0.15)
    sim.disarm()
    assert sim._thread is None
