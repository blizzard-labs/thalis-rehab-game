"""Check the distributed runtime and desktop without Python or Node on PATH."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
from tempfile import TemporaryDirectory
import time
from urllib.request import urlopen

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('executable', type=Path)
parser.add_argument('--screenshot', type=Path)
args = parser.parse_args()
executable = args.executable.resolve()
with TemporaryDirectory(prefix='neuroreach-installer-check-') as temporary:
    folder = Path(temporary)
    env = {**os.environ, 'NEUROREACH_DATA_DIR': str(folder / 'station'), 'PATH': str(folder)}
    env.pop('PYLSL_LIB', None)
    env.pop('PYTHONPATH', None)
    result = folder / 'runtime.json'
    subprocess.run([executable, '--runtime-check', result], env=env, check=True, timeout=90)
    runtime = json.loads(result.read_text())
    assert runtime['frozen'] and runtime['web'] and runtime['camera'] and runtime['lsl'] > 0, runtime
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    if args.screenshot:
        env['NEUROREACH_DESKTOP_SCREENSHOT'] = str(args.screenshot.resolve())
    subprocess.run([executable, '--desktop-smoke-check', '--port', str(port)], env=env, check=True, timeout=90)
    # Check the real browser entry, records and exports in the packaged service.
    spec = importlib.util.spec_from_file_location('records_check', Path(__file__).with_name('verify-windows-upgrade.py'))
    checks = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(checks)
    from http.cookiejar import CookieJar
    from urllib.request import build_opener, HTTPCookieProcessor, Request
    password = 'Disposable station password 912'
    original = None
    for cycle in range(2):
        process = subprocess.Popen([executable, '--port', str(port), '--local-only'], env=env)
        client = build_opener(HTTPCookieProcessor(CookieJar()))
        def api(path, method='GET', body=None):
            request = Request(f'http://127.0.0.1:{port}/api/' + path, method=method,
                data=None if body is None else json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
            with client.open(request, timeout=10) as response:
                return json.load(response) if response.headers.get_content_type() == 'application/json' else response.read()
        try:
            deadline = time.monotonic() + 60
            while True:
                if process.poll() is not None:
                    raise RuntimeError('Packaged service exited before readiness')
                try:
                    assert api('health')['app'] == 'NeuroReach'
                    break
                except OSError:
                    if time.monotonic() > deadline:
                        raise
                    time.sleep(.2)
            with urlopen(f'http://127.0.0.1:{port}/') as response:
                assert b'NeuroReach: EEG-Assisted Rehab' in response.read()
            if cycle == 0:
                session_id = checks.create_visit(api, password)
                original = checks.inspect_visit(api, session_id)
            else:
                assert api('staff/state') == {'configured': True, 'authenticated': False}
                api('staff/login', 'POST', {'password': password})
                assert checks.inspect_visit(api, session_id) == original
        finally:
            process.terminate()
            process.wait(timeout=15)
    print('Bundled runtime, desktop launch, staff records, PDF/CSV and restart passed without Python/Node on PATH.')
