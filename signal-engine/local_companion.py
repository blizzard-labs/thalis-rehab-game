"""Loopback web companion. One browser owns a real EEG stream at a time."""

import importlib
import argparse
import asyncio
import threading
import time
import sys
import webbrowser
from pathlib import Path
from urllib.parse import urlparse

from aiohttp import web, WSMsgType
from server.clinic_records import register_clinic

DIST = (
    Path(sys._MEIPASS) / "web"
    if getattr(sys, "frozen", False)
    else Path(__file__).resolve().parents[1] / "patient-web" / "dist"
)


def create_app(port=8766, display_origin=None):
    active = asyncio.Lock()
    allowed = {f"{host}:{p}" for host in ["localhost", "127.0.0.1"] for p in [port, 5173]}

    display_host = urlparse(display_origin).netloc if display_origin else None

    @web.middleware
    async def local_only(request, handler):
        remote_display = request.host == display_host
        peer = request.remote
        if request.host not in allowed and not remote_display:
            raise web.HTTPForbidden()
        if peer not in {"127.0.0.1", "::1"} and not remote_display:
            raise web.HTTPForbidden()
        if request.path.startswith("/api/"):
            origin = request.headers.get("Origin")
            if remote_display and (not request.secure or request.path.startswith("/api/staff")):
                raise web.HTTPForbidden()
            if (
                origin
                and origin != display_origin
                and (urlparse(origin).netloc not in allowed or urlparse(origin).scheme != "http")
            ):
                raise web.HTTPForbidden()
            if origin == display_origin and display_origin and not remote_display:
                raise web.HTTPForbidden()
            if request.headers.get("Upgrade", "").lower() == "websocket" and not origin:
                raise web.HTTPForbidden()
        response = await handler(request)
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    app = web.Application(middlewares=[local_only], client_max_size=32 * 1024 * 1024)

    async def eeg(request):
        display = None
        ticket = request.cookies.get("nr_display")
        if display_host and request.host == display_host and request.path != "/api/display/eeg":
            raise web.HTTPForbidden()
        if request.path == "/api/display/eeg":
            display = pairing.authorize(ticket or "")
            if display.state in ("ending", "complete") or display.source not in ("eeg", "blended"):
                raise web.HTTPForbidden()
        ws = web.WebSocketResponse(heartbeat=10, max_msg_size=4096)
        await ws.prepare(request)
        stop = threading.Event()
        worker = None
        try:
            try:
                runtime = await asyncio.to_thread(
                    importlib.import_module, "acquisition.practice_eeg"
                )
                streams = await asyncio.to_thread(runtime.devices)
            except (ImportError, RuntimeError, OSError) as error:
                await ws.send_json(
                    {
                        "type": "error",
                        "message": f"EEG runtime could not start. Check liblsl and the companion installation. {error}",
                    }
                )
                await ws.close()
                return ws
            await ws.send_json(
                {
                    "type": "devices",
                    "devices": [{"id": key, "name": s.name()} for key, s in streams.items()],
                }
            )
            async for msg in ws:
                if msg.type != WSMsgType.TEXT:
                    break
                options = msg.json()
                if not isinstance(options, dict) or options.get("cmd") != "start" or worker:
                    await ws.send_json({"type": "error", "message": "Invalid EEG session command."})
                    continue
                if display:
                    options["side"] = display.side
                    options["profile"] = display.participant if options.get("profile") else None
                device = streams.get(options.get("device"))
                if not device or options.get("side") not in ("left", "right"):
                    await ws.send_json(
                        {"type": "error", "message": "Select an available Unicorn and arm."}
                    )
                    continue
                try:
                    await asyncio.wait_for(active.acquire(), timeout=2)
                except asyncio.TimeoutError:
                    await ws.send_json(
                        {
                            "type": "error",
                            "message": "The headset is already in use. End the other session first.",
                        }
                    )
                    continue
                loop = asyncio.get_running_loop()

                def emit(event):
                    if display and (
                        display is not pairing.current or display.state in ("ending", "complete")
                    ):
                        stop.set()
                    if not stop.is_set():
                        asyncio.run_coroutine_threadsafe(ws.send_json(event), loop).result(
                            timeout=3
                        )

                async def acquire():
                    try:
                        await asyncio.to_thread(runtime.run, device, options, stop, emit)
                    except InterruptedError:
                        pass
                    except Exception as error:
                        if not stop.is_set() and not ws.closed:
                            await ws.send_json({"type": "error", "message": str(error)})
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
        if not (DIST / "index.html").is_file():
            raise web.HTTPServiceUnavailable(text="Run npm run build from the project root first.")
        return web.FileResponse(DIST / "index.html")

    async def health(request):
        return web.json_response({"app": "NeuroReach", "version": 1, "clockMs": time.time() * 1000})

    app.router.add_get("/api/health", health)
    pairing = register_clinic(app, display_origin=display_origin or f"http://localhost:{port}")
    app.router.add_get("/api/eeg", eeg)
    app.router.add_get("/api/display/eeg", eeg)
    app.router.add_get("/", index)
    if DIST.is_dir():
        app.router.add_static("/", DIST, show_index=False)
    return app


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8766)
    parser.add_argument("--open-browser", action="store_true")
    parser.add_argument(
        "--display-host", help="Clinic LAN IP or hostname covered by the TLS certificate"
    )
    parser.add_argument("--display-port", type=int, default=8443)
    parser.add_argument("--cert")
    parser.add_argument("--key")
    args = parser.parse_args()
    if args.display_host and not (args.cert and args.key):
        parser.error("--display-host requires a trusted --cert and --key")
    origin = f"https://{args.display_host}:{args.display_port}" if args.display_host else None
    app = create_app(args.port, origin)
    if args.open_browser:

        async def open_browser(app):
            asyncio.get_running_loop().call_later(
                0.5, webbrowser.open, f"http://127.0.0.1:{args.port}"
            )

        app.on_startup.append(open_browser)

    async def serve():
        runner = web.AppRunner(app)
        await runner.setup()
        try:
            await web.TCPSite(runner, "127.0.0.1", args.port).start()
            print(f"NeuroReach ready at http://127.0.0.1:{args.port}", flush=True)
            if origin:
                import ssl

                tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
                tls.load_cert_chain(args.cert, args.key)
                await web.TCPSite(
                    runner, args.display_host, args.display_port, ssl_context=tls
                ).start()
                print(f"Paired displays enabled at {origin}", flush=True)
            await asyncio.Event().wait()
        finally:
            await runner.cleanup()

    try:
        asyncio.run(serve())
    except KeyboardInterrupt:
        pass
