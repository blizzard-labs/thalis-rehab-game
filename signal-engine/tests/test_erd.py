"""Tests for ERD / laterality features against MockUnicornOutlet's inject_erd.

These are end-to-end: a live mock Unicorn stream injects a known mu-power
suppression on one channel, and we verify the ERDCalculator recovers a
substantial ERD% there and ~0 on the un-injected contralateral channel.
"""

from __future__ import annotations

import time

import numpy as np
import pytest

from acquisition.lsl_inlet import EEGInlet
from acquisition.mock_eeg_outlet import DEFAULT_EEG_LABELS, MockUnicornOutlet
from features.erd import (
    BaselineNotCalibratedError,
    ERDCalculator,
    laterality_index,
)

FS = 250


def _drain(inlet: EEGInlet) -> None:
    """Discard any buffered samples so the next pull tracks live data."""
    while True:
        chunk = inlet.get_eeg_chunk(max_samples=10000, timeout=0.0)
        if chunk.shape[1] == 0:
            break


def _pull_for(inlet: EEGInlet, seconds: float) -> np.ndarray:
    """Collect live EEG for `seconds` of wall-clock time -> [8, n_samples]."""
    deadline = time.monotonic() + seconds
    parts: list[np.ndarray] = []
    while time.monotonic() < deadline:
        chunk = inlet.get_eeg_chunk(max_samples=250, timeout=0.2)
        if chunk.shape[1] > 0:
            parts.append(chunk)
    if not parts:
        return np.empty((8, 0), dtype=np.float64)
    return np.concatenate(parts, axis=1)


def _run_injection_trial(inject_channel: str):
    """Start a mock outlet, inject mu suppression on `inject_channel`, and
    return (erd_dict, eeg_labels) from a baseline + task pull.
    """
    outlet = MockUnicornOutlet(seed=123)
    outlet.start()
    time.sleep(0.3)  # let LSL discovery settle
    inlet = EEGInlet(timeout=5.0, pull_timeout=1.0)
    try:
        # Schedule a 50% mu suppression: window [2.0s, 6.0s] after now.
        outlet.inject_erd(
            channel_label=inject_channel,
            band=(8.0, 12.0),
            start_in_s=2.0,
            duration_s=4.0,
            suppression_fraction=0.5,
        )
        t0 = time.monotonic()

        # Baseline: pull ~1.5s of rest, entirely before the 2.0s injection start.
        _drain(inlet)
        baseline = _pull_for(inlet, 1.5)
        assert baseline.shape[1] > FS, "did not capture a full baseline window"

        calc = ERDCalculator(channel_labels=["C3", "C4"], fs=FS)
        calc.calibrate_baseline(baseline, DEFAULT_EEG_LABELS)

        # Wait into the suppression window, then pull the steady middle of it
        # (2.5s..5.5s) to avoid edge transients.
        while time.monotonic() - t0 < 2.5:
            time.sleep(0.02)
        _drain(inlet)
        task = _pull_for(inlet, 3.0)
        assert task.shape[1] > FS, "did not capture a full task window"

        erd = calc.compute_erd(task, DEFAULT_EEG_LABELS)
        return erd, calc
    finally:
        inlet.close()
        outlet.stop()


@pytest.mark.parametrize("inject_channel", ["C3"])
def test_erd_detected_on_injected_channel_only(inject_channel):
    erd, _calc = _run_injection_trial(inject_channel)

    # 50% amplitude suppression -> ~75% power drop; assert clearly positive ERD.
    assert erd["C3"]["mu"] > 25.0, f"expected strong C3 mu ERD, got {erd['C3']['mu']:.1f}%"
    # The un-injected channel should not move much -> not picking up global change.
    assert abs(erd["C4"]["mu"]) < 15.0, f"C4 mu ERD should be ~0, got {erd['C4']['mu']:.1f}%"


def test_laterality_index_positive_when_left_injected():
    erd, _calc = _run_injection_trial("C3")
    li = laterality_index(erd, left_channel="C3", right_channel="C4", band="mu")
    # ERD_left >> ERD_right -> LI positive.
    assert li > 0.0, f"expected positive LI for left-channel injection, got {li:.3f}"


def test_laterality_index_flips_sign_when_right_injected():
    erd, _calc = _run_injection_trial("C4")
    # Sanity: now C4 carries the ERD.
    assert erd["C4"]["mu"] > 25.0, f"expected strong C4 mu ERD, got {erd['C4']['mu']:.1f}%"
    assert abs(erd["C3"]["mu"]) < 15.0, f"C3 mu ERD should be ~0, got {erd['C3']['mu']:.1f}%"
    li = laterality_index(erd, left_channel="C3", right_channel="C4", band="mu")
    assert li < 0.0, f"expected negative LI for right-channel injection, got {li:.3f}"


def test_compute_erd_before_calibration_raises():
    calc = ERDCalculator(channel_labels=["C3", "C4"], fs=FS)
    dummy = np.random.default_rng(0).standard_normal((8, 500))
    with pytest.raises(BaselineNotCalibratedError):
        calc.compute_erd(dummy, DEFAULT_EEG_LABELS)


def test_laterality_index_near_zero_denominator_returns_zero():
    # Constructed all-zero ERD -> denominator 0 -> must return 0.0, not nan/inf.
    erd_dict = {"C3": {"mu": 0.0, "beta": 0.0}, "C4": {"mu": 0.0, "beta": 0.0}}
    li = laterality_index(erd_dict, left_channel="C3", right_channel="C4", band="mu")
    assert li == 0.0
    assert not np.isnan(li) and not np.isinf(li)


def test_compute_band_power_shapes():
    # Lightweight direct check of the band_power contract.
    from features.band_power import compute_band_power

    rng = np.random.default_rng(1)
    data = rng.standard_normal((8, 750))
    power = compute_band_power(data, fs=FS, band=(8.0, 12.0), window_sec=1.0)
    assert power.shape == (8,)
    assert np.all(power >= 0.0)
