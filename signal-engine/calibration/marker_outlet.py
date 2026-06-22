"""LSL marker outlet for the NeuroReach calibration paradigm.

A single string-valued, irregular-rate LSL stream carries event markers
("fixation_onset", "cue_onset", "mi_window_onset", ...). Each sample is a
string formatted as ``"label|{json}"`` so downstream epoch extraction and the
game client can parse a label plus optional trial metadata from one field.

The format MUST stay consistent across producers/consumers:

    "fixation_onset|{\"trial_n\": 0, \"class\": \"rest\"}"
    "mi_window_onset|{}"
"""

from __future__ import annotations

import json
import logging
from typing import Optional

from pylsl import IRREGULAR_RATE, StreamInfo, StreamOutlet, cf_string, local_clock

logger = logging.getLogger(__name__)

MARKER_STREAM_NAME = "NeuroReach-Markers"
MARKER_STREAM_TYPE = "Markers"


def create_marker_outlet(source_id: Optional[str] = None) -> StreamOutlet:
    """Create the NeuroReach marker outlet.

    A 1-channel, irregular-rate, string-format LSL stream named
    "NeuroReach-Markers" of type "Markers".
    """
    info = StreamInfo(
        name=MARKER_STREAM_NAME,
        type=MARKER_STREAM_TYPE,
        channel_count=1,
        nominal_srate=IRREGULAR_RATE,
        channel_format=cf_string,
        source_id=source_id or f"neuroreach-markers-{id(object()):x}",
    )
    outlet = StreamOutlet(info)
    logger.info("Created marker outlet name=%r type=%r", MARKER_STREAM_NAME, MARKER_STREAM_TYPE)
    return outlet


def format_marker(label: str, metadata: Optional[dict] = None) -> str:
    """Build the canonical ``"label|{json}"`` marker string.

    metadata=None serializes to ``"{}"`` so the pipe-delimited format is
    always present and parsers can split on the first ``|`` unconditionally.
    """
    payload = json.dumps(metadata if metadata is not None else {}, separators=(",", ":"))
    return f"{label}|{payload}"


def parse_marker(sample: str) -> tuple[str, dict]:
    """Inverse of :func:`format_marker`. Returns (label, metadata_dict)."""
    label, _, payload = sample.partition("|")
    meta = json.loads(payload) if payload else {}
    return label, meta


def send_marker(
    outlet: StreamOutlet,
    label: str,
    metadata: Optional[dict] = None,
) -> float:
    """Push a single marker sample and return the LSL timestamp it was stamped with.

    The timestamp is read from ``pylsl.local_clock()`` immediately before the
    push so callers can record event onsets (e.g. mi_window_onset) against the
    same clock the EEG samples carry.
    """
    sample = format_marker(label, metadata)
    timestamp = local_clock()
    outlet.push_sample([sample], timestamp)
    logger.debug("marker %r @ %.6f", sample, timestamp)
    return timestamp
