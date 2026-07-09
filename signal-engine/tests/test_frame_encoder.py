import base64

import numpy as np

from vision.frame_encoder import encode_jpeg


class _FakeFrame:
    def __init__(self, arr):
        self._arr = arr

    def to_ndarray(self, format="rgb24"):
        return self._arr


def test_encode_jpeg_returns_base64_jpeg():
    arr = (np.random.rand(120, 160, 3) * 255).astype(np.uint8)
    out = encode_jpeg(_FakeFrame(arr), max_width=80)
    raw = base64.b64decode(out)
    # JPEG magic bytes.
    assert raw[:2] == b"\xff\xd8"


def test_encode_jpeg_downscales_wide_frames():
    import cv2

    arr = (np.random.rand(100, 400, 3) * 255).astype(np.uint8)
    out = encode_jpeg(_FakeFrame(arr), max_width=100)
    decoded = cv2.imdecode(np.frombuffer(base64.b64decode(out), np.uint8), cv2.IMREAD_COLOR)
    assert decoded.shape[1] == 100  # width capped
