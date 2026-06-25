"""Per-channel contact-quality estimation for the clinician C2 setup screen.

The console's "Setup & signal-quality check" (specsv2 wireframe C2) needs two
things the IntentScore frame doesn't carry: (1) a per-electrode contact verdict
the clinician reads in plain language (good / check / poor — never raw µV, per
the wireframe's "no raw µV reading needed"), and (2) a short live trace of the
MI channels (C3/Cz/C4) for the scrolling waveform.

Both are derived from the same RAW (pre-filter, pre-reference) window the
AmplitudeGate already keeps — contact problems show up as amplitude, before CAR
removes common-mode and the bandpass attenuates them. This module is pure numpy
so it unit-tests without LSL or a headset.
"""

from __future__ import annotations

import numpy as np

QUALITY_GOOD = "good"
QUALITY_CHECK = "check"
QUALITY_POOR = "poor"


def classify_p2p(
    p2p_uv: float,
    good_max: float = 50.0,
    check_max: float = 120.0,
    flat_min: float = 1.0,
) -> str:
    """Map a channel's peak-to-peak amplitude (µV) to a contact verdict.

    A near-zero swing (< ``flat_min``) means a dead / disconnected electrode,
    which is *poor* contact, not clean signal. Otherwise low swing is good,
    moderate is check, and a large swing (artifact / floating lead) is poor.
    """
    if p2p_uv < flat_min:
        return QUALITY_POOR
    if p2p_uv <= good_max:
        return QUALITY_GOOD
    if p2p_uv <= check_max:
        return QUALITY_CHECK
    return QUALITY_POOR


def compute_channel_quality(
    window: np.ndarray,
    labels: list[str],
    good_max: float = 50.0,
    check_max: float = 120.0,
    flat_min: float = 1.0,
) -> list[dict]:
    """One contact verdict per electrode from a ``[n_ch, n_samp]`` raw window.

    Returns a list aligned to ``labels``: ``{"label", "p2p", "quality"}``.
    """
    window = np.asarray(window, dtype=np.float64)
    if window.ndim != 2:
        raise ValueError(f"expected [n_channels, n_samples], got {window.shape}")

    if window.shape[1] == 0:
        return [{"label": lbl, "p2p": 0.0, "quality": QUALITY_POOR} for lbl in labels]

    p2p = window.max(axis=1) - window.min(axis=1)
    out: list[dict] = []
    for i, lbl in enumerate(labels):
        value = float(p2p[i]) if i < window.shape[0] else 0.0
        out.append(
            {
                "label": lbl,
                "p2p": value,
                "quality": classify_p2p(value, good_max, check_max, flat_min),
            }
        )
    return out


def extract_trace(
    window: np.ndarray,
    labels: list[str],
    want: list[str],
    max_points: int = 120,
) -> dict[str, list[float]]:
    """Downsampled per-channel trace for the requested labels.

    Picks each wanted label's row, decimates it to at most ``max_points`` evenly
    spaced samples (cheap stride decimation — this is a setup-time visual, not a
    measurement), and returns ``{label: [values]}``. Unknown labels are skipped.
    """
    window = np.asarray(window, dtype=np.float64)
    index = {lbl: i for i, lbl in enumerate(labels)}
    n = window.shape[1] if window.ndim == 2 else 0
    if n == 0:
        return {lbl: [] for lbl in want if lbl in index}

    step = max(1, int(np.ceil(n / max_points)))
    trace: dict[str, list[float]] = {}
    for lbl in want:
        i = index.get(lbl)
        if i is None or i >= window.shape[0]:
            continue
        trace[lbl] = [float(v) for v in window[i, ::step][:max_points]]
    return trace
