"""Opt-in: real aiortc offerer <-> our receiver, in-process loopback.

Skipped by default (needs aiortc + av). Run explicitly with:
    conda run -n eeg python -m pytest signal-engine/tests/test_webrtc_live.py -m live
"""
import asyncio

import pytest

pytest.importorskip("aiortc")
pytest.importorskip("av")


@pytest.mark.live
def test_real_aiortc_offer_gets_answer_and_frames():
    import numpy as np
    from aiortc import RTCPeerConnection, RTCSessionDescription
    from aiortc.mediastreams import VideoStreamTrack
    from av import VideoFrame

    from vision.frame_sink import VideoFrameSink
    from vision.webrtc_receiver import WebRTCReceiver

    class ColorBars(VideoStreamTrack):
        async def recv(self):
            pts, time_base = await self.next_timestamp()
            arr = np.zeros((240, 320, 3), dtype=np.uint8)
            frame = VideoFrame.from_ndarray(arr, format="rgb24")
            frame.pts, frame.time_base = pts, time_base
            return frame

    async def run():
        sink = VideoFrameSink()
        rx = WebRTCReceiver(sink)  # real aiortc peer

        offerer = RTCPeerConnection()
        offerer.addTrack(ColorBars())
        offer = await offerer.createOffer()
        await offerer.setLocalDescription(offer)

        answer = await rx.handle_offer(offerer.localDescription.sdp)
        await offerer.setRemoteDescription(
            RTCSessionDescription(sdp=answer["sdp"], type="answer")
        )

        # let a few frames flow
        for _ in range(50):
            if sink.frame_count > 0:
                break
            await asyncio.sleep(0.1)

        assert sink.frame_count > 0
        await rx.close()
        await offerer.close()

    asyncio.run(run())
