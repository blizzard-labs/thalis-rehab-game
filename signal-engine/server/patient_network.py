"""Start the patient-only HTTPS listener when a clinician creates an invitation."""

import asyncio
from datetime import datetime, timedelta, timezone
import ipaddress
import os
from pathlib import Path
import socket
import ssl

from aiohttp import web
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID


def local_address():
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as route:
        # UDP connect selects the local route without sending a packet.
        route.connect(("192.0.2.1", 9))
        return route.getsockname()[0]


def save_key(path, key):
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "wb") as file:
        file.write(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                     serialization.NoEncryption()))


def station_certificate(root, host):
    root.mkdir(parents=True, exist_ok=True)
    ca_path, ca_key_path = root / "authority.pem", root / "authority.key"
    now = datetime.now(timezone.utc)
    if ca_path.exists() and ca_key_path.exists():
        ca = x509.load_pem_x509_certificate(ca_path.read_bytes())
        ca_key = serialization.load_pem_private_key(ca_key_path.read_bytes(), password=None)
    else:
        ca_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "NeuroReach local station")])
        ca = (x509.CertificateBuilder().subject_name(name).issuer_name(name)
              .public_key(ca_key.public_key()).serial_number(x509.random_serial_number())
              .not_valid_before(now - timedelta(minutes=5)).not_valid_after(now + timedelta(days=3650))
              .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
              .add_extension(x509.KeyUsage(digital_signature=True, content_commitment=False,
                  key_encipherment=False, data_encipherment=False, key_agreement=False,
                  key_cert_sign=True, crl_sign=True, encipher_only=None, decipher_only=None), critical=True)
              .sign(ca_key, hashes.SHA256()))
        save_key(ca_key_path, ca_key)
        ca_path.write_bytes(ca.public_bytes(serialization.Encoding.PEM))
    names = [x509.DNSName("localhost"), x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]
    try:
        names.append(x509.IPAddress(ipaddress.ip_address(host)))
    except ValueError:
        names.append(x509.DNSName(host))
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    cert = (x509.CertificateBuilder()
            .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, host)]))
            .issuer_name(ca.subject).public_key(key.public_key()).serial_number(x509.random_serial_number())
            .not_valid_before(now - timedelta(minutes=5)).not_valid_after(now + timedelta(days=365))
            .add_extension(x509.SubjectAlternativeName(names), critical=False)
            .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
            .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False)
            .sign(ca_key, hashes.SHA256()))
    cert_path, key_path = root / "station.pem", root / "station.key"
    save_key(key_path, key)
    cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM) + ca.public_bytes(serialization.Encoding.PEM))
    return cert_path, key_path, ca_path


class PatientNetwork:
    def __init__(self, port=8443, host=None, cert=None, key=None):
        self.port, self.host = port, host
        self.cert, self.key = cert, key
        self.origin = ""
        self.runner = None
        self.site = None
        self.authority = None
        self.lock = asyncio.Lock()

    async def ensure(self):
        async with self.lock:
            if self.site:
                return self.origin
            try:
                host = self.host or local_address()
                cert, key = self.cert, self.key
                if not cert:
                    root = Path(os.environ.get("NEUROREACH_DATA_DIR", Path.home() / ".neuroreach")) / "network"
                    cert, key, self.authority = await asyncio.to_thread(station_certificate, root, host)
                tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
                tls.load_cert_chain(cert, key)
                site = web.TCPSite(self.runner, host, self.port, ssl_context=tls)
                await site.start()
            except (OSError, ValueError) as error:
                raise web.HTTPServiceUnavailable(
                    text="The patient device connection could not start. Connect this computer to Wi-Fi and retry. " + str(error)
                )
            self.site = site
            self.origin = f"https://{host}:{self.port}"
            return self.origin
