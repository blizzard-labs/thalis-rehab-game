"""Authenticated, single-station records for the localhost staff workspace."""

import asyncio
import csv
import hashlib
import hmac
import io
import json
import math
import os
from pathlib import Path
import secrets
import shutil
import sqlite3
import time
from uuid import UUID, uuid4
from datetime import datetime, timezone
from xml.sax.saxutils import escape

from aiohttp import web
from server.display_pairing import DisplayPairing, GAMES, keeper_work
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table

PREFIX = "/api/staff"
COOKIE = "nr_staff"
SOURCES = {
    "button": "One button",
    "camera": "Camera",
    "eeg": "EEG headset",
    "blended": "Camera + EEG",
}


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def checked(condition, message):
    if not condition:
        raise web.HTTPBadRequest(text=message)


def bounded(value, limit):
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
        and 0 <= value <= limit
    )


def validate_record(r):
    checked(isinstance(r, dict), "Invalid session record")
    try:
        UUID(r["id"])
        datetime.fromisoformat(r["started"].replace("Z", "+00:00"))
    except (KeyError, ValueError, TypeError, AttributeError):
        raise web.HTTPBadRequest(text="Invalid session identity or start time")
    checked(
        isinstance(r.get("game"), str)
        and r["game"] in GAMES
        and isinstance(r.get("sources"), list)
        and 1 <= len(r["sources"]) <= 8
        and all(isinstance(s, str) and s in SOURCES for s in r["sources"]),
        "Invalid game or input",
    )
    transitions = {
        "blended": {"camera", "eeg", "button"},
        "camera": {"button"},
        "eeg": {"button"},
        "button": set(),
    }
    checked(
        all(b in transitions[a] for a, b in zip(r["sources"], r["sources"][1:])),
        "Invalid input transition",
    )
    checked(
        all(bounded(r.get(k), 1e7) for k in ("elapsed", "actions", "rewards"))
        and all(isinstance(r[k], int) for k in ("actions", "rewards"))
        and r["rewards"] <= r["actions"],
        "Invalid session totals",
    )
    measurements = r.get("measurements", {})
    checked(isinstance(measurements, dict), "Invalid measurements")
    for source, value in measurements.items():
        checked(
            source in r["sources"]
            and source != "button"
            and isinstance(value, dict)
            and all(
                bounded(value.get(key), r["elapsed"] + 0.01)
                for key in ("validSeconds", "missingSeconds", "weightedLevel")
            ),
            "Invalid measured duration",
        )
    if "intervals" in r:
        rows = r["intervals"]
        checked(isinstance(rows, list) and len(rows) <= math.ceil(r["elapsed"] / 30) + len(r["sources"]) + 1,
                "Invalid measurement intervals")
        prev_index, within = -1, 0
        source_position = 0
        for interval in rows:
            checked(isinstance(interval, dict), "Invalid interval")
            index = interval.get("index")
            source = interval.get("source")
            checked(type(index) is int and 0 <= index <= r["elapsed"] / 30 and index >= prev_index
                    and source in r["sources"][source_position:], "Invalid interval order or source")
            source_position = r["sources"].index(source, source_position)
            seconds = interval.get("seconds")
            checked(bounded(seconds, 30.001) and seconds > 0 and bounded(interval.get("above"), seconds + 0.001),
                    "Invalid interval duration")
            within = seconds + (within if index == prev_index else 0)
            checked(within <= min(30, r["elapsed"] - index * 30) + 0.001, "Overlapping measurement intervals")
            prev_index = index
            metrics = interval.get("metrics")
            allowed = set()
            if source != "button":
                allowed.add("input")
            if source in ("camera", "blended"):
                allowed.update(("reach", "shoulder", "elbow", "tilt"))
            if source in ("eeg", "blended"):
                allowed.update(("muC3", "muCz", "muC4", "classifier"))
            checked(isinstance(metrics, dict) and metrics.keys() <= allowed, "Invalid interval metrics")
            for value in metrics.values():
                checked(isinstance(value, dict) and bounded(value.get("seconds"), seconds + 0.001)
                        and value["seconds"] > 0 and all(type(value.get(k)) in (float, int)
                        and math.isfinite(value[k]) for k in ("integral", "peak")), "Invalid interval measurement")
    if "arm" in r:
        checked(r["arm"] in ("left", "right"), "Invalid practice arm")
    if r.get("feedback"):
        feedback = r["feedback"]
        checked(
            isinstance(feedback, dict)
            and bounded(feedback.get("count"), 1e7)
            and bounded(feedback.get("p95Ms"), 10000),
            "Invalid latency summary",
        )
        buckets = feedback.get("buckets")
        if buckets is not None:
            checked(
                isinstance(buckets, dict)
                and len(buckets) <= 10001
                and all(
                    isinstance(k, str)
                    and k.isascii()
                    and k.isdigit()
                    and len(k) <= 5
                    and 0 <= int(k) <= 10000
                    and type(v) is int
                    and v > 0
                    for k, v in buckets.items()
                )
                and sum(buckets.values()) == feedback["count"],
                "Invalid latency distribution",
            )
    if r.get("calibration"):
        c = r["calibration"]
        checked(
            isinstance(c, dict)
            and c.get("method") in ("CSP/LDA + band power", "rest-calibrated band power")
            and (c.get("accuracy") is None or bounded(c["accuracy"], 1)),
            "Invalid calibration summary",
        )
    events = r.get("events")
    checked(isinstance(events, list) and len(events) <= 50000, "Invalid event history")
    for e in events:
        checked(
            isinstance(e, dict)
            and e.get("kind") in ("action", "pause", "resume", "switch", "reward")
            and bounded(e.get("seconds"), r["elapsed"] + 1)
            and e.get("source") in SOURCES,
            "Invalid event",
        )
    checked(sum(e["kind"] == "reward" for e in events) == r["rewards"], "Rewards do not reconcile")


def db_open(root):
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    db = sqlite3.connect(root / "clinic.sqlite3")
    db.row_factory = sqlite3.Row
    db.executescript(
        """
        PRAGMA foreign_keys=ON;
        CREATE TABLE IF NOT EXISTS credentials(id INTEGER PRIMARY KEY CHECK(id=1),salt BLOB,hash BLOB);
        CREATE TABLE IF NOT EXISTS participants(id TEXT PRIMARY KEY,name TEXT NOT NULL,side TEXT NOT NULL,
            consent TEXT NOT NULL,protocol TEXT NOT NULL,assessments TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,participant TEXT NOT NULL REFERENCES participants(id)
            ON DELETE CASCADE,record TEXT NOT NULL,status TEXT NOT NULL,updated TEXT NOT NULL);
    """
    )
    if "note" not in {row[1] for row in db.execute("PRAGMA table_info(sessions)")}:
        with db:
            db.execute("ALTER TABLE sessions ADD COLUMN note TEXT NOT NULL DEFAULT ''")
    try:
        os.chmod(root / "clinic.sqlite3", 0o600)
    except OSError:
        pass
    return db


def render_report(row, participant, fmt):
    r = json.loads(row["record"])
    measures = [
        ("Participant", participant["name"]),
        ("Session ID", r["id"]),
        ("Started", r["started"]),
        ("Game", GAMES[r["game"]]),
        ("Status", row["status"]),
        ("Input", " → ".join(SOURCES[s] for s in r["sources"])),
        ("Play seconds", str(round(r["elapsed"], 1))),
        ("Actions", str(r["actions"])),
        ("Rewards", str(r["rewards"])),
    ]
    for source, m in r.get("measurements", {}).items():
        valid = m["validSeconds"]
        measures.extend(
            [
                (SOURCES[source] + " observed seconds", str(round(valid, 1))),
                (SOURCES[source] + " missing seconds", str(round(m["missingSeconds"], 1))),
            ]
        )
        if valid:
            measures.append(
                (
                    SOURCES[source] + " mean normalized input",
                    str(round(m["weightedLevel"] / valid, 3)),
                )
            )
    if r.get("calibration"):
        c = r["calibration"]
        measures.append(("EEG scoring method", c["method"]))
        if c.get("synthetic"):
            measures.append(("EEG source", "Synthetic test stream"))
        if c["accuracy"] is not None:
            measures.append(("Calibration cross-validation accuracy", str(round(c["accuracy"], 3))))
    if r.get("feedback"):
        latency = r["feedback"]
        measures.append(("EEG sample to browser paint callback (p95 ms)", str(latency["p95Ms"])))
        measures.append(("Timed display updates", str(latency["count"])))
    assessment = json.loads(participant["assessments"])
    prior = [a for a in assessment if a["date"] <= r["started"][:10]]
    if prior:
        last = max(prior, key=lambda a: a["date"])
        measures.extend(
            [
                ("Assessment date", last["date"]),
                ("FMA-UE (entered)", str(last["fma"])),
                ("ARAT (entered)", str(last["arat"])),
            ]
        )
    if row["note"]:
        measures.append(("Participant or staff feedback", row["note"]))
    events = [[e["seconds"], e["kind"], SOURCES[e["source"]]] for e in r["events"]]
    if fmt == "csv":
        buf = io.StringIO()
        writer = csv.writer(buf)
        for label, value in measures:
            writer.writerow(
                [
                    label,
                    "'" + value if value.startswith(("=", "+", "-", "@", "\t", "\r")) else value,
                ]
            )
        writer.writerow([])
        writer.writerow(["Elapsed seconds", "Event", "Input"])
        writer.writerows(events)
        return buf.getvalue().encode(), "text/csv"
    buf = io.BytesIO()
    styles = getSampleStyleSheet()
    story = [Paragraph("NeuroReach session report", styles["Title"])]
    for k, v in measures:
        story.append(Paragraph(f"<b>{escape(k)}</b> &nbsp; {escape(v)}", styles["BodyText"]))
    if events:
        story.extend(
            [Spacer(1, 16), Table([["Play seconds", "Event", "Input"], *events], repeatRows=1)]
        )
    SimpleDocTemplate(buf).build(story)
    return buf.getvalue(), "application/pdf"


def register_clinic(app, root=None, display_origin="http://localhost:8766"):
    root = Path(root or os.environ.get("NEUROREACH_DATA_DIR", Path.home() / ".neuroreach"))
    tokens = {}
    attempts = []
    db = None

    def connection():
        nonlocal db
        if db is None:
            db = db_open(root)
            with db:
                db.execute("UPDATE sessions SET status='interrupted' WHERE status='playing'")
        return db

    def authorized(request):
        token = request.cookies.get(COOKIE)
        return tokens.get(token, 0) > time.monotonic()

    def staff(request):
        if not authorized(request):
            raise web.HTTPUnauthorized(text="Unlock the staff workspace to continue.")
        return connection()

    async def state(request):
        exists = connection().execute("SELECT 1 FROM credentials").fetchone()
        return web.json_response({"configured": bool(exists), "authenticated": authorized(request)})

    async def unlock(request):
        body = await request.json()
        password = body.get("password", "")
        checked(
            isinstance(password, str) and 10 <= len(password) <= 256,
            "Use a password of 10–256 characters.",
        )
        attempts[:] = [t for t in attempts if time.monotonic() - t < 60]
        if len(attempts) >= 8:
            raise web.HTTPTooManyRequests(text="Wait a minute before trying again.")
        attempts.append(time.monotonic())
        db = connection()
        row = db.execute("SELECT * FROM credentials").fetchone()
        creating = request.path.endswith("/setup")
        if creating and row:
            raise web.HTTPConflict(text="The staff workspace already has a password.")
        if not creating and not row:
            raise web.HTTPConflict(text="Create the staff password first.")
        salt = secrets.token_bytes(16) if creating else row["salt"]
        digest = await asyncio.to_thread(
            hashlib.pbkdf2_hmac, "sha256", password.encode(), salt, 500000
        )
        if creating:
            try:
                with db:
                    db.execute("INSERT INTO credentials VALUES(1,?,?)", (salt, digest))
            except sqlite3.IntegrityError:
                raise web.HTTPConflict(text="The staff workspace already has a password.")
        elif not hmac.compare_digest(digest, row["hash"]):
            raise web.HTTPUnauthorized(text="Incorrect password.")
        token = secrets.token_urlsafe(32)
        for expired in [k for k, v in tokens.items() if v <= time.monotonic()]:
            tokens.pop(expired)
        tokens[token] = time.monotonic() + 4 * 3600
        attempts.clear()
        resp = web.json_response({"ok": True})
        resp.set_cookie(
            COOKIE, token, httponly=True, samesite="Strict", path=PREFIX, max_age=4 * 3600
        )
        return resp

    async def logout(request):
        tokens.pop(request.cookies.get(COOKIE), None)
        resp = web.json_response({"ok": True})
        resp.del_cookie(COOKIE, path=PREFIX)
        return resp

    async def participants(request):
        db = staff(request)
        if request.method == "POST":
            b = await request.json()
            checked(
                isinstance(b.get("name"), str)
                and 0 < len(b["name"].strip()) <= 80
                and b.get("side") in ("left", "right")
                and b.get("consent") is True,
                "Enter a participant label, side and consent.",
            )
            with db:
                db.execute(
                    "INSERT INTO participants VALUES(?,?,?,?,?,?)",
                    (
                        uuid4().hex,
                        b["name"].strip(),
                        b["side"],
                        now(),
                        json.dumps({"source": "button", "easy": True, "schedule": "short"}),
                        "[]",
                    ),
                )
        rows = []
        for row in db.execute("SELECT * FROM participants ORDER BY name"):
            r = dict(row)
            r["protocol"] = json.loads(r["protocol"])
            r["assessments"] = json.loads(r["assessments"])
            rows.append(r)
        return web.json_response(rows)

    async def detail(request):
        db = staff(request)
        pid = request.match_info["pid"]
        p = db.execute("SELECT * FROM participants WHERE id=?", (pid,)).fetchone()
        if not p:
            raise web.HTTPNotFound(text="Participant not found.")
        if request.method == "DELETE":
            if pairing.current and pairing.current.participant == pid:
                if pairing.current.state != "complete":
                    raise web.HTTPConflict(text="End the active session before removing this participant.")
                pairing.current = None
            with db:
                db.execute("DELETE FROM participants WHERE id=?", (pid,))
            model_dir = root / "models" / UUID(pid).hex
            if model_dir.is_dir():
                shutil.rmtree(model_dir)
            return web.json_response({"ok": True})
        if request.method == "PUT":
            b = await request.json()
            if "protocol" in b:
                proto = b["protocol"]
                checked(
                    isinstance(proto, dict)
                    and proto.get("source") in SOURCES
                    and type(proto.get("easy")) is bool
                    and proto.get("schedule", "short") in ("short", "clinic"),
                    "Invalid protocol",
                )
                with db:
                    db.execute(
                        "UPDATE participants SET protocol=? WHERE id=?", (json.dumps(proto), pid)
                    )
            if "assessment" in b:
                a = b["assessment"]
                checked(
                    bounded(a.get("fma"), 66) and bounded(a.get("arat"), 57),
                    "Invalid assessment score",
                )
                a = {"date": now()[:10], "fma": a["fma"], "arat": a["arat"]}
                with db:
                    db.execute(
                        "UPDATE participants SET assessments=? WHERE id=?",
                        (json.dumps(json.loads(p["assessments"]) + [a]), pid),
                    )
        rows = [
            dict(row)
            for row in db.execute(
                "SELECT * FROM sessions WHERE participant=? ORDER BY julianday(json_extract(record, '$.started')) DESC, rowid DESC", (pid,)
            )
        ]
        for row in rows:
            row["record"] = json.loads(row["record"])
        return web.json_response(rows)

    def save_session(db, r, pid, status):
        validate_record(r)
        checked(status in ("playing", "complete", "interrupted"), "Invalid session state")
        checked(
            db.execute("SELECT 1 FROM participants WHERE id=?", (pid,)).fetchone(),
            "Unknown participant",
        )
        with db:
            prev = db.execute("SELECT * FROM sessions WHERE id=?", (r["id"],)).fetchone()
            if prev:
                checked(prev["participant"] == pid, "Session belongs to a different participant")
                old = json.loads(prev["record"])
                checked(
                    old["game"] == r["game"] and old["started"] == r["started"],
                    "Session identity changed.",
                )
                prefix = r["events"][: len(old["events"])]
                if prev["status"] == "complete":
                    return old
                if old["elapsed"] > r["elapsed"] or prefix != old["events"]:
                    if status == "playing":
                        return old
                    # Finalize the most recent acknowledged events even if a retry
                    # carries an earlier snapshot of this same session.
                    r = old
            if r["game"] == "keeper":
                r["harborBase"] = old.get("harborBase", 0) if prev else keeper_work(db, pid)
            db.execute(
                """INSERT INTO sessions(id,participant,record,status,updated) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
                record=excluded.record,status=excluded.status,updated=excluded.updated""",
                (r["id"], pid, json.dumps(r), status, now()),
            )
        return r

    async def session(request):
        db = staff(request)
        b = await request.json()
        saved = save_session(db, b.get("record"), b.get("participant"), b.get("status"))
        result = {"ok": True}
        if saved["game"] == "keeper":
            result["harborBase"] = saved.get("harborBase", 0)
        return web.json_response(result)

    async def feedback(request):
        db = staff(request)
        b = await request.json()
        note = b.get("note")
        checked(
            isinstance(note, str) and len(note) <= 4000,
            "Feedback must be at most 4,000 characters.",
        )
        with db:
            updated = db.execute(
                "UPDATE sessions SET note=? WHERE id=?", (note, request.match_info["sid"])
            )
            if not updated.rowcount:
                raise web.HTTPNotFound()
        return web.json_response({"ok": True})

    async def report(request):
        db = staff(request)
        row = db.execute(
            "SELECT * FROM sessions WHERE id=?", (request.match_info["sid"],)
        ).fetchone()
        if not row:
            raise web.HTTPNotFound()
        p = db.execute("SELECT * FROM participants WHERE id=?", (row["participant"],)).fetchone()
        fmt = request.match_info["fmt"]
        data, mime = render_report(row, p, fmt)
        return web.Response(
            body=data,
            content_type=mime,
            headers={"Content-Disposition": f'attachment; filename="NeuroReach-{row["id"]}.{fmt}"'},
        )

    async def backup(request):
        db = staff(request)
        if request.method == "GET":
            data = {
                t: [dict(row) for row in db.execute(f"SELECT * FROM {t}")]
                for t in ("participants", "sessions")
            }
            return web.json_response(
                {"version": 1, **data},
                headers={"Content-Disposition": 'attachment; filename="NeuroReach-backup.json"'},
            )
        b = await request.json()
        checked(
            b.get("version") == 1
            and isinstance(b.get("participants"), list)
            and isinstance(b.get("sessions"), list),
            "Unsupported backup format.",
        )
        checked(
            not db.execute("SELECT 1 FROM participants LIMIT 1").fetchone(),
            "Restore requires an empty roster.",
        )
        try:
            with db:
                for p in b["participants"]:
                    UUID(p["id"])
                    checked(
                        p["side"] in ("left", "right")
                        and p["consent"]
                        and isinstance(p["name"], str),
                        "Invalid participant",
                    )
                    proto, scores = json.loads(p["protocol"]), json.loads(p["assessments"])
                    checked(
                        proto.get("source") in SOURCES
                        and type(proto.get("easy")) is bool
                        and isinstance(scores, list),
                        "Invalid participant data",
                    )
                    db.execute(
                        "INSERT INTO participants VALUES(:id,:name,:side,:consent,:protocol,:assessments)",
                        p,
                    )
                for s in b["sessions"]:
                    record = json.loads(s["record"])
                    validate_record(record)
                    checked(
                        s["id"] == record["id"]
                        and s["status"] in ("playing", "complete", "interrupted"),
                        "Invalid session",
                    )
                    if s["status"] == "playing":
                        s["status"] = "interrupted"
                    s["note"] = s.get("note", "")
                    checked(
                        isinstance(s["note"], str) and len(s["note"]) <= 4000, "Invalid feedback"
                    )
                    db.execute(
                        "INSERT INTO sessions(id,participant,record,status,updated,note) VALUES(:id,:participant,:record,:status,:updated,:note)",
                        s,
                    )
        except (sqlite3.Error, ValueError, TypeError, KeyError) as exc:
            raise web.HTTPBadRequest(text="Invalid backup. No records restored.") from exc
        return web.json_response({"ok": True})

    async def cleanup(app):
        if db is not None:
            db.close()

    pairing = DisplayPairing(staff, connection, save_session, display_origin)
    pairing.register(app)
    app.on_cleanup.append(cleanup)
    app.router.add_get(PREFIX + "/state", state)
    app.router.add_post(PREFIX + "/setup", unlock)
    app.router.add_post(PREFIX + "/login", unlock)
    app.router.add_post(PREFIX + "/logout", logout)
    app.router.add_get(PREFIX + "/participants", participants)
    app.router.add_post(PREFIX + "/participants", participants)
    for method in ("GET", "PUT", "DELETE"):
        app.router.add_route(method, PREFIX + "/participants/{pid}", detail)
    app.router.add_put(PREFIX + "/sessions", session)
    app.router.add_put(PREFIX + "/sessions/{sid}/feedback", feedback)
    app.router.add_get(PREFIX + "/reports/{sid}.{fmt:pdf|csv}", report)
    app.router.add_get(PREFIX + "/backup", backup)
    app.router.add_post(PREFIX + "/backup", backup)
    return pairing
