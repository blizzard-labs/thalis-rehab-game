"""Ephemeral patient-screen frames for authenticated clinician viewers."""

import asyncio
import json
import time

from aiohttp import web, WSMsgType


class ScreenMirror:
    def __init__(self, pairing, staff):
        self.pairing = pairing
        self.staff = staff
        self.viewers = {}
        self.publisher = None
        self.frame = None
        self.session = None
        self.updated = 0

    def register(self, app):
        app.router.add_get("/api/display/mirror", self.publish)
        app.router.add_get("/api/staff/display/mirror", self.watch)
        app.on_shutdown.append(self.shutdown)

    async def shutdown(self, app):
        sockets = [*self.viewers]
        if self.publisher:
            sockets.append(self.publisher)
        await asyncio.gather(*(ws.close() for ws in sockets))

    async def broadcast(self, message, session):
        for ws, request in list(self.viewers.items()):
            try:
                self.staff(request)
                if request.query.get("session") != session:
                    await ws.close(code=1008)
                else:
                    await asyncio.wait_for(ws.send_json(message), timeout=1)
            except (web.HTTPException, ConnectionError, asyncio.TimeoutError):
                self.viewers.pop(ws, None)
                await ws.close()

    async def watch(self, request):
        self.staff(request)
        display = self.pairing.current
        if not display or request.query.get("session") != display.session_id:
            raise web.HTTPConflict(text="The supervised session changed.")
        ws = web.WebSocketResponse(heartbeat=10, max_msg_size=1024)
        await ws.prepare(request)
        self.viewers[ws] = request
        try:
            if self.session == display.session_id and self.frame and time.monotonic() - self.updated < 3:
                await ws.send_json(self.frame)
            else:
                await ws.send_json({"type": "waiting"})
            async for _ in ws:
                self.staff(request)
        finally:
            self.viewers.pop(ws, None)
        return ws

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
            if previous and previous is not ws:
                await previous.close(code=1008)
            self.session = display.session_id
            self.frame = None
            await ws.send_json({"type": "ready"})
            async for message in ws:
                if message.type != WSMsgType.TEXT:
                    break
                if display is not self.pairing.current or display.state in ("ending", "complete"):
                    break
                self.pairing.authorize(credentials["token"])
                frame = json.loads(message.data)
                if not isinstance(frame, dict) or frame.get("type") != "frame":
                    break
                html, css = frame.get("html"), frame.get("css", (self.frame or {}).get("css", ""))
                width, height = frame.get("width"), frame.get("height")
                if not (isinstance(html, str) and len(html) <= 900000
                        and isinstance(css, str) and len(css) <= 350000
                        and type(width) is int and 1 <= width <= 8192
                        and type(height) is int and 1 <= height <= 8192):
                    break
                self.frame = {"type": "frame", "html": html, "css": css, "width": width, "height": height}
                self.updated = time.monotonic()
                await self.broadcast(frame, display.session_id)
        except (web.HTTPException, ValueError, AttributeError, asyncio.TimeoutError):
            pass
        finally:
            if self.publisher is ws:
                self.publisher = None
                self.frame = None
                self.updated = 0
                await self.broadcast({"type": "waiting"}, self.session)
            await ws.close()
        return ws
