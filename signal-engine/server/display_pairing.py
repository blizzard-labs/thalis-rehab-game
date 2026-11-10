"""Single-use invitation and per-display session control for a supervised station."""

from dataclasses import dataclass
import json
import secrets
import time
from uuid import uuid4

from aiohttp import web


GAMES = {"garden": "Garden Grow", "stars": "Star Catcher", "river": "River Rowing", "fruit": "Fruit Picking"}


@dataclass
class Display:
    participant: str
    game: str
    side: str
    easy: bool
    source: str
    schedule: str
    session_id: str
    code: str
    expires: float
    token: str = ""
    state: str = "waiting"
    last_seen: float = 0
    record: dict | None = None
    revision: int = 0
    patient_paused: bool = False


class DisplayPairing:
    def __init__(self, staff, database, save, origin):
        self.staff = staff
        self.database = database
        self.save = save
        self.origin = origin
        self.current = None

    def authorize(self, token):
        d = self.current
        if not d or not d.token or not secrets.compare_digest(d.token, token):
            raise web.HTTPForbidden(text="Display authorization expired.")
        return d

    def register(self, app):
        app.router.add_post("/api/staff/display", self.create)
        app.router.add_get("/api/staff/display", self.monitor)
        app.router.add_post("/api/staff/display/control", self.control)
        app.router.add_post("/api/display/claim", self.claim)
        app.router.add_post("/api/display/sync", self.sync)

    def status(self):
        d = self.current
        if not d:
            return None
        return {
            "session": d.session_id,
            "state": d.state,
            "paired": bool(d.token),
            "patientPaused": d.patient_paused,
            "connected": bool(d.last_seen and time.monotonic() - d.last_seen < 5),
            "url": (
                self.origin + "/#display=" + d.code
                if not d.token and d.state != "complete"
                else None
            ),
            "record": d.record,
        }

    async def create(self, request):
        db = self.staff(request)
        b = await request.json()
        d = self.current
        if d and d.state != "complete" and (d.token or time.monotonic() < d.expires):
            raise web.HTTPConflict(text="End the other display session on this station first.")
        p = db.execute("SELECT * FROM participants WHERE id=?", (b.get("participant"),)).fetchone()
        if not p or b.get("game") not in GAMES:
            raise web.HTTPBadRequest(text="Invalid participant or game.")
        protocol = json.loads(p["protocol"])
        self.current = Display(
            p["id"],
            b["game"],
            p["side"],
            protocol["easy"],
            protocol["source"],
            protocol.get("schedule", "short"),
            str(uuid4()),
            secrets.token_urlsafe(24),
            time.monotonic() + 600,
        )
        return web.json_response(self.status())

    async def monitor(self, request):
        self.staff(request)
        return web.json_response(self.status())

    def end(self, status):
        d = self.current
        if d.record:
            self.save(self.database(), d.record, d.participant, status)
        d.state = "complete"

    async def control(self, request):
        self.staff(request)
        d = self.current
        if not d:
            raise web.HTTPNotFound()
        b = await request.json()
        if b.get("session") != d.session_id:
            raise web.HTTPConflict(text="Display session changed.")
        command = b.get("command")
        if command == "end":
            # Ask a connected screen to flush the last actions before finalization.
            if d.state in ("ending", "complete"):
                return web.json_response(self.status())
            if not d.last_seen or time.monotonic() - d.last_seen > 5:
                self.end("interrupted")
            else:
                d.state = "ending"
        elif command == "finish-saved":
            if d.state == "complete":
                return web.json_response(self.status())
            if d.state != "ending":
                raise web.HTTPConflict(
                    text="Request session end before finishing the saved record."
                )
            self.end("interrupted")
        elif (
            d.token
            and d.state not in ("ending", "complete")
            and command in ("start", "pause", "resume")
        ):
            d.state = "paused" if command == "pause" else "playing"
        else:
            raise web.HTTPBadRequest(text="The display is not ready for that action.")
        d.revision += 1
        d.patient_paused = False
        return web.json_response(self.status())

    async def claim(self, request):
        b = await request.json()
        d = self.current
        if (
            not d
            or d.token
            or d.state == "complete"
            or time.monotonic() > d.expires
            or not secrets.compare_digest(d.code, str(b.get("code", "")))
        ):
            raise web.HTTPForbidden(text="This invitation has expired or was already used.")
        d.token = secrets.token_urlsafe(32)
        d.last_seen = time.monotonic()
        response = web.json_response({"token": d.token})
        response.set_cookie(
            "nr_display",
            d.token,
            path="/api/display/eeg",
            httponly=True,
            secure=request.secure,
            samesite="Strict",
        )
        return response

    async def sync(self, request):
        token = request.headers.get("Authorization", "").removeprefix("Bearer ")
        d = self.authorize(token)
        b = await request.json()
        d.last_seen = time.monotonic()
        r = b.get("record")
        if r and d.state != "complete":
            if (
                not isinstance(r, dict)
                or r.get("id") != d.session_id
                or r.get("game") != d.game
                or not isinstance(r.get("sources"), list)
                or not r["sources"]
                or r["sources"][0] != d.source
            ):
                raise web.HTTPForbidden(text="Session mismatch.")
            status = "complete" if b.get("finished") is True else "playing"
            d.record = self.save(self.database(), r, d.participant, status)
            if d.state == "playing" and b.get("revision") == d.revision:
                d.patient_paused = b.get("paused") is True
            if status == "complete":
                d.state = "complete"
        return web.json_response(
            {
                "session": d.session_id,
                "state": d.state,
                "revision": d.revision,
                "patientPaused": d.patient_paused,
                "game": d.game,
                "side": d.side,
                "easy": d.easy,
                "schedule": d.schedule,
                "source": d.source,
                "record": d.record,
            }
        )
