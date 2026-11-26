"""Validate the exact store ZIP and extract it for browser acceptance tests."""
from pathlib import Path
from zipfile import ZipFile
import hashlib
import json
import re
import struct
import subprocess

root = Path(__file__).resolve().parents[1]
source = root / 'game-controller-extension'
manifest = json.loads((source / 'manifest.json').read_text())
output = root / 'dist' / 'extension'
archive = output / f'NeuroReach-Game-Controller-{manifest["version"]}.zip'
first = archive.read_bytes()
subprocess.run(['node', str(root / 'patient-web/scripts/package-controller.mjs')], check=True, cwd=root)
assert archive.read_bytes() == first, 'Packaging must be reproducible'
checksum, filename = (output / 'SHA256SUMS.txt').read_text().split()
assert filename == archive.name and hashlib.sha256(first).hexdigest() == checksum
with ZipFile(archive) as package:
    assert package.testzip() is None
    names = package.namelist()
    assert len(names) == len(set(names)) and 'manifest.json' in names
    assert all(not name.startswith('/') and '..' not in Path(name).parts for name in names)
    built = json.loads(package.read('manifest.json'))
    assert built == manifest and built['manifest_version'] == 3
    assert len(built['description']) <= 132
    assert set(built['permissions']) == {'activeTab', 'scripting', 'debugger', 'sidePanel', 'storage'}
    assert not any(key in built for key in ['externally_connectable', 'web_accessible_resources', 'update_url'])
    assert built['host_permissions'] == ['http://127.0.0.1/*', 'http://localhost/*', 'https://blizzard-labs.github.io/thalis-rehab-game/*']
    csp = built['content_security_policy']['extension_pages']
    assert "script-src 'self';" in csp and "object-src 'none'" in csp
    assert 'unsafe-eval' not in csp
    for size, name in built['icons'].items():
        image = package.read(name)
        assert image[:8] == b'\x89PNG\r\n\x1a\n'
        assert struct.unpack('>II', image[16:24]) == (int(size), int(size))
    for name in names:
        if name.endswith('.js'):
            code = package.read(name).decode()
            assert not re.search(r'\beval\s*\(|new\s+Function\s*\(|\bfetch\s*\(|\bXMLHttpRequest\b', code), name
        if name.endswith('.html'):
            for script in re.findall(r'<script[^>]+src=["\']([^"\']+)', package.read(name).decode()):
                assert script in names, (name, script)
        if name != 'LICENSE': assert package.read(name) == (source / name).read_bytes(), name
    privacy = package.read('privacy.html')
    assert privacy == (root / 'patient-web/public/extension-privacy.html').read_bytes()
    assert b'Limited Use' in privacy
    package.extractall(output / 'unpacked')
with ZipFile(root / 'patient-web/public/game-controller-extension.zip') as manual:
    for name in names:
        assert manual.read('neuroreach-game-controller/' + name) == ZipFile(archive).read(name)
print(f'PASS: {archive.name}; root manifest, icons, permissions, CSP, local scripts, checksums, reproducibility, and manual/store parity.')
