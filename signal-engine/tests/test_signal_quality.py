"""Unit tests for per-channel contact-quality estimation (console C2 setup).

Pure-numpy logic: given a raw (pre-filter) EEG window, classify each electrode's
contact quality from its peak-to-peak amplitude and extract a downsampled trace
for the MI channels the clinician watches (C3/Cz/C4). No LSL / no headset.
"""

from __future__ import annotations

import numpy as np

from scoring.signal_quality import (
    classify_p2p,
    compute_channel_quality,
    extract_trace,
)


def test_classify_p2p_thresholds():
    # Well below good_max -> good; between -> check; above check_max -> poor.
    assert classify_p2p(10.0, good_max=50.0, check_max=120.0) == "good"
    assert classify_p2p(80.0, good_max=50.0, check_max=120.0) == "check"
    assert classify_p2p(200.0, good_max=50.0, check_max=120.0) == "poor"


def test_classify_p2p_flat_channel_is_poor():
    # A dead/disconnected electrode reads ~0 p2p; that is NOT good contact.
    assert classify_p2p(0.0, good_max=50.0, check_max=120.0, flat_min=1.0) == "poor"


def test_compute_channel_quality_one_entry_per_label_with_p2p():
    labels = ["Fz", "C3", "Cz", "C4"]
    window = np.zeros((4, 100), dtype=np.float64)
    # C3 row swings 0..30 (p2p 30 -> good), C4 swings 0..200 (p2p 200 -> poor).
    window[1] = np.linspace(0, 30, 100)
    window[3] = np.linspace(0, 200, 100)
    window[0] = np.linspace(0, 10, 100)  # Fz good
    # Cz left flat -> poor.

    out = compute_channel_quality(window, labels, good_max=50.0, check_max=120.0)

    assert [c["label"] for c in out] == labels
    by = {c["label"]: c for c in out}
    assert by["C3"]["quality"] == "good"
    assert by["C4"]["quality"] == "poor"
    assert by["Cz"]["quality"] == "poor"  # flat
    assert by["C3"]["p2p"] == 30.0


def test_extract_trace_returns_downsampled_rows_for_requested_labels():
    labels = ["Fz", "C3", "Cz", "C4"]
    window = np.arange(4 * 200, dtype=np.float64).reshape(4, 200)

    trace = extract_trace(window, labels, want=["C3", "Cz", "C4"], max_points=50)

    assert set(trace.keys()) == {"C3", "Cz", "C4"}
    assert all(len(v) <= 50 for v in trace.values())
    # C3 is row index 1; first downsampled point is the row's first sample.
    assert trace["C3"][0] == window[1, 0]


def test_extract_trace_skips_unknown_labels():
    labels = ["Fz", "C3"]
    window = np.zeros((2, 10), dtype=np.float64)
    trace = extract_trace(window, labels, want=["C3", "C4"], max_points=10)
    assert "C4" not in trace
    assert "C3" in trace
