import asyncio
import json

from server.ws_server import NeuroReachWSServer


class FakeReceiver:
    def __init__(self):
        self.offers = []
        self.ices = []

    async def handle_offer(self, sdp):
        self.offers.append(sdp)
        return {"type": "webrtc-answer", "sdp": f"answer:{sdp}"}

    async def add_ice(self, candidate):
        self.ices.append(candidate)

    async def close(self):
        pass


class FakeWebSocket:
    def __init__(self):
        self.sent = []

    async def send(self, raw):
        self.sent.append(raw)


def _make_server(receiver):
    # scoring_service is unused on the signaling path; None is fine here.
    return NeuroReachWSServer(
        scoring_service=None, host="localhost", port=0, webrtc_receiver=receiver
    )


def test_offer_gets_answer_on_same_socket():
    rx = FakeReceiver()
    srv = _make_server(rx)
    ws = FakeWebSocket()

    asyncio.run(srv._handle_message(ws, json.dumps({"type": "webrtc-offer", "sdp": "S"})))

    assert rx.offers == ["S"]
    assert json.loads(ws.sent[0]) == {"type": "webrtc-answer", "sdp": "answer:S"}


def test_ice_forwarded_to_receiver():
    rx = FakeReceiver()
    srv = _make_server(rx)
    ws = FakeWebSocket()

    asyncio.run(
        srv._handle_message(ws, json.dumps({"type": "webrtc-ice", "candidate": {"candidate": "c"}}))
    )

    assert rx.ices == [{"candidate": "c"}]


def test_signaling_without_receiver_is_silent_noop():
    srv = _make_server(None)
    ws = FakeWebSocket()
    asyncio.run(srv._handle_message(ws, json.dumps({"type": "webrtc-offer", "sdp": "S"})))
    # no receiver -> no answer, no crash, no "unknown command" error
    assert ws.sent == []
