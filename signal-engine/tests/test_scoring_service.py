"""Integration tests for the real-time ScoringService loop.

Driven entirely by the MockUnicornOutlet LSL stream — no headset required.
Runs in band-power-only mode (online_classifier=None): classifier correctness
is already covered in test_classifier.py, so these tests focus on the loop,
the ring buffer, artifact gating, and EMA smoothing.
"""

from __future__ import annotations

import queue
import time

import numpy as np
import pytest

from acquisition.lsl_inlet import EEGInlet
from acquisition.mock_eeg_outlet import DEFAULT_EEG_LABELS, MockUnicornOutlet
from features.erd import ERDCalculator
from preprocessing.artifact import AmplitudeGate, MovementGate
from preprocessing.filters import CausalFilterChain
from preprocessing.spatial import common_average_reference
from scoring.intent_score import IntentScoreEngine, IntentScoreResult
from scoring.scoring_service import ScoringService

FS = 250


# --------------------------------------------------------------------------- helpers

def _drain(inlet: EEGInlet) -> None:
    while inlet.get_eeg_chunk(max_samples=10000, timeout=0.0).shape[1] > 0:
        pass


def _pull_for(inlet: EEGInlet, seconds: float) -> np.ndarray:
    deadline = time.monotonic() + seconds
    parts: list[np.ndarray] = []
    while time.monotonic() < deadline:
        chunk = inlet.get_eeg_chunk(max_samples=250, timeout=0.2)
        if chunk.shape[1] > 0:
            parts.append(chunk)
    if not parts:
        return np.empty((8, 0), dtype=np.float64)
    return np.concatenate(parts, axis=1)


def make_scoring_service(mock_outlet: MockUnicornOutlet, **overrides):
    """Build the full dependency chain and return (service, queue, inlet).

    Overrides: output_queue, classifier, classifier_reliable, ema_alpha,
    update_rate_hz, chunk_size, amp_threshold, movement_threshold.
    """
    classifier = overrides.get("classifier", None)
    classifier_reliable = overrides.get("classifier_reliable", False)
    ema_alpha = overrides.get("ema_alpha", 0.15)
    update_rate_hz = overrides.get("update_rate_hz", 20.0)
    chunk_size = overrides.get("chunk_size", 12)
    amp_threshold = overrides.get("amp_threshold", 100.0)
    movement_threshold = overrides.get("movement_threshold", 0.05)
    out_q = overrides.get("output_queue", None) or queue.Queue()

    inlet = EEGInlet(timeout=5.0, pull_timeout=1.0)
    eeg_labels = inlet.eeg_labels

    # ERD baseline: calibrate on 2 s of rest, preprocessed exactly like the
    # scoring ring buffer (causal filter + CAR) so rest ERD sits near 0.
    _drain(inlet)
    baseline_raw = _pull_for(inlet, 2.0)
    assert baseline_raw.shape[1] > FS, "did not capture a full baseline"
    proc = common_average_reference(
        CausalFilterChain(fs=FS).process_chunk(baseline_raw)
    )
    erd_calc = ERDCalculator(channel_labels=["C3", "C4"], fs=FS)
    erd_calc.calibrate_baseline(proc, eeg_labels)

    engine = IntentScoreEngine(
        eeg_channel_labels=eeg_labels,
        erd_calculator=erd_calc,
        online_classifier=classifier,
        classifier_reliable=classifier_reliable,
        fs=FS,
        ema_alpha=ema_alpha,
    )
    service = ScoringService(
        eeg_inlet=inlet,
        amplitude_gate=AmplitudeGate(threshold_uv=amp_threshold, fs=FS),
        movement_gate=MovementGate(threshold=movement_threshold, fs=FS),
        causal_filter=CausalFilterChain(fs=FS),
        intent_score_engine=engine,
        output_queue=out_q,
        update_rate_hz=update_rate_hz,
        chunk_size=chunk_size,
    )
    return service, out_q, inlet


def _consume(out_q: "queue.Queue[IntentScoreResult]", duration_s: float):
    """Drain the queue for `duration_s`, tagging each result with read-time."""
    deadline = time.monotonic() + duration_s
    tagged: list[tuple[float, IntentScoreResult]] = []
    while time.monotonic() < deadline:
        try:
            res = out_q.get(timeout=0.05)
        except queue.Empty:
            continue
        tagged.append((time.monotonic(), res))
    return tagged


@pytest.fixture
def mock_outlet():
    outlet = MockUnicornOutlet(seed=7)
    outlet.start()
    time.sleep(0.3)  # let LSL discovery settle
    try:
        yield outlet
    finally:
        outlet.stop()


# --------------------------------------------------------------------------- tests

def test_smoke_produces_continuous_stream(mock_outlet):
    service, out_q, inlet = make_scoring_service(mock_outlet)
    try:
        service.start()
        tagged = _consume(out_q, 3.0)
    finally:
        service.stop()
        inlet.close()

    assert len(tagged) >= 40, f"expected >=40 results in 3s, got {len(tagged)}"
    assert all(isinstance(r, IntentScoreResult) for _, r in tagged)
    assert all(0.0 <= r.intent_score <= 100.0 for _, r in tagged)


def test_artifact_spike_is_suppressed(mock_outlet):
    service, out_q, inlet = make_scoring_service(mock_outlet)
    try:
        service.start()
        # Let a clean baseline accumulate, then a 200 µV spike (~0.8 s) on all
        # EEG channels. The 1 s raw gate window keeps it "dirty" for ~1 s after.
        time.sleep(0.6)
        mock_outlet.inject_spike(amplitude_uv=200.0, n_samples=200, start_in_s=0.0)
        tagged = _consume(out_q, 2.0)
    finally:
        service.stop()
        inlet.close()

    flags = [r.is_artifact for _, r in tagged]
    assert any(not f for f in flags), "expected some clean frames before the spike"
    assert any(flags), "spike should have produced is_artifact=True frames"

    # Artifact frames carry no sub-scores and hold the previous IntentScore.
    for _, r in tagged:
        if r.is_artifact:
            assert r.erd_score is None and r.classifier_score is None


def test_ema_smoothing_is_visible(mock_outlet):
    # Strong, sustained ERD step well after the ring buffer has filled.
    onset_delay = 2.0
    service, out_q, inlet = make_scoring_service(mock_outlet)
    try:
        service.start()
        t_start = time.monotonic()
        for ch in ("C3", "C4"):
            mock_outlet.inject_erd(
                channel_label=ch,
                band=(8.0, 12.0),
                start_in_s=onset_delay,
                duration_s=4.0,
                suppression_fraction=0.9,
            )
        tagged = _consume(out_q, onset_delay + 1.2)
    finally:
        service.stop()
        inlet.close()

    onset = t_start + onset_delay

    def intent_at(target_mono: float) -> float:
        # Nearest result at/after the target time.
        cands = [(t, r) for t, r in tagged if t >= target_mono and not r.is_artifact]
        assert cands, f"no result near t={target_mono - onset:.2f}s"
        return cands[0][1].intent_score

    # Anchor to the observed rise, not the wall-clock onset: there is an
    # inherent lag (causal-filter + 1 s ERD window fill) before the ERD step
    # shows up. We still test the EMA's smoothing time-constant: the score
    # 100 ms into the rise must be well below where it is 500 ms in.
    rising = [
        t for t, r in tagged
        if not r.is_artifact and r.intent_score > 1.0 and t >= onset - 0.2
    ]
    assert rising, "IntentScore never rose after the ERD step was injected"
    rise_t = rising[0]

    early = intent_at(rise_t + 0.1)   # ~100 ms into the rise
    late = intent_at(rise_t + 0.5)    # ~500 ms into the rise

    assert late > 5.0, f"expected ERD to drive IntentScore up, got late={late:.1f}"
    assert early < 0.8 * late, (
        f"EMA smoothing not visible: early={early:.1f} should be < 80% of "
        f"late={late:.1f}"
    )


def test_stop_joins_promptly(mock_outlet):
    service, out_q, inlet = make_scoring_service(mock_outlet)
    try:
        service.start()
        time.sleep(0.5)
        t0 = time.monotonic()
        service.stop()
        elapsed = time.monotonic() - t0
    finally:
        inlet.close()

    assert elapsed < 2.0, f"stop() took {elapsed:.2f}s (should be well under 2s)"
    assert service._thread is None


def test_full_queue_drops_without_blocking(mock_outlet):
    out_q: "queue.Queue[IntentScoreResult]" = queue.Queue(maxsize=1)
    service, out_q, inlet = make_scoring_service(mock_outlet, output_queue=out_q)
    try:
        service.start()
        time.sleep(1.0)  # never consume -> queue stays full
        service.stop()
        end = time.time()
    finally:
        inlet.close()

    # No exception means the loop dropped rather than blocked. The lone retained
    # item must be recent (the loop keeps replacing it with the latest score).
    item = out_q.get_nowait()
    assert isinstance(item, IntentScoreResult)
    assert end - item.timestamp < 0.2, (
        f"retained item is stale by {end - item.timestamp:.3f}s"
    )


def test_latest_quality_snapshot_after_run(mock_outlet):
    """ScoringService exposes a per-channel contact-quality + trace snapshot
    for the console C2 setup screen (one entry per EEG channel, MI traces)."""
    service, _q, inlet = make_scoring_service(mock_outlet)
    try:
        service.start()
        deadline = time.monotonic() + 3.0
        snap = None
        while time.monotonic() < deadline:
            snap = service.latest_quality()
            if snap is not None:
                break
            time.sleep(0.05)
        assert snap is not None, "no quality snapshot produced"
        assert snap["fs"] == FS
        labels = [c["label"] for c in snap["channels"]]
        assert labels == inlet.eeg_labels
        for c in snap["channels"]:
            assert c["quality"] in ("good", "check", "poor")
        assert "C3" in snap["trace"] and len(snap["trace"]["C3"]) > 0
        assert set(snap["trace"].keys()) <= {"C3", "Cz", "C4"}
    finally:
        service.stop()
        inlet.close()


# ------------------------------------------------------- V2-2b kinematic source

def test_fresh_kinematic_forwarded_stale_dropped():
    from vision.kinematic_worker import LatestKinematic
    from vision.types import KinematicResult

    src = LatestKinematic()
    # Exercise the staleness gate directly for determinism (no live loop needed).
    svc = ScoringService.__new__(ScoringService)
    svc._kinematic_source = src
    svc.kinematic_staleness_s = 0.3

    src.set(KinematicResult(70.0, 0.0, False, True, True, time.time() - 5.0))  # stale
    assert svc._read_kinematic() is None

    src.set(KinematicResult(70.0, 0.0, False, True, True, time.time()))        # fresh
    assert svc._read_kinematic() is not None
