"""A desktop launch must own only its own service and need no Python on the user's PATH."""
import json
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.request import urlopen

from companion_desktop import Companion


def free_port():
    with socket.socket() as server:
        server.bind(('127.0.0.1', 0))
        return server.getsockname()[1]


def wait_for(app, state):
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline and app.state != state:
        time.sleep(.05)
    assert app.state == state


def test_desktop_starts_reuses_and_stops_only_owned_service(tmp_path, monkeypatch):
    monkeypatch.setenv('NEUROREACH_DATA_DIR', str(tmp_path))
    first = Companion(free_port(), local_only=True)
    second = Companion(first.port, local_only=True)
    try:
        first.start()
        wait_for(first, 'ready')
        first.start()  # Repeated clicks must not bind another listener.
        second.start()
        wait_for(second, 'shared')
        second.stop()
        with urlopen(first.url + '/api/health') as response:
            assert json.load(response)['app'] == 'NeuroReach'
        assert first.owned
        with urlopen(first.url + "/api/staff/state") as response:
            assert json.load(response) == {"configured": False, "authenticated": False}
    finally:
        second.stop()
        first.stop()
    assert first.state == 'stopped'
    assert not first.thread.is_alive()
    assert (tmp_path / 'clinic.sqlite3').is_file()
    first.start()
    try:
        wait_for(first, 'ready')
    finally:
        first.stop()


def test_desktop_leaves_unrelated_port_owner_running(tmp_path, monkeypatch):
    monkeypatch.setenv("NEUROREACH_DATA_DIR", str(tmp_path))
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'{"app":"another application"}')
        def log_message(self, *_args):
            pass
    server = HTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    app = Companion(server.server_port, local_only=True)
    try:
        app.start()
        wait_for(app, 'port-error')
        app.stop()
        with urlopen(app.url) as response:
            assert json.load(response)['app'] == 'another application'
    finally:
        server.shutdown()
        server.server_close()


def test_close_during_startup_does_not_leave_a_server(tmp_path, monkeypatch):
    monkeypatch.setenv('NEUROREACH_DATA_DIR', str(tmp_path))
    app = Companion(free_port(), local_only=True)
    app.start()
    app.stop()
    assert not app.thread.is_alive()
    assert not app.owned
