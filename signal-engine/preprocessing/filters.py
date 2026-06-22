"""Bandpass / notch filtering for EEG, with two clearly separated code paths.

There are TWO distinct use cases here, and they are NOT interchangeable:

1. Offline / batch path  (``bandpass_filter_offline``, ``notch_filter_offline``)
   Zero-phase filtering via ``scipy.signal.filtfilt`` (forward+backward pass).
   This is non-causal: it uses the WHOLE buffer, including future samples,
   to compute each output sample. That gives zero phase distortion, which is
   exactly what you want for post-hoc calibration-block analysis. It is NOT
   valid for live per-chunk scoring, because it requires lookahead that you
   don't have in real time, and because re-filtering overlapping buffers each
   tick produces inconsistent edges.

2. Live / causal streaming path  (``CausalFilterChain``)
   Causal IIR filtering via ``scipy.signal.sosfilt`` with PERSISTENT filter
   state (``zi``) carried between calls. Each output sample depends only on
   past samples, so it is valid in real time, and feeding the signal in small
   successive chunks produces output equivalent (to numerical tolerance) to
   filtering the whole concatenated signal at once. This continuity is the
   whole point — get the state-carrying wrong and every chunk boundary injects
   a transient.

All functions/classes operate on ``[n_channels, n_samples]`` arrays and filter
along the sample axis (axis=-1).
"""

from __future__ import annotations

import numpy as np
from scipy.signal import butter, filtfilt, iirnotch, sosfilt, sosfilt_zi, tf2sos

# ---------------------------------------------------------------------------
# 1. Offline / batch path (zero-phase, non-causal). Calibration analysis only.


def bandpass_filter_offline(
    data: np.ndarray,
    fs: float = 250.0,
    low: float = 1.0,
    high: float = 40.0,
    order: int = 4,
) -> np.ndarray:
    """Zero-phase Butterworth bandpass. Offline/batch use only (uses lookahead).

    Parameters
    ----------
    data : np.ndarray
        ``[n_channels, n_samples]`` (or 1-D ``[n_samples]``). Filtered along the
        last axis.
    fs : float
        Sampling rate (Hz).
    low, high : float
        Passband edges (Hz).
    order : int
        Butterworth order (per direction; filtfilt doubles the effective order).
    """
    nyq = fs / 2.0
    b, a = butter(order, [low / nyq, high / nyq], btype="band")
    return filtfilt(b, a, data, axis=-1)


def notch_filter_offline(
    data: np.ndarray,
    fs: float = 250.0,
    freq: float = 60.0,
    q: float = 30.0,
) -> np.ndarray:
    """Zero-phase IIR notch at ``freq`` Hz. Offline/batch use only.

    Parameters
    ----------
    data : np.ndarray
        ``[n_channels, n_samples]`` (or 1-D). Filtered along the last axis.
    fs : float
        Sampling rate (Hz).
    freq : float
        Notch (line-noise) frequency, e.g. 60 Hz US / 50 Hz EU.
    q : float
        Quality factor; higher = narrower notch.
    """
    b, a = iirnotch(freq, q, fs=fs)
    return filtfilt(b, a, data, axis=-1)


# ---------------------------------------------------------------------------
# 2. Live / causal streaming path (persistent state). Real-time scoring.


class DCOffsetRemover:
    """Front-end per-channel electrode DC-offset removal (causal, stateful).

    Raw Unicorn EEG carries a huge electrode DC offset (values ~ -3.8e5 µV).
    Feeding that straight into a cold-start causal IIR (``CausalFilterChain``)
    makes the filter ring for seconds before it settles. The bandpass removes
    DC in steady state, so the offset is only a *startup-transient* problem —
    but a bad one. This stage kills it at the front of the real-time pipeline,
    BEFORE the filter chain:

        DCOffsetRemover -> CausalFilterChain -> CommonAverageReference -> ...

    It latches ONE per-channel offset (either calibrated from a rest buffer via
    :meth:`calibrate`, or captured lazily from the first chunk) and subtracts
    that SAME constant from every later chunk. A fixed offset never injects its
    own discontinuity at chunk boundaries — important, because a per-chunk
    re-estimated mean would step around and re-excite the downstream IIR.

    Kept separate from :class:`CausalFilterChain` on purpose: the chain's
    chunked == single-call equivalence (and its test) stays untouched.
    """

    def __init__(self):
        self._dc: np.ndarray | None = None  # shape [n_channels, 1]

    def calibrate(self, baseline: np.ndarray) -> None:
        """Latch the per-channel DC offset from a rest ``baseline`` buffer.

        Parameters
        ----------
        baseline : np.ndarray
            ``[n_channels, n_samples]`` of resting data (e.g. the calibration
            block). The per-channel mean is held as the fixed offset.
        """
        baseline = np.asarray(baseline, dtype=np.float64)
        if baseline.ndim != 2:
            raise ValueError(f"expected [n_channels, n_samples], got {baseline.shape}")
        self._dc = baseline.mean(axis=1, keepdims=True)

    def process_chunk(self, chunk: np.ndarray) -> np.ndarray:
        """Subtract the latched per-channel offset from one chunk.

        On the first chunk, if :meth:`calibrate` was never called, the offset is
        captured from that chunk's own per-channel mean.

        Parameters
        ----------
        chunk : np.ndarray
            ``[n_channels, n_samples]``. ``n_samples`` may vary between calls.

        Returns
        -------
        np.ndarray
            ``chunk`` with the fixed per-channel offset removed, same shape.
        """
        chunk = np.asarray(chunk, dtype=np.float64)
        if chunk.ndim != 2:
            raise ValueError(f"expected [n_channels, n_samples], got {chunk.shape}")
        n_ch = chunk.shape[0]

        if self._dc is None:
            self._dc = chunk.mean(axis=1, keepdims=True)
        elif self._dc.shape[0] != n_ch:
            raise ValueError(
                f"channel count changed: remover holds offset for "
                f"{self._dc.shape[0]} channels, got {n_ch}"
            )

        return chunk - self._dc

    def reset(self) -> None:
        """Clear the latched offset so the next calibrate/chunk re-latches."""
        self._dc = None


class CausalFilterChain:
    """Causal notch + bandpass with persistent per-channel filter state.

    Wraps ``scipy.signal.sosfilt`` and carries the filter state (``zi``) between
    successive ``process_chunk`` calls. Calling ``process_chunk`` repeatedly on
    consecutive chunks yields output equivalent to filtering the full
    concatenated signal in one call (within numerical tolerance), because the
    state initialised to zero is threaded forward across every chunk boundary.

    The chain applies the notch first, then the bandpass, matching the offline
    intent (remove line noise, then restrict to the analysis band).
    """

    def __init__(
        self,
        fs: float = 250.0,
        low: float = 1.0,
        high: float = 40.0,
        order: int = 4,
        notch_freq: float = 60.0,
        notch_q: float = 30.0,
    ):
        nyq = fs / 2.0
        bp_sos = butter(order, [low / nyq, high / nyq], btype="band", output="sos")
        b_notch, a_notch = iirnotch(notch_freq, notch_q, fs=fs)
        notch_sos = tf2sos(b_notch, a_notch)

        # Stack notch then bandpass into one SOS cascade so a single sosfilt
        # state covers the whole chain.
        self._sos = np.vstack([notch_sos, bp_sos])
        # Unit initial conditions per second-order section; scaled per channel
        # lazily on first chunk (zero-state start -> zi all zeros).
        self._zi_unit = sosfilt_zi(self._sos)  # shape [n_sections, 2]
        self._zi: np.ndarray | None = None  # shape [n_sections, n_channels, 2]

    def process_chunk(self, chunk: np.ndarray) -> np.ndarray:
        """Filter one chunk, carrying filter state forward.

        Parameters
        ----------
        chunk : np.ndarray
            ``[n_channels, n_samples]``. ``n_samples`` may vary between calls.

        Returns
        -------
        np.ndarray
            Filtered chunk, same shape as input.
        """
        chunk = np.asarray(chunk, dtype=np.float64)
        if chunk.ndim != 2:
            raise ValueError(f"expected [n_channels, n_samples], got {chunk.shape}")
        n_ch = chunk.shape[0]

        if self._zi is None:
            # Zero-state start: zi all zeros so the very first chunk matches a
            # plain one-shot sosfilt(sos, full_signal) with default zero state.
            self._zi = np.zeros((self._sos.shape[0], n_ch, 2))
        elif self._zi.shape[1] != n_ch:
            raise ValueError(
                f"channel count changed: chain holds state for {self._zi.shape[1]} "
                f"channels, got {n_ch}"
            )

        out, self._zi = sosfilt(self._sos, chunk, axis=-1, zi=self._zi)
        return out

    def reset(self) -> None:
        """Clear filter state so the next chunk starts from zero again."""
        self._zi = None
