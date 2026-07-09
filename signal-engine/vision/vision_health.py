"""Samples camera-link health for the clinician `vision_health` WS frame.

Pure sampler: no threads, no asyncio. The WS server calls `sample()` on a fixed
cadence and serializes the dict. `fps` is derived from `VideoFrameSink.frame_count`
deltas between calls; `kinematic_active` reflects whether a fresh KinematicResult
is present; `degraded` is only raised in kinematic-weighted modes (B/C) — Mode A
is EEG-only by design and never "degraded".
"""
from __future__ import annotations

import time


class VisionHealthMonitor:
    def __init__(self, receiver, sink, latest_kinematic, engine, *,
                 staleness_s: float = 0.3, now=time.time):
        self.receiver = receiver
        self.sink = sink
        self.latest = latest_kinematic
        self.engine = engine
        self.staleness_s = float(staleness_s)
        self._now = now
        self._prev_count = None
        self._prev_t = None

    def sample(self) -> dict:
        t = self._now()
        count = self.sink.frame_count
        fps = 0.0
        if self._prev_count is not None and self._prev_t is not None:
            dt = t - self._prev_t
            if dt > 0:
                fps = (count - self._prev_count) / dt
        self._prev_count = count
        self._prev_t = t

        result = self.latest.get()
        kinematic_active = (
            result is not None and (t - result.timestamp) <= self.staleness_s
        )
        connection = self.receiver.connection_state()
        # "degraded" = a LIVE camera link exists but isn't feeding fresh kinematic
        # in a kinematic-weighted mode. Before any patient connects (connection
        # not "connected") it's a no-link state, NOT degraded — otherwise the
        # console shows a false "vision degraded" alarm at boot.
        degraded = (
            connection == "connected"
            and self.engine.session_mode in ("B", "C")
            and not kinematic_active
        )

        return {
            "connection": connection,
            "fps": round(float(fps), 1),
            "kinematic_active": bool(kinematic_active),
            "degraded": bool(degraded),
        }
