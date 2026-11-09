"""Loopback web companion. One browser owns a real EEG stream at a time."""
import argparse
import asyncio
import threading
from pathlib import Path
from urllib.parse import urlparse

from aiohttp import web, WSMsgType
from acquisition.practice_eeg import devices, run

DIST = Path(__file__).resolve().parents[1] / "patient-web" / "dist"


def create_app(port=8766):
    active = asyncio.Lock()
    allowed = {f"{host}:{p}" for host in ["localhost","127.0.0.1"] for p in [port,5173]}

    @web.middleware
    async def local_only(request, handler):
        if request.host not in allowed:
            raise web.HTTPForbidden()
        if request.path.startswith("/api/"):
            origin = request.headers.get("Origin")
            if origin and (urlparse(origin).netloc not in allowed or urlparse(origin).scheme != "http"):
                raise web.HTTPForbidden()
            if request.headers.get("Upgrade", "").lower() == "websocket" and not origin:
                raise web.HTTPForbidden()
        return await handler(request)

    app = web.Application(middlewares=[local_only])

    async def eeg(request):
        ws = web.WebSocketResponse(heartbeat=10, max_msg_size=4096)
        await ws.prepare(request)
        stop = threading.Event()
        worker = None
        try:
            streams = await asyncio.to_thread(devices)
            await ws.send_json({"type":"devices", "devices":[{"id":key,"name":s.name()} for key,s in streams.items()]})
            async for msg in ws:
                if msg.type != WSMsgType.TEXT:
                    break
                options = msg.json()
                if not isinstance(options,dict) or options.get("cmd") != "start" or worker:
                    await ws.send_json({"type":"error","message":"Invalid EEG session command."})
                    continue
                device = streams.get(options.get("device"))
                if not device or options.get("side") not in ("left","right"):
                    await ws.send_json({"type":"error","message":"Select an available Unicorn and arm."})
                    continue
                try:
                    await asyncio.wait_for(active.acquire(), timeout=2)
                except asyncio.TimeoutError:
                    await ws.send_json({"type":"error","message":"The headset is already in use. End the other session first."})
                    continue
                loop = asyncio.get_running_loop()

                def emit(event):
                    if not stop.is_set():
                        asyncio.run_coroutine_threadsafe(ws.send_json(event), loop).result(timeout=3)

                async def acquire():
                    try:
                        await asyncio.to_thread(run, device, options, stop, emit)
                    except InterruptedError:
                        pass
                    except Exception as error:
                        if not stop.is_set() and not ws.closed:
                            await ws.send_json({"type":"error","message":str(error)})
                    finally:
                        active.release()
                        if not ws.closed:
                            await ws.close()

                worker = asyncio.create_task(acquire())
        finally:
            stop.set()
            if worker:
                await asyncio.shield(worker)
        return ws

    async def index(request):
        if not (DIST/"index.html").is_file():
            raise web.HTTPServiceUnavailable(text="Run npm run build from the project root first.")
        return web.FileResponse(DIST/"index.html")

    app.router.add_get("/api/eeg", eeg)
    app.router.add_get("/", index)
    if DIST.is_dir():
        app.router.add_static("/", DIST, show_index=False)
    return app


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8766)
    args = parser.parse_args()
    web.run_app(create_app(args.port), host="127.0.0.1", port=args.port)
