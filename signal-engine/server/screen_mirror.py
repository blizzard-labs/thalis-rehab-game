"""Ephemeral patient-screen frames for authenticated clinician viewers."""

import asyncio
import json
import time
from dataclasses import dataclass, field

from aiohttp import web, WSMsgType


@dataclass
class Viewer:
    request: web.Request
    changed: asyncio.Event = field(default_factory=asyncio.Event)
    revision: int = -1
    base: int = -1


class ScreenMirror:
    def __init__(self, pairing, staff):
        self.pairing = pairing
        self.staff = staff
        self.viewers = {}
        self.publisher = None
        self.publisher_updates = False
        self.mode = None
        self.frame = None
        self.session = None
        self.updated = 0
        self.revision = 0
        self.base = 0
        self.frame_token = None

    def register(self, app):
        app.router.add_get("/api/display/mirror", self.publish)
        app.router.add_get("/api/staff/display/mirror", self.watch)
        app.on_shutdown.append(self.shutdown)

    async def shutdown(self, app):
        sockets = [*self.viewers]
        if self.publisher is not None:
            sockets.append(self.publisher)
        await asyncio.gather(*(ws.close() for ws in sockets))

    def notify(self):
        self.revision += 1
        for viewer in self.viewers.values():
            viewer.changed.set()

    async def update_mode(self, initial=False):
        if self.publisher is None or not self.publisher_updates:
            return
        viewers = [v for v in self.viewers.values() if v.request.query.get("session") == self.session]
        # Older clinicians need a complete document every time. New clients
        # explicitly negotiate incremental frames; a disconnected monitor costs no capture work.
        mode = (bool(viewers), all(v.request.query.get("updates") == "1" for v in viewers))
        if initial or self.mode != mode:
            self.mode = mode
            await self.publisher.send_json({"type": "ready" if initial else "mode",
                                            "watching": mode[0], "updates": mode[1]})

    async def send_latest(self, ws, viewer):
        while not ws.closed:
            await viewer.changed.wait()
            viewer.changed.clear()
            self.staff(viewer.request)
            current = self.pairing.current
            if not current or viewer.request.query.get("session") != current.session_id:
                await ws.close(code=1008)
                return
            if viewer.revision == self.revision:
                continue
            revision, base = self.revision, self.base
            frame = self.frame
            if (not frame or self.session != current.session_id or self.frame_token != current.token
                    or current.state in ("ending", "complete") or time.monotonic() - self.updated > 3):
                outgoing = {"type": "waiting"}
                base = -1
            elif viewer.request.query.get("updates") != "1" and "scene" in frame:
                # The publisher is switching to standalone frames for this viewer.
                outgoing = {"type": "waiting"}
                base = -1
            elif viewer.base != base or "scene" not in frame:
                outgoing = frame
            else:
                # Edits are cumulative against this base. A slow socket can skip
                # any number of intermediate updates, including a scene change.
                outgoing = {k: v for k, v in frame.items() if k not in ("html", "css")}
            await asyncio.wait_for(ws.send_json(outgoing), timeout=2)
            viewer.revision, viewer.base = revision, base

    async def watch(self, request):
        self.staff(request)
        display = self.pairing.current
        if not display or request.query.get("session") != display.session_id:
            raise web.HTTPConflict(text="The supervised session changed.")
        ws = web.WebSocketResponse(heartbeat=10, max_msg_size=1024)
        await ws.prepare(request)
        viewer = Viewer(request)
        self.viewers[ws] = viewer
        viewer.changed.set()

        async def send():
            try:
                await self.send_latest(ws, viewer)
            except (web.HTTPException, ConnectionError, asyncio.TimeoutError):
                await ws.close(code=1008)

        writer = asyncio.create_task(send())
        try:
            await self.update_mode()
            async for _ in ws:
                self.staff(request)
        finally:
            self.viewers.pop(ws, None)
            writer.cancel()
            # The request may be cancelled as soon as the peer closes. Publish
            # the new audience before yielding to reap its writer.
            try:
                await self.update_mode()
            finally:
                await asyncio.gather(writer, return_exceptions=True)
        return ws

    def accept_frame(self, incoming):
        if not isinstance(incoming, dict) or incoming.get("type") != "frame":
            return False
        width, height = incoming.get("width"), incoming.get("height")
        if not all(type(n) is int and 1 <= n <= 8192 for n in (width, height)):
            return False
        previous = self.frame or {}
        scene = incoming.get("scene")
        edits = incoming.get("edits", {})
        if scene is not None:
            if (type(scene) is not int or scene < 1 or not isinstance(edits, dict)
                    or len(edits) > 16000
                    or not all(len(key) <= 256 and (v is None or isinstance(v, str)) for key, v in edits.items())):
                return False
        full = "html" in incoming
        if not full and (not scene or previous.get("scene") != scene):
            return False
        html = incoming.get("html", previous.get("html"))
        css = incoming.get("css", previous.get("css", ""))
        if not (isinstance(html, str) and len(html) <= 900000 and isinstance(css, str) and len(css) <= 350000):
            return False
        if full:
            self.base += 1
        self.frame = {"type": "frame", "html": html, "css": css, "width": width, "height": height}
        if scene is not None:
            self.frame.update(scene=scene, edits=edits)
        self.updated = time.monotonic()
        self.notify()
        return True

    async def publish(self, request):
        ws = web.WebSocketResponse(heartbeat=10, max_msg_size=1500000)
        await ws.prepare(request)
        try:
            credentials = await ws.receive_json(timeout=5)
            display = self.pairing.authorize(credentials.get("token", ""))
            if display.state == "complete":
                await ws.close(code=1008)
                return ws
            previous = self.publisher
            self.publisher = ws
            self.publisher_updates = credentials.get("updates") is True
            self.session = display.session_id
            self.frame_token = credentials["token"]
            had_frame = self.frame is not None
            self.frame = None
            if had_frame:
                self.notify()
            if previous is not None and previous is not ws:
                await previous.close(code=1008)
            if self.publisher_updates:
                await self.update_mode(initial=True)
            else:
                await ws.send_json({"type": "ready"})
            async for message in ws:
                if (message.type != WSMsgType.TEXT or self.publisher is not ws
                        or display is not self.pairing.current or display.state in ("ending", "complete")):
                    break
                self.pairing.authorize(credentials["token"])
                if not self.accept_frame(json.loads(message.data)):
                    break
        except (web.HTTPException, ValueError, AttributeError, ConnectionError, asyncio.TimeoutError):
            pass
        finally:
            if self.publisher is ws:
                self.publisher = None
                self.frame = self.mode = self.frame_token = None
                self.updated = 0
                self.notify()
            await ws.close()
        return ws
