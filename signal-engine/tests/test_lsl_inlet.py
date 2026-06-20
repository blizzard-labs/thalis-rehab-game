"""Tests for EEGInlet against MockUnicornOutlet."""

from __future__ import annotations

import random
import time

import numpy as np
import pytest

from acquisition.lsl_inlet import EEGInlet, StreamNotFoundError
from acquisition.mock_eeg_outlet import (
    DEFAULT_EEG_LABELS,
    DEFAULT_IMU_LABELS,
    DEFAULT_LABELS,
    MockUnicornOutlet,
)


@pytest.fixture
def mock_outlet():
    outlet = MockUnicornOutlet()
    outlet.start()
    # Let LSL discovery settle a moment.
    time.sleep(0.3)
    try:
        yield outlet
    finally:
        outlet.stop()


@pytest.fixture
def permuted_mock_outlet():
    rng = random.Random(42)
    labels = list(DEFAULT_LABELS)
    rng.shuffle(labels)
    # Sanity: the permutation must actually differ from the default order.
    assert labels != DEFAULT_LABELS
    outlet = MockUnicornOutlet(channel_labels=labels)
    outlet.start()
    time.sleep(0.3)
    try:
        yield outlet, labels
    finally:
        outlet.stop()


def _connect_inlet(timeout: float = 5.0) -> EEGInlet:
    return EEGInlet(timeout=timeout, pull_timeout=1.0)


def test_inlet_resolves_and_identifies_channels(mock_outlet):
    inlet = _connect_inlet()
    try:
        assert set(inlet.eeg_labels) == set(DEFAULT_EEG_LABELS)
        assert len(inlet.eeg_labels) == 8
        assert set(inlet.imu_labels) == set(DEFAULT_IMU_LABELS)
        assert len(inlet.imu_labels) == 6
        # IMU order convention: accel xyz then gyro xyz.
        assert inlet.imu_labels[:3] == [
            "Accelerometer X", "Accelerometer Y", "Accelerometer Z",
        ]
        assert inlet.imu_labels[3:] == [
            "Gyroscope X", "Gyroscope Y", "Gyroscope Z",
        ]
    finally:
        inlet.close()


def test_inlet_slices_correctly_under_permuted_channel_order(permuted_mock_outlet):
    _outlet, _labels = permuted_mock_outlet
    inlet = _connect_inlet()
    try:
        assert set(inlet.eeg_labels) == set(DEFAULT_EEG_LABELS)
        assert set(inlet.imu_labels) == set(DEFAULT_IMU_LABELS)
        # Pull a chunk; the EEG sub-array must still be [8, N], not the raw 17.
        time.sleep(0.4)
        chunk = inlet.get_eeg_chunk(max_samples=64, timeout=1.0)
        assert chunk.shape[0] == 8
        assert chunk.shape[1] > 0
        assert not np.isnan(chunk).any()
    finally:
        inlet.close()


def test_eeg_chunk_shape_dtype_and_no_nans(mock_outlet):
    inlet = _connect_inlet()
    try:
        # Let the outlet buffer a bit before pulling.
        time.sleep(0.5)
        chunk = inlet.get_eeg_chunk(max_samples=128, timeout=1.0)
        assert chunk.ndim == 2
        assert chunk.shape[0] == 8
        assert 0 < chunk.shape[1] <= 128
        assert chunk.dtype == np.float64
        assert not np.isnan(chunk).any()
    finally:
        inlet.close()


def test_imu_chunk_shape(mock_outlet):
    inlet = _connect_inlet()
    try:
        time.sleep(0.5)
        chunk = inlet.get_imu_chunk(max_samples=128, timeout=1.0)
        assert chunk.shape[0] == 6
        assert 0 < chunk.shape[1] <= 128
        assert chunk.dtype == np.float64
        assert not np.isnan(chunk).any()
    finally:
        inlet.close()


def test_time_correction_returns_float(mock_outlet):
    inlet = _connect_inlet()
    try:
        tc = inlet.get_time_correction()
        assert isinstance(tc, float)
        # A second call within the refresh window should return the same cached value.
        tc2 = inlet.get_time_correction()
        assert tc == tc2
    finally:
        inlet.close()


def test_pull_after_outlet_stops_does_not_hang_or_crash(mock_outlet):
    inlet = _connect_inlet()
    try:
        time.sleep(0.3)
        _ = inlet.get_eeg_chunk(max_samples=32, timeout=1.0)
        mock_outlet.stop()
        # Drain any remaining buffered samples.
        deadline = time.monotonic() + 2.0
        while time.monotonic() < deadline:
            chunk = inlet.get_eeg_chunk(max_samples=64, timeout=0.5)
            if chunk.shape[1] == 0:
                break
        # The next pull, after the outlet is gone, must return empty within
        # the configured timeout — not hang and not raise.
        t0 = time.monotonic()
        chunk = inlet.get_eeg_chunk(max_samples=64, timeout=0.5)
        elapsed = time.monotonic() - t0
        assert chunk.shape == (8, 0)
        assert elapsed < 1.5, f"pull blocked for {elapsed:.2f}s past its timeout"
    finally:
        inlet.close()


def test_stream_not_found_raises_within_timeout():
    t0 = time.monotonic()
    with pytest.raises(StreamNotFoundError):
        EEGInlet(timeout=1.0)
    elapsed = time.monotonic() - t0
    # Must not return immediately (proves we actually waited) and must not
    # hang well past the timeout.
    assert 0.5 <= elapsed <= 2.5, f"resolve elapsed {elapsed:.2f}s outside expected window"
