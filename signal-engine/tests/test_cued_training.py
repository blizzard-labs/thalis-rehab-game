"""Optional full-duration cue block through the real LSL and WebSocket entry points."""

import asyncio
import os
from uuid import uuid4

import pytest
from aiohttp.test_utils import TestClient, TestServer
from acquisition import practice_eeg
from acquisition.mock_eeg_outlet import MockSignalConfig, MockUnicornOutlet
from local_companion import create_app


@pytest.mark.skipif(
    os.getenv("NEUROREACH_TEST_TRAINING") != "1",
    reason="Explicit extended test, approximately four minutes",
)
def test_cued_imagery_fit_live_score_and_reload(monkeypatch, tmp_path):
    monkeypatch.setenv("NEUROREACH_DATA_DIR", str(tmp_path))
    monkeypatch.setattr(practice_eeg, "BASELINE_SECONDS", 3)
    owner = str(uuid4())

    async def scenario():
        outlet = MockUnicornOutlet(
            stream_name="UN-training-verification",
            stream_type="Data",
            seed=17,
            signal=MockSignalConfig(noise_std=1, mu_amp=12),
        )
        outlet.start()
        try:
            async with TestClient(TestServer(create_app())) as client:
                for train in [True, False]:
                    async with client.ws_connect(
                        "/api/eeg",
                        headers={"Host": "127.0.0.1:8766", "Origin": "http://127.0.0.1:8766"},
                    ) as ws:
                        discovery = await ws.receive_json(timeout=10)
                        device = next(
                            d
                            for d in discovery["devices"]
                            if d["name"] == "UN-training-verification"
                        )
                        await ws.send_json(
                            {
                                "cmd": "start",
                                "device": device["id"],
                                "profile": owner,
                                "side": "left",
                                "train": train,
                            }
                        )
                        trials = set()
                        ready = None
                        for _ in range(250):
                            event = await ws.receive_json(timeout=20)
                            assert event["type"] != "error", event
                            cue = event.get("message", "")
                            if "Imagine moving your left hand" in cue:
                                trial = cue.split(" · ")[0]
                                if trial not in trials:
                                    trials.add(trial)
                                    outlet.inject_erd("C4", (8, 12), 0, 5.3, 1.0)
                            if event["type"] == "ready":
                                ready = event
                                assert ready["method"] == "CSP/LDA + band power", ready
                                assert ready["accuracy"] >= 0.60 and ready["synthetic"]
                            if event["type"] == "score" and event["level"] is not None and ready:
                                break
                        else:
                            raise AssertionError("No live score after calibration")
                        assert len(trials) == (10 if train else 0)
                    await asyncio.sleep(0.5)
        finally:
            outlet.stop()

    asyncio.run(scenario())
