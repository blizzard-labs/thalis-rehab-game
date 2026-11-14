import asyncio

from aiohttp import ClientSession, DummyCookieJar, WSServerHandshakeError, web
from aiohttp.test_utils import TestClient, TestServer
import pytest

from server.clinic_records import register_clinic


def test_mirror_is_session_scoped_ephemeral_and_staff_authenticated(tmp_path):
    async def scenario():
        app = web.Application()
        pairing = register_clinic(app, tmp_path)
        async with TestClient(TestServer(app)) as staff:
            await staff.post("/api/staff/setup", json={"password": "screen-mirror-test-password"})
            people = await (await staff.post("/api/staff/participants",
                json={"name": "Mirror fixture", "side": "left", "consent": True})).json()
            invitation = await (await staff.post("/api/staff/display",
                json={"participant": people[0]["id"], "game": "garden"})).json()
            claim = await (await staff.post("/api/display/claim",
                json={"code": invitation["url"].split("=")[1]})).json()
            path = "/api/staff/display/mirror?session=" + invitation["session"]
            async with ClientSession(cookie_jar=DummyCookieJar()) as anonymous:
                with pytest.raises(WSServerHandshakeError) as denied:
                    await anonymous.ws_connect(staff.make_url(path))
                assert denied.value.status == 401
            with pytest.raises(WSServerHandshakeError) as wrong:
                await staff.ws_connect("/api/staff/display/mirror?session=another-visit")
            assert wrong.value.status == 409
            async with staff.ws_connect(path) as viewer:
                assert await viewer.receive_json() == {"type": "waiting"}
                async with staff.ws_connect("/api/display/mirror") as publisher:
                    await publisher.send_json({"token": claim["token"]})
                    assert await publisher.receive_json() == {"type": "ready"}
                    frame = {"type": "frame", "html": "<div>Patient screen</div>", "css": "body{color:teal}",
                             "width": 800, "height": 600}
                    await publisher.send_json(frame)
                    assert await viewer.receive_json() == frame
                    async with staff.ws_connect(path) as resumed:
                        assert await resumed.receive_json() == frame
                    backup = await (await staff.get("/api/staff/backup")).text()
                    assert "Patient screen" not in backup and "color:teal" not in backup
                    await staff.post("/api/staff/logout")
                    await publisher.send_json({**frame, "html": "<div>After lock</div>"})
                    assert (await viewer.receive()).type.name in {"CLOSE", "CLOSED"}
            assert pairing.screen.frame is None

    asyncio.run(scenario())


def test_incremental_mirror_resumes_at_latest_state_and_pauses_capture_without_viewers(tmp_path):
    async def scenario():
        app = web.Application()
        register_clinic(app, tmp_path)
        async with TestClient(TestServer(app)) as clinic:
            await clinic.post("/api/staff/setup", json={"password": "screen-mirror-updates"})
            people = await (await clinic.post("/api/staff/participants",
                json={"name": "Mirror fixture", "side": "left", "consent": True})).json()
            invite = await (await clinic.post("/api/staff/display",
                json={"participant": people[0]["id"], "game": "stars"})).json()
            claim = await (await clinic.post("/api/display/claim",
                json={"code": invite["url"].split("=")[1]})).json()
            path = "/api/staff/display/mirror?updates=1&session=" + invite["session"]
            async with clinic.ws_connect("/api/display/mirror") as patient:
                await patient.send_json({"token": claim["token"], "updates": True})
                assert await patient.receive_json(timeout=3) == {"type": "ready", "updates": True, "watching": False}
                async with clinic.ws_connect(path) as viewer:
                    assert await patient.receive_json(timeout=3) == {"type": "mode", "updates": True, "watching": True}
                    assert await viewer.receive_json(timeout=3) == {"type": "waiting"}
                    frame = {"type": "frame", "scene": 1, "html": '<b data-nr-mirror="2">0</b>',
                             "css": "b{color:blue}", "edits": {}, "width": 800, "height": 600}
                    await patient.send_json(frame)
                    assert await viewer.receive_json(timeout=3) == frame
                    edits = {"2:#text": "5"}
                    patch = {"type": "frame", "scene": 1, "width": 800, "height": 600, "edits": edits}
                    await patient.send_json(patch)
                    assert await viewer.receive_json(timeout=3) == patch
                    async with clinic.ws_connect(path) as late:
                        assert await late.receive_json(timeout=3) == {**frame, "edits": edits}
                    async with clinic.ws_connect(path.replace("updates=1&", "")) as legacy:
                        assert await patient.receive_json(timeout=3) == {"type": "mode", "updates": False, "watching": True}
                        assert await legacy.receive_json(timeout=3) == {"type": "waiting"}
                        standalone = {"type": "frame", "width": 800, "height": 600, "html": "<b>6</b>", "css": ""}
                        await patient.send_json(standalone)
                        assert await legacy.receive_json(timeout=3) == standalone
                    assert await patient.receive_json(timeout=3) == {"type": "mode", "updates": True, "watching": True}
                assert await patient.receive_json(timeout=3) == {"type": "mode", "updates": True, "watching": False}

    asyncio.run(scenario())


def test_slow_mirror_viewer_skips_stale_updates_without_losing_scene_changes():
    from types import SimpleNamespace
    from server.screen_mirror import ScreenMirror, Viewer

    async def scenario():
        relay = ScreenMirror(SimpleNamespace(current=SimpleNamespace(
            session_id="visit", token="token", state="playing")), lambda _: True)
        relay.session, relay.frame_token = "visit", "token"
        viewer = Viewer(SimpleNamespace(query={"session": "visit", "updates": "1"}))
        sending, resume = asyncio.Event(), asyncio.Event()
        messages = []

        class SlowSocket:
            closed = False

            async def send_json(self, frame):
                if not messages:
                    sending.set()
                    await resume.wait()
                messages.append(frame)
                self.closed = len(messages) == 2

        socket = SlowSocket()
        relay.viewers[socket] = viewer
        frame = {"type": "frame", "scene": 1, "html": "<p>0</p>", "width": 800, "height": 600}
        assert relay.accept_frame(frame)
        writer = asyncio.create_task(relay.send_latest(socket, viewer))
        await asyncio.wait_for(sending.wait(), 1)
        assert relay.accept_frame({**frame, "scene": 2, "html": '<b data-nr-mirror="1">0</b>'})
        for i in range(20):
            assert relay.accept_frame({"type": "frame", "scene": 2, "width": 800,
                                       "height": 600, "edits": {"1:#text": str(i)}})
        resume.set()
        await asyncio.wait_for(writer, 1)
        assert [message["scene"] for message in messages] == [1, 2]
        assert messages[-1]["html"].startswith("<b") and messages[-1]["edits"] == {"1:#text": "19"}

    asyncio.run(scenario())


def test_camera_pixels_are_sent_once_and_retained_for_a_viewer_who_misses_an_update():
    from types import SimpleNamespace
    from server.screen_mirror import ScreenMirror, Viewer

    async def scenario():
        relay = ScreenMirror(SimpleNamespace(current=SimpleNamespace(
            session_id="visit", token="token", state="playing")), lambda _: True)
        relay.session, relay.frame_token = "visit", "token"
        relay.publisher_patches = True
        base = {"type": "frame", "scene": 1, "width": 800, "height": 600}
        assert relay.accept_frame({**base, "html": "<img><b>0</b>", "edits": {}})
        assert relay.accept_frame({**base, "patch": True, "edits": {"0:src": "camera pixels"}})
        assert relay.accept_frame({**base, "patch": True, "edits": {"1:#text": "75"},
                                   "live": {"phase": "play", "input": .75, "cameraLevel": .75,
                                            "eegLevel": 99, "unexpected": "discard"}})

        async def deliver(revision, base_id, patches=True):
            query = {"session": "visit", "updates": "1", "patches": "1" if patches else "0"}
            viewer = Viewer(SimpleNamespace(query=query), revision=revision, base=base_id)
            class Socket:
                closed = False
                async def send_json(self, frame):
                    self.received = frame
                    self.closed = True
            socket = Socket()
            viewer.changed.set()
            await asyncio.wait_for(relay.send_latest(socket, viewer), 1)
            return socket.received

        current = await deliver(relay.revision - 1, relay.base)
        assert current["patch"] and current["edits"] == {"1:#text": "75"}
        assert current["live"] == {"phase": "play", "camera": "", "eeg": "",
                                   "cameraLevel": .75, "eegLevel": None, "input": .75}
        for frame in (await deliver(relay.revision - 2, relay.base),
                      await deliver(relay.revision - 1, relay.base, False),
                      await deliver(-1, -1)):
            assert "patch" not in frame and frame["edits"] == {"0:src": "camera pixels", "1:#text": "75"}
            assert frame["live"] == current["live"]
        assert not relay.accept_frame({**base, "patch": True, "scene": 2})
        assert relay.accept_frame({**base, "scene": 2, "html": "<p>Paused</p>", "live": None})
        assert relay.frame["edits"] == {} and relay.frame["live"] is None

    asyncio.run(scenario())


def test_generated_station_certificate_is_reusable_and_matches_patient_address(tmp_path):
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes
    from server.patient_network import station_certificate
    import ipaddress
    import ssl

    cert_path, key_path, ca_path = station_certificate(tmp_path, "192.168.1.7")
    ca = x509.load_pem_x509_certificate(ca_path.read_bytes())
    cert = x509.load_pem_x509_certificate(cert_path.read_bytes())
    cert.verify_directly_issued_by(ca)
    names = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
    assert ipaddress.ip_address("192.168.1.7") in names.get_values_for_type(x509.IPAddress)
    assert "localhost" in names.get_values_for_type(x509.DNSName)
    tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    tls.load_cert_chain(cert_path, key_path)
    station_certificate(tmp_path, "192.168.1.8")
    assert ca.fingerprint(hashes.SHA256()) == x509.load_pem_x509_certificate(ca_path.read_bytes()).fingerprint(hashes.SHA256())


def test_supervised_invitation_starts_a_trusted_patient_only_lan_listener(tmp_path):
    import os
    from pathlib import Path
    import ssl
    import subprocess
    import sys
    from aiohttp import CookieJar

    service = subprocess.Popen(
        [sys.executable, str(Path(__file__).resolve().parents[1] / "local_companion.py"),
         "--port", "18776", "--display-port", "18777"],
        env={**os.environ, "NEUROREACH_DATA_DIR": str(tmp_path)},
        stdout=subprocess.DEVNULL,
    )

    async def scenario():
        async with ClientSession(cookie_jar=CookieJar(unsafe=True)) as client:
            staff = "http://127.0.0.1:18776/api/staff"
            for _ in range(75):
                try:
                    if (await client.get(staff + "/state")).status == 200:
                        break
                except OSError:
                    pass
                await asyncio.sleep(0.2)
            else:
                raise AssertionError("Companion did not start")
            await client.post(staff + "/setup", json={"password": "automatic-network-test"})
            people = await (await client.post(staff + "/participants",
                json={"name": "Network fixture", "side": "right", "consent": True})).json()
            invite = await (await client.post(staff + "/display",
                json={"participant": people[0]["id"], "game": "garden"})).json()
            assert invite["url"].startswith("https://") and ":18777/#display=" in invite["url"]
            assert "127.0.0.1" not in invite["url"] and "localhost" not in invite["url"]
            cert = await client.get(staff + "/display/certificate")
            public = await cert.read()
            assert public == (tmp_path / "network" / "authority.pem").read_bytes()
            assert b"PRIVATE KEY" not in public
            trust = ssl.create_default_context(cadata=public.decode())
            origin = invite["url"].split("/#")[0]
            assert (await client.get(origin + "/api/health", ssl=trust)).status == 200
            assert (await client.get(origin + "/api/staff/state", ssl=trust)).status == 403
            claimed = await client.post(origin + "/api/display/claim", ssl=trust,
                headers={"Origin": origin}, json={"code": invite["url"].split("#display=")[1]})
            assert claimed.status == 200
            token = (await claimed.json())["token"]
            synced = await client.post(origin + "/api/display/sync", ssl=trust,
                headers={"Origin": origin, "Authorization": "Bearer " + token}, json={})
            assert (await synced.json())["session"] == invite["session"]

    try:
        asyncio.run(scenario())
    finally:
        service.terminate()
        service.wait(timeout=10)
