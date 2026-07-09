"""Encode an aiortc av.VideoFrame to a base64 JPEG for the clinician camera feed.

Downscaled + moderate quality to keep the base64 payload small on the localhost
console<->sidecar socket. cv2 is imported lazily (mediapipe pulls opencv into the
eeg env) so importing this module stays cheap.
"""
from __future__ import annotations

import base64

from vision.pose_estimator import frame_to_ndarray


def encode_jpeg(av_frame: object, max_width: int = 480, quality: int = 70) -> str:
    import cv2  # lazy

    rgb = frame_to_ndarray(av_frame)  # HxWx3 rgb24
    h, w = rgb.shape[:2]
    if w > max_width:
        scale = max_width / float(w)
        rgb = cv2.resize(rgb, (max_width, max(1, int(h * scale))), interpolation=cv2.INTER_AREA)
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    ok, buf = cv2.imencode(".jpg", bgr, [int(cv2.IMWRITE_JPEG_QUALITY), int(quality)])
    if not ok:
        return ""
    return base64.b64encode(buf.tobytes()).decode("ascii")
