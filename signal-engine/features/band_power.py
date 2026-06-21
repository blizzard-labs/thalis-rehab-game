"""Band-power feature extraction via Welch's method.

Spec ref (docs/specs.md Section 5.3): mu (8-12 Hz) and beta (13-30 Hz) power
at the sensorimotor channels, computed with Welch / short-time FFT over a
sliding ~1 s window. This module is the interpretable, always-available
band-power track that ERD scoring is built on.
"""

from __future__ import annotations

import numpy as np
from scipy.signal import welch


def compute_band_power(
    data: np.ndarray,
    fs: int,
    band: tuple[float, float],
    window_sec: float = 1.0,
) -> np.ndarray:
    """Per-channel power in `band` using Welch's method.

    Parameters
    ----------
    data : np.ndarray
        ``[n_channels, n_samples]`` time series (e.g. one ring-buffer window).
    fs : int
        Sample rate in Hz.
    band : tuple[float, float]
        ``(lo, hi)`` band edges in Hz, inclusive.
    window_sec : float
        Welch segment length in seconds. Capped to the available samples so
        short chunks still return a value (with fewer averaged segments).

    Returns
    -------
    np.ndarray
        ``[n_channels]`` integrated PSD over the band (µV²), float64.
    """
    data = np.asarray(data, dtype=np.float64)
    if data.ndim != 2:
        raise ValueError(f"expected [n_channels, n_samples], got {data.shape}")
    lo, hi = float(band[0]), float(band[1])
    if hi <= lo:
        raise ValueError(f"invalid band: {band!r}")

    n_samples = data.shape[1]
    if n_samples == 0:
        raise ValueError("data has no samples")

    nperseg = int(round(window_sec * fs))
    nperseg = max(1, min(nperseg, n_samples))

    freqs, psd = welch(data, fs=fs, nperseg=nperseg, axis=-1)
    # psd: [n_channels, n_freqs]. Integrate over the requested band.
    mask = (freqs >= lo) & (freqs <= hi)
    if not mask.any():
        # Band falls between FFT bins (very short window) — nearest bin.
        mask = np.zeros_like(freqs, dtype=bool)
        mask[np.argmin(np.abs(freqs - (lo + hi) / 2.0))] = True

    return np.trapezoid(psd[:, mask], freqs[mask], axis=-1)
