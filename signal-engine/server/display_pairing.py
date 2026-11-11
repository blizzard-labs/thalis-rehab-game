"""Single-use invitation and per-display session control for a supervised station."""

from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
import json
import secrets
import time
from uuid import uuid4

from aiohttp import web
from server.screen_mirror import ScreenMirror


GAMES = {"garden": "Garden Grow", "stars": "Star Catcher", "river": "River Rowing", "fruit": "Fruit Picking", "keeper": "Lighthouse Keeper"}


def keeper_work(db, participant):
    records = db.execute("SELECT record FROM sessions WHERE participant=? AND status='complete'", (participant,))
    total = 0
    for row in records:
        r = json.loads(row["record"])
        total += r["rewards"] if r["game"] == "keeper" else min(3, r["rewards"])
    return total


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
    harbor_base: int = 0
    target: str = "display"
    invite_origin: str = ""
    started: str | None = None
    outcome: str | None = None
    telemetry: dict | None = None
    manual_requested: bool = False
    ending_at: float = 0
    trace: deque = field(default_factory=lambda: deque(maxlen=100))


class DisplayPairing:
    def __init__(self, staff, database, save, origin):
        self.staff = staff
        self.database = database
        self.save = save
        self.origin = origin
        self.current = None
        self.network = None
        self.screen = ScreenMirror(self, staff)

    def authorize(self, token):
        d = self.current
        if not d or not d.token or not secrets.compare_digest(d.token, token):
            raise web.HTTPForbidden(text="Display authorization expired.")
        return d

    @staticmethod
    def connected(d):
        return bool(d.last_seen and time.monotonic() - d.last_seen < 5)

    def issue_player(self, d, secure, include_display=False):
        d.token = secrets.token_urlsafe(32)
        d.last_seen = time.monotonic()
        body = {"token": d.token}
        if include_display:
            body["display"] = self.status()
        response = web.json_response(body)
        response.set_cookie("nr_display", d.token, path="/api/display/eeg", httponly=True,
                            secure=secure, samesite="Strict")
        return response

    def register(self, app):
        self.screen.register(app)
        app.router.add_post("/api/staff/display", self.create)
        app.router.add_get("/api/staff/display", self.monitor)
        app.router.add_post("/api/staff/display/control", self.control)
        app.router.add_post("/api/staff/display/recover", self.recover)
        app.router.add_post("/api/display/claim", self.claim)
        app.router.add_post("/api/display/sync", self.sync)
        app.router.add_get("/api/staff/display/certificate", self.certificate)

    async def certificate(self, request):
        self.staff(request)
        if not self.network or not self.network.authority:
            raise web.HTTPNotFound(text="This station uses an externally supplied certificate.")
        return web.Response(body=self.network.authority.read_bytes(), content_type="application/x-x509-ca-cert",
                            headers={"Content-Disposition": 'attachment; filename="NeuroReach-station.crt"'})

    def status(self):
        d = self.current
        if not d:
            return None
        return {
            "session": d.session_id,
            "state": d.state,
            "participant": d.participant,
            "target": d.target,
            "game": d.game, "side": d.side, "easy": d.easy,
            "source": d.source, "schedule": d.schedule, "started": d.started,
            "outcome": d.outcome, "revision": d.revision,
            "manualRequested": d.manual_requested,
            "canFinishSaved": d.state == "ending" and (not self.connected(d) or time.monotonic() - d.ending_at > 8),
            "expired": not d.token and time.monotonic() >= d.expires,
            "telemetry": d.telemetry if self.connected(d) else None,
            "trace": [{"age": round(time.monotonic() - t, 2), "camera": camera, "eeg": eeg}
                      for t, camera, eeg in d.trace if time.monotonic() - t <= 60],
            "paired": bool(d.token),
            "patientPaused": d.patient_paused,
            "connected": self.connected(d),
            "url": (
                d.invite_origin + "/#display=" + d.code
                if d.target == "display" and not d.token and d.state != "complete" and time.monotonic() < d.expires
                else None
            ),
            "localUrl": (
                "/#display=" + d.code if not d.token and d.state != "complete" and time.monotonic() < d.expires else None
            ),
            "stationCertificate": bool(self.network and self.network.authority),
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
        target = b.get("target", "display")
        if target not in ("display", "workstation"):
            raise web.HTTPBadRequest(text="Choose a patient screen.")
        if target == "display" and self.network:
            self.origin = await self.network.ensure()
            # Starting the listener can yield while another staff window opens a run.
            d = self.current
            if d and d.state != "complete" and (d.token or time.monotonic() < d.expires):
                raise web.HTTPConflict(text="End the other display session on this station first.")
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
            target=target,
            invite_origin=(self.origin if self.origin.startswith("https://")
                           else f"{request.scheme}://{request.host}"),
            harbor_base=keeper_work(db, p["id"]) if b["game"] == "keeper" else 0,
        )
        # On the same computer, play can begin immediately without a QR claim.
        if target == "workstation":
            d = self.current
            self.start(d)
            return self.issue_player(d, request.secure, include_display=True)
        return web.json_response(self.status())

    def start(self, d):
        d.started = datetime.now(timezone.utc).isoformat()
        initial = {"id": d.session_id, "started": d.started, "game": d.game,
                   "sources": [d.source], "gentle": d.easy, "schedule": d.schedule,
                   "elapsed": 0, "actions": 0, "rewards": 0, "intervals": [],
                   "events": [], "measurements": {}}
        d.record = self.save(self.database(), initial, d.participant, "playing")
        d.state = "playing"
        d.revision += 1

    async def recover(self, request):
        self.staff(request)
        b = await request.json()
        d = self.current
        if not d or d.session_id != b.get("session") or d.target != "workstation" or d.state not in ("playing", "paused"):
            raise web.HTTPConflict(text="This workstation run is no longer active.")
        if self.connected(d):
            raise web.HTTPConflict(text="The patient game is open in another window.")
        d.state = "paused"
        d.revision += 1
        return self.issue_player(d, request.secure)

    async def monitor(self, request):
        self.staff(request)
        return web.json_response(self.status())

    def end(self, status):
        d = self.current
        if d.record:
            self.save(self.database(), d.record, d.participant, status)
        d.outcome = status if d.record else "cancelled" if not d.started else "interrupted"
        d.state = "complete"

    async def control(self, request):
        self.staff(request)
        b = await request.json()
        d = self.current
        if not d:
            raise web.HTTPNotFound()
        if b.get("session") != d.session_id:
            raise web.HTTPConflict(text="Display session changed.")
        command = b.get("command")
        if command == "end":
            # Ask a connected screen to flush the last actions before finalization.
            if d.state in ("ending", "complete"):
                return web.json_response(self.status())
            if d.state == "waiting":
                self.end("cancelled")
            elif not self.connected(d):
                self.end("interrupted")
            else:
                d.state = "ending"
                d.ending_at = time.monotonic()
        elif command == "finish-saved":
            if d.state == "complete":
                return web.json_response(self.status())
            if d.state != "ending":
                raise web.HTTPConflict(
                    text="Request session end before finishing the saved record."
                )
            if self.connected(d) and time.monotonic() - d.ending_at <= 8:
                raise web.HTTPConflict(text="Waiting for the final patient checkpoint.")
            self.end("interrupted")
        elif command == "reinvite" and d.state in ("waiting", "playing", "paused") and not self.connected(d):
            if self.network:
                origin = await self.network.ensure()
                if d is not self.current or self.connected(d):
                    raise web.HTTPConflict(text="The patient connection changed.")
                d.invite_origin = origin
            d.target = "display"
            d.token = ""
            d.code = secrets.token_urlsafe(24)
            d.expires = time.monotonic() + 600
            d.last_seen = 0
            if d.started:
                d.state = "paused"
            d.revision += 1
            return web.json_response(self.status())
        elif command == "renew" and d.state in ("waiting", "paused") and not d.token:
            d.code = secrets.token_urlsafe(24)
            d.expires = time.monotonic() + 600
            return web.json_response(self.status())
        elif command == "use-button" and d.state in ("playing", "paused") and d.source != "button":
            d.manual_requested = True
            d.revision += 1
            return web.json_response(self.status())
        elif command == "start" and d.state == "waiting" and d.token and self.connected(d):
            self.start(d)
            return web.json_response(self.status())
        elif command == "pause" and d.state == "playing":
            d.state = "paused"
        elif command == "resume" and (d.state == "paused" or (d.state == "playing" and d.patient_paused)) and self.connected(d):
            d.state = "playing"
        else:
            raise web.HTTPConflict(text="The patient screen is not ready for that control.")
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
        return self.issue_player(d, request.secure)

    async def sync(self, request):
        token = request.headers.get("Authorization", "").removeprefix("Bearer ")
        b = await request.json()
        d = self.authorize(token)
        r = b.get("record")
        if r and d.state == "waiting":
            raise web.HTTPConflict(text="Staff must start the session first.")
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
            d.record = self.save(self.database(), {**r, "started": d.started}, d.participant, status)
            if d.state == "playing" and b.get("revision") == d.revision:
                d.patient_paused = b.get("paused") is True
            monitor = b.get("telemetry")
            if isinstance(monitor, dict) and monitor.get("phase") in ("setup", "play"):
                d.telemetry = {key: str(monitor.get(key, ""))[:180] for key in ("phase", "camera", "eeg")}
                for key in ("input", "cameraLevel", "eegLevel"):
                    level = monitor.get(key)
                    d.telemetry[key] = level if type(level) in (int, float) and 0 <= level <= 1 else None
                if d.source != "button" and d.state == "playing" and not d.patient_paused and monitor["phase"] == "play":
                    at = time.monotonic()
                    if not d.trace or at - d.trace[-1][0] >= 0.4:
                        d.trace.append((at, d.telemetry["cameraLevel"], d.telemetry["eegLevel"]))
            if status == "complete":
                d.state = d.outcome = "complete"
        d.last_seen = time.monotonic()
        return web.json_response(
            {
                "session": d.session_id,
                "state": d.state,
                "revision": d.revision,
                "started": d.started,
                "manualRequested": d.manual_requested,
                "outcome": d.outcome,
                "patientPaused": d.patient_paused,
                "game": d.game,
                "side": d.side,
                "easy": d.easy,
                "schedule": d.schedule,
                "harborBase": d.harbor_base,
                "source": d.source,
                "record": d.record,
            }
        )
