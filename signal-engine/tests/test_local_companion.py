"""Local HTTP security, selection and live-format LSL smoke without physical hardware."""
import asyncio

from aiohttp.test_utils import TestServer, TestClient
from local_companion import create_app
from acquisition.mock_eeg_outlet import MockUnicornOutlet
from acquisition import practice_eeg


def test_disallowed_origin_and_host():
    async def test():
        async with TestClient(TestServer(create_app())) as client:
            denied = await client.get("/api/eeg", headers={"Host":"127.0.0.1:8766","Origin":"https://other.example"})
            assert denied.status == 403
            denied = await client.get("/", headers={"Host":"other.example"})
            assert denied.status == 403
    asyncio.run(test())


def test_device_discovery_baseline_scoring_and_release(monkeypatch):
    monkeypatch.setattr(practice_eeg, "BASELINE_SECONDS", 3)
    async def test():
        outlet = MockUnicornOutlet(stream_name="UN-test-local-companion", stream_type="Data", seed=43)
        outlet.start()
        try:
            async with TestClient(TestServer(create_app())) as client:
                headers = {"Host":"127.0.0.1:8766","Origin":"http://127.0.0.1:8766"}
                for cycle in range(2):
                    async with client.ws_connect("/api/eeg", headers=headers) as ws:
                        discovery = await ws.receive_json(timeout=5)
                        device = next(d for d in discovery["devices"] if d["name"] == "UN-test-local-companion")
                        await ws.send_json({"cmd":"start","side":"left","device":device["id"]})
                        for _ in range(40):
                            event = await ws.receive_json(timeout=10)
                            assert event["type"] != "error", event
                            if event["type"] == "score" and event["level"] is not None:
                                assert 0 <= event["level"] <= 1
                                break
                        else:
                            raise AssertionError("No clean score reached the browser")
                    # Closing releases the acquisition thread and device lock.
                    await asyncio.sleep(.3)
        finally:
            outlet.stop()
    asyncio.run(test())
