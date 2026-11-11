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
