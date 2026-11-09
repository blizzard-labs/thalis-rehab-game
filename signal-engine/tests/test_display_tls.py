"""Exercise the opt-in clinic HTTPS listener with a temporary trusted test certificate."""

import asyncio
import datetime
import os
import ssl
import subprocess
import sys
from pathlib import Path

from aiohttp import ClientSession, CookieJar
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID


def test_tls_display_cannot_access_records(tmp_path):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "localhost")])
    t = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(subject)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(t - datetime.timedelta(minutes=1))
        .not_valid_after(t + datetime.timedelta(hours=1))
        .add_extension(x509.SubjectAlternativeName([x509.DNSName("localhost")]), False)
        .sign(key, hashes.SHA256())
    )
    certfile, keyfile = tmp_path / "cert.pem", tmp_path / "key.pem"
    certfile.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    keyfile.write_bytes(
        key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
    )
    trust = ssl.create_default_context(cafile=str(certfile))
    service = subprocess.Popen(
        [
            sys.executable,
            str(Path(__file__).resolve().parents[1] / "local_companion.py"),
            "--port",
            "18770",
            "--display-host",
            "localhost",
            "--display-port",
            "18771",
            "--cert",
            str(certfile),
            "--key",
            str(keyfile),
        ],
        env={**os.environ, "NEUROREACH_DATA_DIR": str(tmp_path / "records")},
        stdout=subprocess.DEVNULL,
    )

    async def scenario():
        staff = "http://127.0.0.1:18770/api/staff"
        remote = "https://localhost:18771"
        async with ClientSession(cookie_jar=CookieJar(unsafe=True)) as c:
            for _ in range(50):
                try:
                    ready = await c.get(remote + "/api/health", ssl=trust)
                    assert ready.status == 200
                    break
                except OSError:
                    await asyncio.sleep(0.2)
            else:
                raise AssertionError("TLS display failed to start")
            await c.post(staff + "/setup", json={"password": "disposable-test-station"})
            people = await (
                await c.post(
                    staff + "/participants",
                    json={"name": "Private", "side": "left", "consent": True},
                )
            ).json()
            invite = await (
                await c.post(
                    staff + "/display", json={"participant": people[0]["id"], "game": "stars"}
                )
            ).json()
            assert invite["url"].startswith(remote + "/#display=")
            code = invite["url"].split("=")[1]
            response = await c.post(
                remote + "/api/display/claim",
                json={"code": code},
                ssl=trust,
                headers={"Origin": remote},
            )
            assert response.status == 200 and response.cookies["nr_display"]["secure"]
            assert (await c.get(remote + "/api/staff/state", ssl=trust)).status == 403
            assert (await c.get(remote + "/api/eeg", ssl=trust)).status == 403
            assert (
                await c.post(
                    remote + "/api/display/sync",
                    json={},
                    ssl=trust,
                    headers={"Origin": "https://other.example"},
                )
            ).status == 403

    try:
        asyncio.run(scenario())
    finally:
        service.terminate()
        service.wait(timeout=10)
