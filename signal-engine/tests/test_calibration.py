"""End-to-end tests for the calibration orchestrator against a live mock stream.

A real MockUnicornOutlet LSL stream feeds a real EEGInlet; the orchestrator
runs a shortened cued MI block (3 trials/class, 0.5 s MI windows) and we assert
epoch shapes, label balance, the no-long-runs constraint, wall-clock timing,
clean abort behavior, the InsufficientDataError gate, and label encoding.
"""

from __future__ import annotations

import threading
import time

import numpy as np
import pytest

from acquisition.lsl_inlet import EEGInlet
from acquisition.mock_eeg_outlet import MockUnicornOutlet
from calibration.epoch_extractor import label_encode
from calibration.marker_outlet import create_marker_outlet
from calibration.orchestrator import (
    CalibrationOrchestrator,
    InsufficientDataError,
)

FS = 250
CLASSES = ["imagine_right_hand", "rest"]

# Shortened fast-test paradigm parameters.
FAST = dict(
    n_trials_per_class=3,
    classes=CLASSES,
    mi_window_duration_s=0.5,
    fixation_duration_s=0.1,
    cue_duration_s=0.1,
    iti_min_s=0.1,
    iti_max_s=0.2,
    fs=FS,
)


def _max_run(labels):
    longest = run = 0
    prev = object()
    for x in labels:
        run = run + 1 if x == prev else 1
        prev = x
        longest = max(longest, run)
    return longest


def _make_stack():
    """Start a mock outlet + inlet + marker outlet; return (outlet, inlet, markers)."""
    outlet = MockUnicornOutlet(seed=7)
    outlet.start()
    time.sleep(0.3)  # let LSL discovery settle
    inlet = EEGInlet(timeout=5.0, pull_timeout=1.0)
    markers = create_marker_outlet()
    return outlet, inlet, markers


def test_calibration_dataset_shapes_and_balance():
    outlet, inlet, markers = _make_stack()
    try:
        orch = CalibrationOrchestrator(seed=1, **FAST)
        ds = orch.run(inlet, markers)

        n_samples = int(round(FAST["mi_window_duration_s"] * FS))  # 125
        assert ds.epochs.shape == (6, 8, n_samples)
        assert ds.epochs.dtype == np.float64

        assert ds.labels.count("imagine_right_hand") == 3
        assert ds.labels.count("rest") == 3

        # No more than 3 consecutive identical labels.
        assert _max_run(ds.labels) <= 3

        # Session info is populated and self-consistent.
        assert ds.session_info["fs"] == FS
        assert ds.session_info["channel_labels"] == inlet.eeg_labels
        assert ds.session_info["classes"] == CLASSES
        assert len(ds.marker_timestamps) == 6
    finally:
        inlet.close()
        outlet.stop()


def test_calibration_wall_clock_timing():
    outlet, inlet, markers = _make_stack()
    try:
        orch = CalibrationOrchestrator(seed=1, **FAST)
        t0 = time.perf_counter()
        ds = orch.run(inlet, markers)
        elapsed = time.perf_counter() - t0

        n_trials = 6
        mean_iti = (FAST["iti_min_s"] + FAST["iti_max_s"]) / 2
        per_trial = (
            FAST["fixation_duration_s"]
            + FAST["cue_duration_s"]
            + FAST["mi_window_duration_s"]
            + mean_iti
        )
        expected = n_trials * per_trial
        assert abs(elapsed - expected) <= 0.10 * expected, (
            f"elapsed {elapsed:.3f}s vs expected {expected:.3f}s out of ±10% tolerance"
        )
        assert ds.n_trials == 6
    finally:
        inlet.close()
        outlet.stop()


def test_calibration_clean_abort_after_two_trials():
    outlet, inlet, markers = _make_stack()
    try:
        # Fixed ITI so trial duration is deterministic: 0.1+0.1+0.5+0.2 = 0.9s.
        params = {**FAST, "iti_min_s": 0.2, "iti_max_s": 0.2}
        orch = CalibrationOrchestrator(seed=1, **params)
        abort = threading.Event()
        # Two complete trials span [0, 1.8)s; fire mid-trial-3 so trial 3 is
        # discarded and exactly 2 valid trials remain.
        timer = threading.Timer(2.0, abort.set)
        timer.start()
        try:
            ds = orch.run(inlet, markers, abort_event=abort)
        finally:
            timer.cancel()

        n_samples = int(round(params["mi_window_duration_s"] * FS))
        assert ds.n_trials == 2
        assert ds.epochs.shape == (2, 8, n_samples)
        assert len(ds.labels) == 2
    finally:
        inlet.close()
        outlet.stop()


def test_calibration_insufficient_data_raises():
    outlet, inlet, markers = _make_stack()
    try:
        orch = CalibrationOrchestrator(seed=1, **FAST)
        abort = threading.Event()
        # Fire before the first fixation period ends (0.1s): no trial completes.
        timer = threading.Timer(0.05, abort.set)
        timer.start()
        try:
            with pytest.raises(InsufficientDataError):
                orch.run(inlet, markers, abort_event=abort)
        finally:
            timer.cancel()
    finally:
        inlet.close()
        outlet.stop()


def test_label_encode_contract():
    outlet, inlet, markers = _make_stack()
    try:
        orch = CalibrationOrchestrator(seed=1, **FAST)
        ds = orch.run(inlet, markers)

        y, encoder = label_encode(ds)
        assert y.dtype == int or np.issubdtype(y.dtype, np.integer)
        assert len(y) == ds.n_trials == 6
        assert sorted(encoder.classes_.tolist()) == sorted(CLASSES)
        # Round-trip decode matches the original labels.
        assert encoder.inverse_transform(y).tolist() == ds.labels
    finally:
        inlet.close()
        outlet.stop()
