"""LSL inlet for EEG + IMU streams (g.tec Unicorn Hybrid Black via Unicorn LSL).

The Unicorn LSL stream is a single 17-channel stream of type "EEG":
    8 EEG (10-20 labels e.g. Fz, C3, Cz, C4, Pz, PO7, Oz, PO8)
    3 accelerometer (X/Y/Z)
    3 gyroscope    (X/Y/Z)
    battery, counter, validation indicator

This module slices the EEG and IMU sub-streams by parsed channel label,
so channel order in the stream may change without breaking downstream code.
"""

from __future__ import annotations

import logging
import re
import threading
import time
from typing import List, Optional

import numpy as np
from pylsl import StreamInlet, local_clock, resolve_byprop

logger = logging.getLogger(__name__)

# 10-20 / 10-10 scalp labels we consider EEG. Conservative but covers the
# Unicorn default montage (Fz, C3, Cz, C4, Pz, PO7, Oz, PO8) and common
# extended montages users may stream during dev.
_EEG_10_20_LABELS = {
    "FP1", "FP2", "FPZ",
    "AF3", "AF4", "AF7", "AF8", "AFZ",
    "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "FZ",
    "FT7", "FT8", "FT9", "FT10",
    "FC1", "FC2", "FC3", "FC4", "FC5", "FC6", "FCZ",
    "C1", "C2", "C3", "C4", "C5", "C6", "CZ",
    "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10",
    "TP7", "TP8", "TP9", "TP10",
    "CP1", "CP2", "CP3", "CP4", "CP5", "CP6", "CPZ",
    "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "PZ",
    "PO3", "PO4", "PO7", "PO8", "POZ",
    "O1", "O2", "OZ",
}

_TIME_CORRECTION_REFRESH_S = 5.0
_MAX_SAMPLE_AGE_S = 0.5
_CLOCK_TOLERANCE_S = 0.125

# Fixed g.tec Unicorn positional layout. Used as a fallback when a stream
# carries no channel-label XML — the real Unicorn LSL bridge streams type
# "Data" with no <channels> description, so label parsing finds nothing.
# Verified against the device and archive/unicorneeg/stream.py.
UNICORN_POSITIONAL_EEG_LABELS = ["Fz", "C3", "Cz", "C4", "Pz", "PO7", "Oz", "PO8"]
UNICORN_POSITIONAL_IMU_LABELS = ["AccX", "AccY", "AccZ", "Gyro1", "Gyro2", "Gyro3"]


class StreamNotFoundError(RuntimeError):
    """Raised when no LSL stream of the requested type resolves before timeout."""


def _compact(label: str) -> str:
    return re.sub(r"[\s_\-]", "", label).upper()


def _classify_label(label: str) -> Optional[tuple[str, Optional[str]]]:
    """Classify a channel label.

    Returns (kind, axis) where:
        kind: "eeg" | "accel" | "gyro"
        axis: "x" | "y" | "z" for IMU, None for EEG
    Returns None for channels we don't care about (battery, counter, validation).
    """
    compact = _compact(label)
    if not compact:
        return None

    if compact.startswith("EEG") or compact in _EEG_10_20_LABELS:
        return ("eeg", None)

    if compact.startswith("ACC"):
        return ("accel", _axis_of(compact))
    if compact.startswith("GYRO"):
        return ("gyro", _axis_of(compact))
    return None


def _axis_of(compact: str) -> Optional[str]:
    """Pull an X/Y/Z (or 1/2/3) axis out of a compacted IMU label."""
    last = compact[-1]
    if last in ("X", "Y", "Z"):
        return last.lower()
    if last in ("1", "2", "3"):
        return {"1": "x", "2": "y", "3": "z"}[last]
    return None


def _parse_channel_metadata(info) -> tuple[list[str], list[str]]:
    """Return (labels, units) parsed from a StreamInfo's XML description.

    Falls back to empty strings for missing fields so callers can still
    iterate positionally without crashing.
    """
    n = info.channel_count()
    labels: list[str] = []
    units: list[str] = []

    desc = info.desc()
    channels_node = desc.child("channels")
    if channels_node.empty():
        logger.warning(
            "Stream '%s' has no <channels> XML description; cannot read labels.",
            info.name(),
        )
        return [""] * n, [""] * n

    ch = channels_node.child("channel")
    while not ch.empty():
        labels.append(ch.child_value("label"))
        units.append(ch.child_value("unit"))
        ch = ch.next_sibling("channel")

    if len(labels) != n:
        logger.warning(
            "Stream '%s' declared %d channels but XML lists %d; padding/truncating.",
            info.name(), n, len(labels),
        )
        labels = (labels + [""] * n)[:n]
        units = (units + [""] * n)[:n]
    return labels, units


class EEGInlet:
    """Wraps a single Unicorn LSL stream, slicing EEG and IMU sub-streams by label."""

    def __init__(
        self,
        timeout: float = 5.0,
        pull_timeout: float = 1.0,
        stream_type: str = "EEG",
        stream_name: Optional[str] = None,
        stream_info=None,
    ):
        """Resolve and open the LSL stream.

        Parameters
        ----------
        timeout : float
            Max seconds to wait for the stream to appear. Raises
            StreamNotFoundError if none is found.
        pull_timeout : float
            Default per-call timeout (seconds) for chunk pulls; chunk methods
            still accept a per-call override.
        stream_type : str
            LSL stream type to resolve when `stream_name` is not given.
            Defaults to "EEG". NOTE: the real Unicorn bridge advertises type
            "Data" (not "EEG"), so resolve it by `stream_name` (or pass
            stream_type="Data").
        stream_name : str, optional
            If given, resolve by stream NAME instead of type (e.g.
            "UN-2024.06.42"). Preferred for the real Unicorn bridge.
        """
        self.pull_timeout = pull_timeout

        if stream_name is not None:
            prop, value = "name", stream_name
        else:
            prop, value = "type", stream_type
        streams = [stream_info] if stream_info is not None else resolve_byprop(prop, value, timeout=timeout)
        if not streams:
            raise StreamNotFoundError(
                f"No LSL stream with {prop}={value!r} found within {timeout}s"
            )

        self._inlet = StreamInlet(streams[0])
        info = self._inlet.info()
        self._stream_name = info.name()
        self._stream_type = info.type()
        self._sample_rate = info.nominal_srate()
        self._n_channels = info.channel_count()

        self._labels, self._units = _parse_channel_metadata(info)

        # Build the label->index maps once at connect.
        self._eeg_idx: list[int] = []
        self._eeg_labels: list[str] = []
        self._eeg_units: list[str] = []
        accel_by_axis: dict[str, int] = {}
        gyro_by_axis: dict[str, int] = {}

        for idx, label in enumerate(self._labels):
            kind_axis = _classify_label(label)
            if kind_axis is None:
                continue
            kind, axis = kind_axis
            if kind == "eeg":
                self._eeg_idx.append(idx)
                self._eeg_labels.append(label)
                self._eeg_units.append(self._units[idx] if idx < len(self._units) else "")
            elif kind == "accel" and axis is not None:
                accel_by_axis[axis] = idx
            elif kind == "gyro" and axis is not None:
                gyro_by_axis[axis] = idx

        self._imu_idx: list[int] = []
        self._imu_labels: list[str] = []
        for axis in ("x", "y", "z"):
            if axis in accel_by_axis:
                self._imu_idx.append(accel_by_axis[axis])
                self._imu_labels.append(self._labels[accel_by_axis[axis]])
        for axis in ("x", "y", "z"):
            if axis in gyro_by_axis:
                self._imu_idx.append(gyro_by_axis[axis])
                self._imu_labels.append(self._labels[gyro_by_axis[axis]])

        # Positional fallback: the real Unicorn bridge streams type "Data" with
        # no channel-label XML, so the label scan above finds zero EEG channels.
        # Fall back to the device's fixed positional layout (0..7 EEG, 8..13
        # IMU). Streams that DO carry labels keep the label-based slicing above.
        if not self._eeg_idx and self._n_channels >= 14:
            logger.warning(
                "No EEG channels parsed from labels (labels=%s); falling back to "
                "the fixed Unicorn positional layout (0..7 EEG, 8..13 IMU).",
                self._labels,
            )
            self._eeg_idx = list(range(8))
            self._eeg_labels = list(UNICORN_POSITIONAL_EEG_LABELS)
            self._eeg_units = ["microvolts"] * 8
            self._imu_idx = list(range(8, 14))
            self._imu_labels = list(UNICORN_POSITIONAL_IMU_LABELS)

        logger.info(
            "Connected to LSL stream name=%r type=%r srate=%.1f channels=%d",
            self._stream_name, self._stream_type, self._sample_rate, self._n_channels,
        )
        logger.info("Parsed channel labels: %s", self._labels)
        logger.info("EEG channels (%d): %s", len(self._eeg_idx), self._eeg_labels)
        logger.info("IMU channels (%d): %s", len(self._imu_idx), self._imu_labels)

        if len(self._eeg_idx) != 8:
            logger.warning(
                "Expected 8 EEG channels, parsed %d from labels=%s",
                len(self._eeg_idx), self._labels,
            )
        if len(self._imu_idx) != 6:
            logger.warning(
                "Expected 6 IMU channels (accel xyz + gyro xyz), parsed %d",
                len(self._imu_idx),
            )

        unit_scale = {"": 1, "uv": 1, "microvolt": 1, "microvolts": 1,
                      "mv": 1e3, "millivolts": 1e3, "v": 1e6, "volts": 1e6}
        units = [u.strip().lower().replace("μ", "u").replace("µ", "u") for u in self._eeg_units]
        if any(u not in unit_scale for u in units):
            self._inlet.close_stream()
            raise ValueError("Unrecognized EEG voltage unit")
        self._uv_scale = np.array([unit_scale[u] for u in units])[:, None]
        compact_labels = [_compact(label) for label in self._labels]
        positional = not any(compact_labels) and self._n_channels == 17
        self._counter_index = compact_labels.index("COUNTER") if "COUNTER" in compact_labels else (15 if positional else None)
        self._valid_index = compact_labels.index("VALIDATIONINDICATOR") if "VALIDATIONINDICATOR" in compact_labels else (16 if positional else None)
        self._previous_counter = None
        self.last_sample_timestamp = None
        self.last_chunk_gap = False
        self.last_chunk_stale = False

        # Time correction: refreshed at most every _TIME_CORRECTION_REFRESH_S.
        self._tc_lock = threading.Lock()
        self._tc_value: float = 0.0
        self._tc_last_refresh: float = 0.0
        self._refresh_time_correction(force=True)

    # ------------------------------------------------------------------
    # Public chunk-pull API

    def get_eeg_chunk(
        self,
        max_samples: int,
        timeout: Optional[float] = None,
    ) -> np.ndarray:
        """Pull up to `max_samples` EEG samples. Returns shape [8, n_samples], float64."""
        return self._pull_subset(self._eeg_idx, max_samples, timeout)

    def get_imu_chunk(
        self,
        max_samples: int,
        timeout: Optional[float] = None,
    ) -> np.ndarray:
        """Pull up to `max_samples` IMU samples. Returns shape [6, n_samples], float64."""
        return self._pull_subset(self._imu_idx, max_samples, timeout)

    def get_chunk(
        self,
        max_samples: int,
        timeout: Optional[float] = None,
    ) -> tuple[np.ndarray, np.ndarray]:
        """Pull EEG and IMU from a SINGLE LSL pull, time-aligned.

        Returns ``(eeg [8, n], imu [6, n])`` sliced from the same samples.

        Use this in a real-time loop instead of calling ``get_eeg_chunk`` and
        ``get_imu_chunk`` separately: those issue two independent ``pull_chunk``
        calls on the one underlying inlet, so the second steals samples the
        first didn't take, leaving GAPS in the EEG stream. Gapped input breaks
        the stateful causal filter (it assumes contiguous samples) and corrupts
        every downstream band-power / ERD estimate.
        """
        if self._inlet is None:
            raise RuntimeError("EEGInlet is closed")
        empty_eeg = np.empty((len(self._eeg_idx), 0), dtype=np.float64)
        empty_imu = np.empty((len(self._imu_idx), 0), dtype=np.float64)
        if max_samples <= 0:
            return empty_eeg, empty_imu

        eff_timeout = self.pull_timeout if timeout is None else timeout
        samples, stamps = self._inlet.pull_chunk(timeout=eff_timeout, max_samples=max_samples)
        if not samples:
            return empty_eeg, empty_imu

        arr = np.asarray(samples, dtype=np.float64)  # [n_samples, n_channels]
        previous = self.last_sample_timestamp
        deltas = np.diff(([previous] if previous is not None else []) + list(stamps))
        # A bridge may stamp transport chunks at uneven wall-clock intervals.
        # The device sample counter detects dropped samples despite that jitter.
        if self._counter_index is None:
            self.last_chunk_gap = bool(np.any(deltas <= 0) or np.any(deltas > 3 / self._sample_rate))
        else:
            counters = arr[:, self._counter_index]
            sequence = np.r_[self._previous_counter, counters] if self._previous_counter is not None else counters
            self.last_chunk_gap = bool(np.any(np.diff(sequence) % 65536 != 1) or np.any(deltas > .25))
            self._previous_counter = counters[-1]
        if self._valid_index is not None and np.any(arr[:, self._valid_index] != 1):
            self.last_chunk_gap = True
        self.last_sample_timestamp = stamps[-1]
        # A continuous device counter also advances when an old backlog is replayed.
        corrected = self.last_sample_timestamp + self.get_time_correction()
        self.last_chunk_stale = not -_CLOCK_TOLERANCE_S <= local_clock() - corrected < _MAX_SAMPLE_AGE_S
        eeg = arr[:, self._eeg_idx].T.copy() * self._uv_scale
        imu = arr[:, self._imu_idx].T.copy()
        return eeg, imu

    def get_time_correction(self) -> float:
        """Return the cached LSL clock offset (seconds), refreshing if >5s old."""
        self._refresh_time_correction()
        return self._tc_value

    def close(self) -> None:
        """Close the underlying inlet. Safe to call more than once."""
        if self._inlet is not None:
            try:
                self._inlet.close_stream()
            except Exception:
                logger.exception("Error while closing LSL inlet")
            self._inlet = None

    # ------------------------------------------------------------------
    # Introspection

    @property
    def eeg_labels(self) -> list[str]:
        return list(self._eeg_labels)

    @property
    def imu_labels(self) -> list[str]:
        return list(self._imu_labels)

    @property
    def sample_rate(self) -> float:
        return self._sample_rate

    @property
    def n_channels(self) -> int:
        return self._n_channels

    # ------------------------------------------------------------------
    # Internals

    def _pull_subset(
        self,
        indices: List[int],
        max_samples: int,
        timeout: Optional[float],
    ) -> np.ndarray:
        if self._inlet is None:
            raise RuntimeError("EEGInlet is closed")
        if max_samples <= 0:
            return np.empty((len(indices), 0), dtype=np.float64)

        eff_timeout = self.pull_timeout if timeout is None else timeout
        samples, _ = self._inlet.pull_chunk(
            timeout=eff_timeout,
            max_samples=max_samples,
        )
        if not samples:
            return np.empty((len(indices), 0), dtype=np.float64)

        # samples is list[list[float]], shape [n_samples, n_channels].
        arr = np.asarray(samples, dtype=np.float64)
        # Subset and transpose to [n_selected, n_samples].
        data = arr[:, indices].T.copy()
        return data * self._uv_scale if indices is self._eeg_idx else data

    def _refresh_time_correction(self, force: bool = False) -> None:
        now = time.monotonic()
        with self._tc_lock:
            if not force and (now - self._tc_last_refresh) < _TIME_CORRECTION_REFRESH_S:
                return
            try:
                # time_correction() accepts a timeout; cap it to pull_timeout
                # so the call cannot block longer than other reads.
                self._tc_value = self._inlet.time_correction(timeout=self.pull_timeout)
                self._tc_last_refresh = now
            except Exception:
                self._tc_last_refresh = now
                logger.warning("LSL clock correction unavailable; keeping previous value")
