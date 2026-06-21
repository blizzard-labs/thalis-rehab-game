"""Spatial filtering for the fixed 8-channel Unicorn montage."""

from __future__ import annotations

import numpy as np


def common_average_reference(data: np.ndarray) -> np.ndarray:
    """Common Average Reference: subtract the per-timepoint cross-channel mean.

    For each sample (column), the mean across all channels is removed. This is
    the robust default spatial filter on the fixed 8-channel montage (a true
    Hjorth Laplacian needs immediate neighbours this cap doesn't provide).

    Parameters
    ----------
    data : np.ndarray
        ``[n_channels, n_samples]``. The mean is taken across axis 0 (channels)
        for every timepoint.

    Returns
    -------
    np.ndarray
        Re-referenced data, same shape as input.
    """
    data = np.asarray(data, dtype=np.float64)
    if data.ndim != 2:
        raise ValueError(f"expected [n_channels, n_samples], got {data.shape}")
    return data - data.mean(axis=0, keepdims=True)
