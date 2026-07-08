"""aiortc-backed receiver for the patient's camera track.

Patient is the offerer/publisher; this is the answerer. aiortc gathers its ICE
candidates into the answer SDP (non-trickle), so this side rarely emits separate
`webrtc-ice` frames — but the contract supports them and the patient (browser)
trickles candidates to us via `add_ice`.

`pc_factory` and all aiortc imports are lazy/injected so unit tests run without
aiortc installed; only the live loopback test and production supply the real
peer.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Awaitable, Callable, Optional

logger = logging.getLogger(__name__)

LocalSignalCb = Callable[[dict], Awaitable[None]]


def _default_pc_factory():
    from aiortc import RTCPeerConnection  # lazy: unit tests never hit this
    return RTCPeerConnection()


class _Description:
    def __init__(self, sdp: str, type_: str):
        self.sdp = sdp
        self.type = type_


class WebRTCReceiver:
    def __init__(
        self,
        sink,
        pc_factory: Optional[Callable[[], object]] = None,
        on_local_signal: Optional[LocalSignalCb] = None,
    ) -> None:
        self._sink = sink
        self._pc_factory = pc_factory or _default_pc_factory
        self._on_local_signal = on_local_signal
        self._pc = None

    def _ensure_pc(self):
        if self._pc is not None:
            return self._pc
        pc = self._pc_factory()
        self._pc = pc

        @pc.on("track")
        def _on_track(track):  # pragma: no cover - exercised by the live test
            if getattr(track, "kind", None) == "video":
                asyncio.ensure_future(self._pump(track))

        return pc

    async def _pump(self, track) -> None:  # pragma: no cover - live test only
        while True:
            try:
                frame = await track.recv()
            except Exception:
                break
            self._sink.push(frame)

    async def handle_offer(self, sdp: str) -> dict:
        pc = self._ensure_pc()
        await pc.setRemoteDescription(self._remote_desc(sdp))
        answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        return {"type": "webrtc-answer", "sdp": pc.localDescription.sdp}

    async def add_ice(self, candidate: Optional[dict]) -> None:
        if not candidate:
            return  # None / empty = end-of-candidates
        pc = self._ensure_pc()
        await pc.addIceCandidate(self._parse_candidate(candidate))

    async def close(self) -> None:
        if self._pc is not None:
            await self._pc.close()
            self._pc = None
        self._sink.clear()

    def connection_state(self) -> str:
        """Current RTCPeerConnection state, or "closed" before any peer exists.

        Used by the VisionHealthMonitor to surface camera-link health without
        the receiver having to know about the WS frame schema.
        """
        if self._pc is None:
            return "closed"
        return str(getattr(self._pc, "connectionState", "closed"))

    # -- helpers; aiortc types imported lazily so unit tests stay hermetic ----

    def _remote_desc(self, sdp: str):
        try:
            from aiortc import RTCSessionDescription
            return RTCSessionDescription(sdp=sdp, type="offer")
        except ImportError:
            return _Description(sdp=sdp, type_="offer")

    def _parse_candidate(self, candidate: dict):
        try:
            from aiortc.sdp import candidate_from_sdp
            cand = candidate_from_sdp(candidate["candidate"].split(":", 1)[1])
            cand.sdpMid = candidate.get("sdpMid")
            cand.sdpMLineIndex = candidate.get("sdpMLineIndex")
            return cand
        except ImportError:
            return candidate  # fake peer in unit tests records it verbatim
