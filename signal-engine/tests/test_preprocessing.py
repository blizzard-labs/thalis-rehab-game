"""Tests for the preprocessing package (filters, spatial, artifact gating).

Synthetic signals are generated directly with numpy here — the offline/causal
filter math and the gates are pure-array operations that don't need a live LSL
stream, so direct generation is simpler and deterministic.
"""

from __future__ import annotations

import numpy as np
import pytest
from scipy.signal import welch

from preprocessing.filters import (
    CausalFilterChain,
    bandpass_filter_offline,
    notch_filter_offline,
)
from preprocessing.spatial import common_average_reference
from preprocessing.artifact import AmplitudeGate, MovementGate

FS = 250
N_CH = 8
DURATION_S = 10
N = FS * DURATION_S


def _band_power(x: np.ndarray, fs: int, f0: float, halfwidth: float = 0.6) -> float:
    """Integrated PSD power within [f0-halfwidth, f0+halfwidth] via Welch."""
    freqs, psd = welch(x, fs=fs, nperseg=fs * 5)
    mask = (freqs >= f0 - halfwidth) & (freqs <= f0 + halfwidth)
    return float(np.trapezoid(psd[mask], freqs[mask]))


def _db(before: float, after: float) -> float:
    """Reduction in dB: positive means `after` has less power than `before`."""
    return 10.0 * np.log10(before / after)


@pytest.fixture
def rng() -> np.random.Generator:
    return np.random.default_rng(0)


@pytest.fixture
def t() -> np.ndarray:
    return np.arange(N) / FS


# ---------------------------------------------------------------------------
# Offline filters


def test_notch_removes_60hz_preserves_10hz(rng, t):
    """notch_filter_offline kills 60 Hz line noise but leaves 10 Hz intact."""
    sine10 = 10.0 * np.sin(2 * np.pi * 10 * t)
    line60 = 10.0 * np.sin(2 * np.pi * 60 * t)
    data = np.empty((N_CH, N))
    for ch in range(N_CH):
        data[ch] = sine10 + line60 + rng.standard_normal(N)

    filtered = notch_filter_offline(data, fs=FS, freq=60.0, q=30.0)

    ch0_before, ch0_after = data[0], filtered[0]
    p60_before = _band_power(ch0_before, FS, 60.0)
    p60_after = _band_power(ch0_after, FS, 60.0)
    p10_before = _band_power(ch0_before, FS, 10.0)
    p10_after = _band_power(ch0_after, FS, 10.0)

    assert _db(p60_before, p60_after) >= 20.0
    assert abs(_db(p10_before, p10_after)) < 1.0


def test_bandpass_removes_drift_and_70hz_preserves_10hz(rng, t):
    """bandpass_filter_offline (1-40 Hz) removes 0.2 Hz drift and 70 Hz."""
    drift = 20.0 * np.sin(2 * np.pi * 0.2 * t)
    sine10 = 10.0 * np.sin(2 * np.pi * 10 * t)
    high70 = 10.0 * np.sin(2 * np.pi * 70 * t)
    data = np.empty((N_CH, N))
    for ch in range(N_CH):
        data[ch] = drift + sine10 + high70 + rng.standard_normal(N)

    filtered = bandpass_filter_offline(data, fs=FS, low=1.0, high=40.0, order=4)

    before, after = data[0], filtered[0]
    assert _db(_band_power(before, FS, 0.2), _band_power(after, FS, 0.2)) >= 20.0
    assert _db(_band_power(before, FS, 70.0), _band_power(after, FS, 70.0)) >= 20.0
    assert abs(_db(_band_power(before, FS, 10.0), _band_power(after, FS, 10.0))) < 1.0


# ---------------------------------------------------------------------------
# Causal streaming filter


def test_causal_chain_chunked_matches_single_call(rng):
    """Chunked processing through one CausalFilterChain == single-call output.

    This is the persistent-state continuity check: each chunk must carry zi
    forward so chunk boundaries introduce no transient.
    """
    n = 5000
    signal = rng.standard_normal((1, n))

    whole = CausalFilterChain(fs=FS).process_chunk(signal)

    chained = CausalFilterChain(fs=FS)
    pieces = [chained.process_chunk(signal[:, i : i + 50]) for i in range(0, n, 50)]
    chunked = np.concatenate(pieces, axis=1)

    assert chunked.shape == whole.shape
    assert np.max(np.abs(chunked - whole)) < 1e-6


# ---------------------------------------------------------------------------
# Spatial filter


def test_car_removes_common_dc_offset_preserves_relative(rng):
    base = rng.standard_normal((N_CH, 500))
    offset = base + 42.0  # identical DC offset on all channels

    referenced = common_average_reference(offset)
    referenced_base = common_average_reference(base)

    # Common offset fully removed: CAR of offset data == CAR of base data.
    assert np.allclose(referenced, referenced_base)
    # Per-timepoint mean across channels is zero after CAR.
    assert np.allclose(referenced.mean(axis=0), 0.0, atol=1e-12)
    # Relative differences between channels preserved.
    assert np.allclose(offset[0] - offset[1], referenced[0] - referenced[1])


# ---------------------------------------------------------------------------
# Amplitude gate


def test_amplitude_gate_flags_spike(rng):
    clean = rng.standard_normal((N_CH, FS)) * 5.0  # ~20 µV p2p noise
    gate = AmplitudeGate(threshold_uv=100.0)
    assert gate.is_clean(clean) is True

    contaminated = clean.copy()
    contaminated[2, 100] += 150.0  # single 150 µV spike on one channel
    assert gate.is_clean(contaminated) is False


def test_amplitude_gate_only_checks_configured_channels(rng):
    clean = rng.standard_normal((N_CH, FS)) * 5.0
    clean[7, 50] += 300.0  # big spike, but on an unchecked channel
    gate = AmplitudeGate(threshold_uv=100.0, channels=[1, 2, 3])
    assert gate.is_clean(clean) is True


# ---------------------------------------------------------------------------
# Movement gate


def test_movement_gate_still_vs_spike(rng):
    # Flat IMU: accel z ~1g, tiny noise; gyro ~0.
    still = rng.standard_normal((6, FS)) * 0.01
    still[2] += 1.0  # accel Z gravity bias (constant -> no variance)
    gate = MovementGate()
    assert gate.is_head_still(still) is True

    moving = still.copy()
    moving[0, FS // 2] += 5.0  # large accel X spike
    assert gate.is_head_still(moving) is False
