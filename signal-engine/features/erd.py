"""ERD / laterality features from band power.

Spec ref (docs/specs.md Section 5.3):
    ERD% = (P_baseline - P_task) / P_baseline * 100
    LI   = (ERD_C3 - ERD_C4) / (ERD_C3 + ERD_C4)

Channels are resolved by label against the labels supplied with each chunk
(the same label->index discipline used in acquisition.lsl_inlet), so the
caller is never forced to know that "C3 is row 2" in any particular stream.
"""

from __future__ import annotations

import logging

import numpy as np

from features.band_power import compute_band_power

logger = logging.getLogger(__name__)

DEFAULT_BANDS: dict[str, tuple[float, float]] = {
    "mu": (8.0, 12.0),
    "beta": (13.0, 30.0),
}

# Denominators below this are treated as "no ERD on either side" for the
# laterality index, which is otherwise singular there.
_LI_EPS = 1e-6


class BaselineNotCalibratedError(RuntimeError):
    """Raised when compute_erd is called before calibrate_baseline."""


def _resolve_channel(label: str, channel_labels: list[str]) -> int:
    """Resolve a channel label to its row index in `channel_labels`.

    By label, not by position — mirrors the acquisition module's label->index
    map so a re-ordered stream never silently scrambles C3/C4.
    """
    try:
        return channel_labels.index(label)
    except ValueError:
        raise KeyError(
            f"channel {label!r} not in provided labels {channel_labels}"
        ) from None


class ERDCalculator:
    """Computes per-channel, per-band ERD% against a calibrated rest baseline."""

    def __init__(
        self,
        channel_labels: list[str],
        bands: dict[str, tuple[float, float]] | None = None,
        fs: int = 250,
        window_sec: float = 1.0,
    ):
        if not channel_labels:
            raise ValueError("channel_labels must be non-empty")
        self.channel_labels = list(channel_labels)
        self.bands = dict(bands) if bands is not None else dict(DEFAULT_BANDS)
        self.fs = int(fs)
        self.window_sec = float(window_sec)
        # {channel_label: {band_name: baseline_power}}, set by calibrate_baseline.
        self._baseline: dict[str, dict[str, float]] | None = None

    # ------------------------------------------------------------------

    def calibrate_baseline(
        self,
        baseline_chunk: np.ndarray,
        channel_labels: list[str],
    ) -> None:
        """Store per-channel, per-band baseline power from a rest-period chunk.

        Call once per calibration block before any ERD computation.
        """
        baseline_chunk = np.asarray(baseline_chunk, dtype=np.float64)
        if baseline_chunk.ndim != 2:
            raise ValueError(
                f"expected [n_channels, n_samples], got {baseline_chunk.shape}"
            )

        baseline: dict[str, dict[str, float]] = {}
        for label in self.channel_labels:
            idx = _resolve_channel(label, channel_labels)
            row = baseline_chunk[idx : idx + 1, :]  # keep 2D: [1, n_samples]
            baseline[label] = {
                band_name: float(
                    compute_band_power(row, self.fs, band, self.window_sec)[0]
                )
                for band_name, band in self.bands.items()
            }
        self._baseline = baseline
        logger.info("ERD baseline calibrated for channels=%s", self.channel_labels)

    # ------------------------------------------------------------------

    def compute_erd(
        self,
        task_chunk: np.ndarray,
        channel_labels: list[str],
    ) -> dict[str, dict[str, float]]:
        """Return {channel: {band_name: erd_percent}} for the task chunk.

        erd_percent = (baseline_power - task_power) / baseline_power * 100.
        Positive = desynchronization (power dropped vs rest), the MI signal.
        """
        if self._baseline is None:
            raise BaselineNotCalibratedError(
                "calibrate_baseline() must be called before compute_erd()"
            )
        task_chunk = np.asarray(task_chunk, dtype=np.float64)
        if task_chunk.ndim != 2:
            raise ValueError(
                f"expected [n_channels, n_samples], got {task_chunk.shape}"
            )

        result: dict[str, dict[str, float]] = {}
        for label in self.channel_labels:
            idx = _resolve_channel(label, channel_labels)
            row = task_chunk[idx : idx + 1, :]
            per_band: dict[str, float] = {}
            for band_name, band in self.bands.items():
                p_task = float(
                    compute_band_power(row, self.fs, band, self.window_sec)[0]
                )
                p_base = self._baseline[label][band_name]
                if abs(p_base) < _LI_EPS:
                    logger.warning(
                        "baseline power ~0 for %s/%s; ERD undefined, returning 0.0",
                        label, band_name,
                    )
                    per_band[band_name] = 0.0
                else:
                    per_band[band_name] = (p_base - p_task) / p_base * 100.0
            result[label] = per_band
        return result


def laterality_index(
    erd_dict: dict,
    left_channel: str = "C3",
    right_channel: str = "C4",
    band: str = "mu",
) -> float:
    """Laterality index LI = (ERD_left - ERD_right) / (ERD_left + ERD_right).

    Returns 0.0 (with a logged warning) when the denominator is near zero,
    rather than raising or returning inf/nan.
    """
    try:
        erd_left = erd_dict[left_channel][band]
        erd_right = erd_dict[right_channel][band]
    except KeyError as exc:
        raise KeyError(
            f"erd_dict missing {exc} for laterality "
            f"(left={left_channel!r}, right={right_channel!r}, band={band!r})"
        ) from None

    denom = erd_left + erd_right
    if abs(denom) < _LI_EPS:
        logger.warning(
            "laterality denominator ~0 (ERD_left=%.4f, ERD_right=%.4f); returning 0.0",
            erd_left, erd_right,
        )
        return 0.0
    return (erd_left - erd_right) / denom
