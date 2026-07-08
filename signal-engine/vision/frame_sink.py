"""Bounded latest-frame buffer for the WebRTC video path.

The receiver pushes decoded frames here; downstream consumers (V2-2b MediaPipe
worker) read the latest. Keeping only the newest frame means a slow consumer
drops stale frames rather than building an unbounded backlog. `frame_count` is a
monotonic received-tally used for the camera-link health check.
"""
from __future__ import annotations

from typing import Optional


class VideoFrameSink:
    def __init__(self) -> None:
        self._latest: Optional[object] = None
        self._count = 0

    def push(self, frame: object) -> None:
        self._latest = frame
        self._count += 1

    def latest(self) -> Optional[object]:
        return self._latest

    @property
    def frame_count(self) -> int:
        return self._count

    def clear(self) -> None:
        self._latest = None
