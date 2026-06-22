"""Hardware-in-the-loop tests against a REAL g.tec Unicorn Hybrid Black stream.

Unlike test_erd.py (which spins up MockUnicornOutlet), these talk to an actual
Unicorn streaming through the Unicorn Suite LSL bridge. They validate
acquisition and measure end-to-end latency of the live scoring path:

    Unicorn HW -> Unicorn LSL bridge -> pylsl
                -> CausalFilterChain -> CommonAverageReference -> ERDCalculator

MVP latency target: p95 of the acquisition-to-feature path < 250 ms.

WHY NOT EEGInlet
----------------
The real bridge (verified with lsl_diagnostic.py) advertises:

    Name: 'UN-2024.06.42'  Type: 'Data'  Channels: 17  (NO <channels> XML labels)

EEGInlet resolves by type=="EEG" and slices channels BY LABEL parsed from XML.
This stream has neither, so EEGInlet finds nothing. The Unicorn data layout is
instead FIXED and POSITIONAL (confirmed against archive/unicorneeg/stream.py):

    0..7  EEG  [Fz, C3, Cz, C4, Pz, PO7, Oz, PO8]
    8..13 IMU  [AccX, AccY, AccZ, Gyro1, Gyro2, Gyro3]
    14..16     [Battery, Counter, Validation]

So we resolve by NAME, pull raw, and slice positionally here. Raw EEG carries a
large electrode DC offset (values ~ -3.8e5 µV); the 1-40 Hz causal bandpass
removes it, which is why plausibility is asserted AFTER filtering.

OPT-IN
------
Only runs when the device is streaming and you set:

    export THALIS_LIVE_UNICORN=1

Optional knobs:
    THALIS_UNICORN_STREAM_NAME   default 'UN-2024.06.42'
    THALIS_LATENCY_BUDGET_MS     default 250

Run just these:
    THALIS_LIVE_UNICORN=1 conda run -n eeg --no-capture-output \
        python -m pytest signal-engine/tests/test_live_unicorn.py -v -s
"""

from __future__ import annotations

import os
import statistics
import time

import numpy as np
import pytest
from pylsl import StreamInlet, local_clock, resolve_byprop

from features.erd import ERDCalculator, laterality_index
from preprocessing.filters import CausalFilterChain, DCOffsetRemover
from preprocessing.spatial import common_average_reference

FS = 250
LATENCY_BUDGET_MS = float(os.environ.get("THALIS_LATENCY_BUDGET_MS", "250"))
STREAM_NAME = os.environ.get("THALIS_UNICORN_STREAM_NAME", "UN-2024.06.42")

# Fixed Unicorn positional layout (no XML labels on this bridge).
EEG_LABELS = ["Fz", "C3", "Cz", "C4", "Pz", "PO7", "Oz", "PO8"]
EEG_SLICE = slice(0, 8)
IMU_SLICE = slice(8, 14)

# Whole-file gate: skip unless explicitly opted in to live hardware.
pytestmark = pytest.mark.skipif(
    os.environ.get("THALIS_LIVE_UNICORN") != "1",
    reason="set THALIS_LIVE_UNICORN=1 with a real Unicorn streaming to run live tests",
)


# ---------------------------------------------------------------------------
# Minimal positional inlet for this bridge


class _LiveUnicorn:
    """Thin pylsl wrapper: resolve by name, pull raw chunks WITH timestamps."""

    def __init__(self, name: str, timeout: float = 10.0):
        streams = resolve_byprop("name", name, timeout=timeout)
        if not streams:
            raise RuntimeError(f"no LSL stream named {name!r} within {timeout}s")
        self._inlet = StreamInlet(streams[0], max_chunklen=0)
        info = self._inlet.info()
        self.srate = info.nominal_srate()
        self.n_channels = info.channel_count()

    def pull(self, max_samples: int, timeout: float):
        """Return (data[n_channels, n_samples], timestamps[list])."""
        samples, ts = self._inlet.pull_chunk(timeout=timeout, max_samples=max_samples)
        if not samples:
            return np.empty((self.n_channels, 0), dtype=np.float64), []
        return np.asarray(samples, dtype=np.float64).T.copy(), ts

    def time_correction(self) -> float:
        return self._inlet.time_correction(timeout=1.0)

    def drain(self) -> None:
        while self.pull(10000, 0.0)[0].shape[1] > 0:
            pass

    def close(self) -> None:
        self._inlet.close_stream()


@pytest.fixture(scope="module")
def dev():
    try:
        d = _LiveUnicorn(STREAM_NAME)
    except RuntimeError as exc:
        pytest.skip(str(exc))
    yield d
    d.close()


def _collect(dev: _LiveUnicorn, seconds: float, max_samples: int = 125) -> np.ndarray:
    """Collect `seconds` of all-channel data -> [n_channels, n_samples]."""
    deadline = time.monotonic() + seconds
    parts: list[np.ndarray] = []
    while time.monotonic() < deadline:
        data, _ = dev.pull(max_samples, timeout=0.2)
        if data.shape[1] > 0:
            parts.append(data)
    if not parts:
        return np.empty((dev.n_channels, 0), dtype=np.float64)
    return np.concatenate(parts, axis=1)


def _percentile(values: list[float], pct: float) -> float:
    if not values:
        return float("nan")
    s = sorted(values)
    k = max(0, min(len(s) - 1, int(round((pct / 100.0) * (len(s) - 1)))))
    return s[k]


# ---------------------------------------------------------------------------
# 1. Acquisition validation


def test_stream_metadata_well_formed(dev: _LiveUnicorn):
    """~250 Hz, 17 channels (8 EEG + 6 IMU + 3 aux)."""
    assert dev.srate == pytest.approx(FS, abs=1.0), f"expected ~{FS} Hz, got {dev.srate}"
    assert dev.n_channels == 17, f"expected 17 Unicorn channels, got {dev.n_channels}"
    print(f"\nstream={STREAM_NAME!r} srate={dev.srate} channels={dev.n_channels}")


def test_eeg_data_is_live(dev: _LiveUnicorn):
    """EEG sub-stream is LIVE: finite, non-flat, and not railed.

    NOTE: This is a liveness check, not a signal-quality check. With the cap
    off-head the channels are floating-electrode noise/drift (mV-scale), so we
    only assert the data is real and moving — NOT a clinical µV amplitude. The
    real amplitude bound (10-100 µV on scalp) is validated on-head; see
    test_signal_quality_on_head_TODO.
    """
    chain = CausalFilterChain(fs=FS, low=1.0, high=40.0, notch_freq=60.0)
    dev.drain()
    raw = _collect(dev, 3.0)
    assert raw.shape[1] > 2 * FS, f"captured only {raw.shape[1]} samples in 3s"
    eeg = raw[EEG_SLICE]
    assert eeg.shape[0] == 8
    assert np.all(np.isfinite(eeg)), "non-finite samples in EEG"

    # Remove electrode DC offset (production front-end), then causal-filter;
    # drop 1 s settle. Single chunk -> DCOffsetRemover latches this chunk's mean.
    filtered = chain.process_chunk(DCOffsetRemover().process_chunk(eeg))[:, FS:]
    stds = filtered.std(axis=1)
    # Majority of channels must be live. A single dead/railed electrode (std==0,
    # common off-head — here OZ) is tolerated; per-channel quality is an on-head
    # concern. C3/C4 (the ERD channels) being live is what actually matters.
    live = stds > 1e-3
    dead = [EEG_LABELS[i] for i in range(8) if not live[i]]
    assert live.sum() >= 6, f"too many flat/dead EEG channels: dead={dead}, std={stds}"
    for ch in ("C3", "C4"):
        assert live[EEG_LABELS.index(ch)], f"{ch} (ERD channel) is flat/dead"
    # Sanity only: not stuck at the ADC rail. Generous bound passes off-head
    # drift; would still catch a hard-railed / unit-broken stream.
    med_std = float(np.median(stds))
    assert med_std < 5e4, f"EEG looks railed/broken, median std={med_std:.0f} µV"
    print(f"\nraw EEG p2p={float(eeg.max() - eeg.min()):.0f} µV (DC offset) -> "
          f"filtered median std={med_std:.1f} µV, per-ch std={np.round(stds, 1)}, "
          f"dead={dead or 'none'} [off-head: liveness only]")


def test_imu_data_is_live(dev: _LiveUnicorn):
    """IMU sub-channels (accel xyz + gyro xyz) pull cleanly and are finite."""
    dev.drain()
    raw = _collect(dev, 1.0)
    imu = raw[IMU_SLICE]
    assert imu.shape[0] == 6, f"expected 6 IMU rows, got {imu.shape[0]}"
    assert imu.shape[1] > 0, "no IMU samples received"
    assert np.all(np.isfinite(imu)), "non-finite IMU samples"
    print(f"\nimu samples={imu.shape[1]} accel/gyro ranges="
          f"{np.round(imu.min(axis=1), 2)}..{np.round(imu.max(axis=1), 2)}")


# ---------------------------------------------------------------------------
# 2. Latency of the live scoring path


def test_acquisition_to_feature_latency_p95(dev: _LiveUnicorn):
    """End-to-end latency: newest acquired sample -> feature computed.

    Each tick: pull a small raw chunk (keep its LSL timestamps), run the causal
    real-time path (notch+bandpass -> CAR), and once a full analysis window has
    accumulated also compute ERD + laterality. Latency is measured against the
    NEWEST sample's LSL timestamp mapped into the local clock via time
    correction, so it captures transport + buffering + compute (not chunk
    duration). Asserts p95 < LATENCY_BUDGET_MS (default 250 ms).
    """
    chain = CausalFilterChain(fs=FS, low=1.0, high=40.0, notch_freq=60.0)
    calc = ERDCalculator(channel_labels=["C3", "C4"], fs=FS, window_sec=1.0)
    tc = dev.time_correction()

    # 3 s rest baseline: also calibrates the DC offset and warms the filter.
    dc_rem = DCOffsetRemover()
    dev.drain()
    baseline = _collect(dev, 3.0)[EEG_SLICE]
    assert baseline.shape[1] > 2 * FS, "did not capture a full 3s baseline"
    dc_rem.calibrate(baseline)
    calc.calibrate_baseline(
        common_average_reference(chain.process_chunk(dc_rem.process_chunk(baseline))), EEG_LABELS
    )

    window_samples = int(FS * calc.window_sec)
    buf = np.empty((8, 0), dtype=np.float64)
    latencies_ms: list[float] = []   # newest-sample -> feature
    compute_ms: list[float] = []     # pipeline-only cost
    last_tc = time.monotonic()

    dev.drain()
    deadline = time.monotonic() + 30.0
    while time.monotonic() < deadline:
        data, timestamps = dev.pull(max_samples=125, timeout=0.2)
        if data.shape[1] == 0:
            continue
        eeg = data[EEG_SLICE]
        newest_ts = timestamps[-1]

        t0 = local_clock()
        filtered = chain.process_chunk(dc_rem.process_chunk(eeg))
        reref = common_average_reference(filtered)
        buf = np.concatenate([buf, reref], axis=1)[:, -window_samples:]
        if buf.shape[1] >= window_samples:
            erd = calc.compute_erd(buf, EEG_LABELS)
            _ = laterality_index(erd, "C3", "C4", "mu")
        t_done = local_clock()

        if time.monotonic() - last_tc > 5.0:  # refresh clock offset periodically
            tc = dev.time_correction()
            last_tc = time.monotonic()
        latencies_ms.append((t_done - (newest_ts + tc)) * 1000.0)
        compute_ms.append((t_done - t0) * 1000.0)

    assert len(latencies_ms) > 20, f"too few latency samples: {len(latencies_ms)}"

    p50 = _percentile(latencies_ms, 50)
    p95 = _percentile(latencies_ms, 95)
    print(
        "\n--- acquisition-to-feature latency (ms) ---"
        f"\n  ticks   = {len(latencies_ms)}"
        f"\n  mean    = {statistics.mean(latencies_ms):.1f}"
        f"\n  std     = {statistics.pstdev(latencies_ms):.1f}"
        f"\n  p50     = {p50:.1f}"
        f"\n  p95     = {p95:.1f}"
        f"\n  max     = {max(latencies_ms):.1f}"
        f"\n  budget  = {LATENCY_BUDGET_MS:.0f}"
        f"\n--- pipeline compute only (ms) ---"
        f"\n  mean    = {statistics.mean(compute_ms):.2f}"
        f"\n  p95     = {_percentile(compute_ms, 95):.2f}"
    )
    assert p95 < LATENCY_BUDGET_MS, (
        f"p95 latency {p95:.1f} ms exceeds budget {LATENCY_BUDGET_MS:.0f} ms"
    )


# ---------------------------------------------------------------------------
# 3. End-to-end pipeline shape on live data (no magnitude assertions at rest)


def test_pipeline_end_to_end_on_live_data(dev: _LiveUnicorn):
    """Full chain runs on live data and yields well-formed, finite features.

    STRUCTURE check only: filter -> CAR -> ERD -> laterality executes against
    real samples and returns finite numbers with the expected keys. Magnitude
    is NOT asserted (off-head it's noise; on-head it needs a motor-imagery
    protocol -> test_signal_quality_on_head_TODO).
    """
    chain = CausalFilterChain(fs=FS, low=1.0, high=40.0, notch_freq=60.0)
    calc = ERDCalculator(channel_labels=["C3", "C4"], fs=FS, window_sec=1.0)

    dc_rem = DCOffsetRemover()
    dev.drain()
    baseline = _collect(dev, 3.0)[EEG_SLICE]
    assert baseline.shape[1] > 2 * FS
    dc_rem.calibrate(baseline)
    calc.calibrate_baseline(
        common_average_reference(chain.process_chunk(dc_rem.process_chunk(baseline))), EEG_LABELS
    )

    dev.drain()
    task = _collect(dev, 2.0)[EEG_SLICE]
    assert task.shape[1] > FS
    erd = calc.compute_erd(
        common_average_reference(chain.process_chunk(dc_rem.process_chunk(task))), EEG_LABELS
    )

    for ch in ("C3", "C4"):
        for band in ("mu", "beta"):
            assert np.isfinite(erd[ch][band]), f"ERD {ch}/{band} not finite"
    li = laterality_index(erd, "C3", "C4", "mu")
    assert np.isfinite(li)
    print(f"\nlive ERD={ {k: {b: round(v, 1) for b, v in d.items()} for k, d in erd.items()} } "
          f"LI={li:.3f} [off-head: structure only]")


# ---------------------------------------------------------------------------
# 4. Deferred: real signal-quality + ERD-magnitude validation (needs cap worn)


@pytest.mark.skip(reason="run on-head with a motor-imagery protocol; see docstring")
def test_signal_quality_on_head_TODO():
    """ON-HEAD validation — un-skip and run while wearing the cap.

    Protocol (self-paced motor imagery):
      1. Fit cap, confirm impedance / signal in Unicorn Suite first.
      2. 30 s eyes-open rest -> calibrate baseline (this is the real baseline).
      3. 5 x [10 s rest -> 10 s imagine LEFT-hand squeeze]; repeat for RIGHT.

    Assert (on-head expectations):
      * resting filtered EEG median std in ~5-100 µV (real scalp amplitude),
      * LEFT-hand MI -> C3 mu ERD ~20-40% (contralateral desync),
      * RIGHT-hand MI -> C4 mu ERD ~20-40%; laterality_index flips sign,
      * un-imagined contralateral channel stays near 0.
    """
    pytest.skip("placeholder — implement against on-head MI protocol")
