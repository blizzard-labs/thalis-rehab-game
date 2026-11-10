"""Exercise the installed Windows application on a disposable CI station."""

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import csv
from http.cookiejar import CookieJar
import io
import json
import os
from pathlib import Path
import secrets
import subprocess
from tempfile import TemporaryDirectory
import time
from urllib.error import URLError
from urllib.request import build_opener, HTTPCookieProcessor, Request
from uuid import uuid4


def install(setup, destination):
    subprocess.run(
        [setup, "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART"],
        check=True, timeout=150,
    )
    if not (destination / "NeuroReach.exe").is_file():
        raise RuntimeError("Installer did not create the launcher")


@contextmanager
def station(directory, data):
    port = 18774
    process = subprocess.Popen(
        [directory / "NeuroReach.exe", "--port", str(port)],
        env={**os.environ, "NEUROREACH_DATA_DIR": str(data)},
    )
    client = build_opener(HTTPCookieProcessor(CookieJar()))

    def api(path, method="GET", body=None):
        request = Request(
            f"http://127.0.0.1:{port}/api/" + path, method=method,
            data=None if body is None else json.dumps(body).encode(),
            headers={"Content-Type": "application/json"},
        )
        with client.open(request, timeout=10) as response:
            if response.headers.get_content_type() == "application/json":
                return json.load(response)
            return response.read()

    try:
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise RuntimeError("Installed launcher exited before the station was ready")
            try:
                if api("health")["app"] == "NeuroReach":
                    break
            except URLError:
                time.sleep(0.5)
        else:
            raise RuntimeError("Installed station did not start")
        yield api
    finally:
        if process.poll() is None:
            process.terminate()
        process.wait(timeout=15)


def create_visit(api, password):
    api("staff/setup", "POST", {"password": password})
    people = api("staff/participants", "POST", {
        "name": "Installer check", "side": "left", "consent": True,
    })
    session_id = str(uuid4())
    api("staff/sessions", "PUT", {
        "participant": people[0]["id"], "status": "complete",
        "record": {
            "id": session_id, "started": datetime.now(timezone.utc).isoformat(),
            "game": "stars", "sources": ["button"], "elapsed": 8, "actions": 1,
            "rewards": 1, "events": [
                {"seconds": 8, "kind": kind, "source": "button"} for kind in ("action", "reward")
            ],
        },
    })
    api(f"staff/sessions/{session_id}/feedback", "PUT", {"note": "Verified seated round."})
    return session_id


def inspect_visit(api, session_id):
    backup = api("staff/backup")
    if len(backup["participants"]) != 1 or len(backup["sessions"]) != 1:
        raise RuntimeError("Expected one participant and one saved session")
    rows = list(csv.reader(io.StringIO(api(f"staff/reports/{session_id}.csv").decode("utf-8-sig"))))
    divider = rows.index([])
    measures = dict(rows[:divider])
    if measures["Session ID"] != session_id or measures["Rewards"] != "1" or measures["Actions"] != "1":
        raise RuntimeError("Exported report does not match the completed round")
    events = rows[divider + 2:]
    if [row[1] for row in events] != ["action", "reward"]:
        raise RuntimeError("Exported events do not match the completed round")
    if not api(f"staff/reports/{session_id}.pdf").startswith(b"%PDF-"):
        raise RuntimeError("Saved report could not be opened as a PDF")
    person = backup["participants"][0]
    visit = backup["sessions"][0]
    return (
        person["id"], person["name"], person["consent"], person["side"],
        json.loads(person["protocol"]), json.loads(person["assessments"]),
        visit["participant"], visit["status"], visit["note"], json.loads(visit["record"]),
        measures["Game"], measures["Input"], measures["Play seconds"], events,
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("current", type=Path)
    parser.add_argument("--previous", type=Path)
    args = parser.parse_args()
    if os.environ.get("GITHUB_ACTIONS") != "true" or os.name != "nt":
        parser.error("Run on the disposable Windows CI runner")
    previous = args.previous or args.current
    password = secrets.token_urlsafe(24)
    with TemporaryDirectory(dir=os.environ["RUNNER_TEMP"]) as temporary:
        install_dir = Path(os.environ["LOCALAPPDATA"]) / "Programs" / "NeuroReach"
        if install_dir.exists():
            raise RuntimeError("Expected a clean runner without an existing NeuroReach installation")
        data = Path(temporary) / "station"
        install(previous, install_dir)
        with station(install_dir, data) as api:
            session_id = create_visit(api, password)
            original = inspect_visit(api, session_id)
        for label, setup in [("Upgrade", args.current), ("Rollback", previous)]:
            if label == "Rollback" and not args.previous:
                continue
            install(setup, install_dir)
            with station(install_dir, data) as api:
                if api("staff/state") != {"configured": True, "authenticated": False}:
                    raise RuntimeError("Replaced station failed to reopen locked")
                api("staff/login", "POST", {"password": password})
                if inspect_visit(api, session_id) != original:
                    raise RuntimeError(f"{label} changed the backup or exported report")
            print(f"{label} preserved the login, participant, events, feedback and report.", flush=True)

        subprocess.run([install_dir / "unins000.exe", "/VERYSILENT", "/NORESTART"], check=True, timeout=90)
        deadline = time.monotonic() + 30
        while (install_dir / "NeuroReach.exe").exists() and time.monotonic() < deadline:
            time.sleep(0.5)
        if (install_dir / "NeuroReach.exe").exists() or not (data / "clinic.sqlite3").is_file():
            raise RuntimeError("Uninstall did not remove the application and preserve its station database")


if __name__ == "__main__":
    main()
