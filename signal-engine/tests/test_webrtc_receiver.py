import asyncio

from vision.frame_sink import VideoFrameSink
from vision.webrtc_receiver import WebRTCReceiver


class FakeDescription:
    def __init__(self, sdp, type_):
        self.sdp = sdp
        self.type = type_


class FakePeer:
    """Stands in for aiortc.RTCPeerConnection in unit tests."""

    def __init__(self):
        self.remote = None
        self.local = None
        self.handlers = {}
        self.added_ice = []
        self.closed = False

    def on(self, event):
        def deco(fn):
            self.handlers[event] = fn
            return fn
        return deco

    async def setRemoteDescription(self, desc):
        self.remote = desc

    async def createAnswer(self):
        return FakeDescription("answer-sdp", "answer")

    async def setLocalDescription(self, desc):
        self.local = desc

    @property
    def localDescription(self):
        return self.local

    async def addIceCandidate(self, candidate):
        self.added_ice.append(candidate)

    async def close(self):
        self.closed = True


def test_handle_offer_returns_answer_and_sets_remote():
    peer = FakePeer()
    sink = VideoFrameSink()
    rx = WebRTCReceiver(sink, pc_factory=lambda: peer)

    answer = asyncio.run(rx.handle_offer("offer-sdp"))

    assert answer == {"type": "webrtc-answer", "sdp": "answer-sdp"}
    assert peer.remote.sdp == "offer-sdp"
    assert peer.remote.type == "offer"


def test_add_ice_forwards_parsed_candidate_to_peer():
    peer = FakePeer()
    rx = WebRTCReceiver(VideoFrameSink(), pc_factory=lambda: peer)
    asyncio.run(rx.handle_offer("offer-sdp"))  # creates the peer

    asyncio.run(
        rx.add_ice(
            {
                "candidate": "candidate:842163049 1 udp 1677729535 192.168.1.10 54321 typ host",
                "sdpMid": "0",
                "sdpMLineIndex": 0,
            }
        )
    )

    assert len(peer.added_ice) == 1


def test_null_ice_is_ignored():
    peer = FakePeer()
    rx = WebRTCReceiver(VideoFrameSink(), pc_factory=lambda: peer)
    asyncio.run(rx.handle_offer("offer-sdp"))
    asyncio.run(rx.add_ice(None))  # end-of-candidates sentinel
    assert peer.added_ice == []


def test_close_closes_peer_and_clears_sink():
    peer = FakePeer()
    sink = VideoFrameSink()
    sink.push("f")
    rx = WebRTCReceiver(sink, pc_factory=lambda: peer)
    asyncio.run(rx.handle_offer("offer-sdp"))
    asyncio.run(rx.close())
    assert peer.closed is True
    assert sink.latest() is None


def test_connection_state_closed_before_peer():
    rx = WebRTCReceiver(VideoFrameSink())
    assert rx.connection_state() == "closed"


def test_connection_state_reads_pc_when_present():
    peer = FakePeer()
    peer.connectionState = "connected"
    rx = WebRTCReceiver(VideoFrameSink(), pc_factory=lambda: peer)
    rx._ensure_pc()
    assert rx.connection_state() == "connected"
