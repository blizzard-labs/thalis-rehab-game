"""Epoch re-slicing and label encoding for calibration datasets.

The orchestrator already stores each MI window as a fixed-length epoch. These
helpers let downstream code (a) re-slice that raw buffer to a different
sub-window without re-running calibration, and (b) integer-encode labels for
the classifier, returning a fitted :class:`~sklearn.preprocessing.LabelEncoder`
to serialize alongside the model so labels decode at inference time.
"""

from __future__ import annotations

import logging
from dataclasses import replace
from typing import Optional

import numpy as np
from sklearn.preprocessing import LabelEncoder

from calibration.orchestrator import CalibrationDataset

logger = logging.getLogger(__name__)


def extract_epochs_from_dataset(
    dataset: CalibrationDataset,
    pre_onset_s: float = 0.0,
    post_onset_s: Optional[float] = None,
) -> CalibrationDataset:
    """Re-slice each epoch to a sub-window of the stored MI buffer.

    The stored epochs already span [0, mi_window_duration_s) relative to
    mi_window_onset. With ``post_onset_s is None`` the dataset is returned
    unchanged (the common case). Otherwise epochs are sliced to
    ``[pre_onset_s, post_onset_s)`` seconds relative to onset, where
    ``pre_onset_s`` may be 0 (negative pre-onset is not available because the
    orchestrator only buffers from onset forward).

    Returns a new :class:`CalibrationDataset`; the input is not mutated.
    """
    if post_onset_s is None:
        return dataset

    fs = int(dataset.session_info.get("fs", 0))
    if fs <= 0:
        raise ValueError("dataset.session_info['fs'] is required to re-slice epochs")
    if pre_onset_s < 0:
        raise ValueError("pre_onset_s must be >= 0; pre-onset data is not buffered")
    if post_onset_s <= pre_onset_s:
        raise ValueError("post_onset_s must be greater than pre_onset_s")

    start = int(round(pre_onset_s * fs))
    stop = int(round(post_onset_s * fs))
    n_samples = dataset.epochs.shape[2] if dataset.epochs.ndim == 3 else 0
    if stop > n_samples:
        raise ValueError(
            f"Requested window [{pre_onset_s}, {post_onset_s})s = samples "
            f"[{start}, {stop}) exceeds stored epoch length {n_samples}."
        )

    sliced = dataset.epochs[:, :, start:stop].copy()
    logger.info(
        "Re-sliced epochs %s -> %s for window [%.3f, %.3f)s",
        dataset.epochs.shape, sliced.shape, pre_onset_s, post_onset_s,
    )
    return replace(dataset, epochs=sliced)


def label_encode(dataset: CalibrationDataset) -> tuple[np.ndarray, LabelEncoder]:
    """Integer-encode dataset labels.

    Returns ``(y_int, encoder)`` where ``y_int`` is an int ndarray of length
    n_trials and ``encoder`` is a fitted ``LabelEncoder`` whose ``classes_``
    let inference decode predictions back to class strings. Serialize the
    encoder alongside the classifier.
    """
    encoder = LabelEncoder()
    y_int = encoder.fit_transform(dataset.labels).astype(int)
    return y_int, encoder
