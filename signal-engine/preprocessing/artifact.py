"""Artifact / quality gating for real-time scoring.

Two independent gates that suppress EEG-based scoring for a contaminated
window (Section 5.2 of the spec):

- ``AmplitudeGate``  — peak-to-peak voltage threshold over selected EEG
  channels (catches movement / electrode-pop / blink contamination).
- ``MovementGate``   — IMU-based head-movement detector, so a head turn or
  jaw clench isn't misread as ERD.

Both take a ~1-second window and return a boolean verdict; the caller decides
how to apply it (typically: drop scoring for that window).
"""

from __future__ import annotations

from typing import Optional, Sequence

import numpy as np


class AmplitudeGate:
    """Flag a window contaminated when peak-to-peak amplitude is too high.

    Parameters
    ----------
    threshold_uv : float
        Peak-to-peak threshold in microvolts. A window is "dirty" if ANY checked
        channel's peak-to-peak (max - min) exceeds this. Default 100 µV.
    channels : sequence of int, optional
        Channel indices (rows) to check. ``None`` (default) checks all channels.
        For the Unicorn montage this is typically the MI channels C3/Cz/C4.
    fs : float
        Sampling rate (Hz), used to interpret the nominal 1-second window length.
    """

    def __init__(
        self,
        threshold_uv: float = 100.0,
        channels: Optional[Sequence[int]] = None,
        fs: float = 250.0,
    ):
        self.threshold_uv = float(threshold_uv)
        self.channels = None if channels is None else list(channels)
        self.fs = float(fs)
        self.window_samples = int(round(fs))  # nominal 1-second window

    def is_clean(self, window: np.ndarray) -> bool:
        """Return True if no checked channel exceeds the p2p threshold.

        Parameters
        ----------
        window : np.ndarray
            ``[n_channels, n_samples]`` µV window (nominally 1 s).
        """
        window = np.asarray(window, dtype=np.float64)
        if window.ndim != 2:
            raise ValueError(f"expected [n_channels, n_samples], got {window.shape}")

        rows = window if self.channels is None else window[self.channels]
        peak_to_peak = rows.max(axis=-1) - rows.min(axis=-1)
        return bool(np.all(peak_to_peak <= self.threshold_uv))


class MovementGate:
    """Flag head movement from IMU variance over a ~1-second window.

    Takes an IMU chunk shaped like ``EEGInlet.get_imu_chunk`` output:
    ``[6, n_samples]`` = accelerometer X/Y/Z then gyroscope X/Y/Z. Computes the
    per-sample accel magnitude and gyro magnitude, sums them, and takes the
    variance over the window. A constant gravity vector contributes no variance,
    so only genuine motion (changing magnitude) raises the statistic.

    Parameters
    ----------
    threshold : float
        Variance threshold (in combined accel+gyro magnitude units). The head is
        considered still when variance is at or below this. Default 0.05.
    fs : float
        Sampling rate (Hz), used to interpret the nominal 1-second window length.
    """

    def __init__(self, threshold: float = 0.05, fs: float = 250.0):
        self.threshold = float(threshold)
        self.fs = float(fs)
        self.window_samples = int(round(fs))

    def is_head_still(self, window: np.ndarray) -> bool:
        """Return True if combined IMU-magnitude variance is below threshold.

        Parameters
        ----------
        window : np.ndarray
            ``[6, n_samples]`` IMU window: accel X/Y/Z, gyro X/Y/Z.
        """
        window = np.asarray(window, dtype=np.float64)
        if window.ndim != 2 or window.shape[0] != 6:
            raise ValueError(f"expected [6, n_samples] IMU window, got {window.shape}")

        accel_mag = np.linalg.norm(window[0:3], axis=0)
        gyro_mag = np.linalg.norm(window[3:6], axis=0)
        combined = accel_mag + gyro_mag
        return bool(np.var(combined) <= self.threshold)
