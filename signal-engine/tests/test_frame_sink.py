from vision.frame_sink import VideoFrameSink


def test_latest_returns_most_recent_and_counts():
    sink = VideoFrameSink()
    assert sink.latest() is None
    assert sink.frame_count == 0

    sink.push("frame-a")
    sink.push("frame-b")

    assert sink.latest() == "frame-b"
    assert sink.frame_count == 2


def test_clear_resets_latest_but_not_count():
    sink = VideoFrameSink()
    sink.push("frame-a")
    sink.clear()
    assert sink.latest() is None
    # count is a monotonic received-tally, not a buffer size
    assert sink.frame_count == 1
