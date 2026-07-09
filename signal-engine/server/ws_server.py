"""WebSocket bridge: ScoringService output -> game / clinician clients.

The ScoringService runs on a synchronous ``threading.Thread`` and publishes
``IntentScoreResult`` objects onto a thread-safe ``queue.Queue``. This server
runs in asyncio and must NOT block its event loop on that queue. The bridge is
therefore the existing ``queue.Queue`` (NOT an ``asyncio.Queue``): a background
asyncio task drains it via ``loop.run_in_executor`` (a blocking ``get`` runs in
a thread-pool worker, never on the event loop), stashing the latest result. A
second task broadcasts the latest result to every connected client at a fixed
``broadcast_hz``, decoupled from the producer rate.

Outbound (server -> all clients), at ``broadcast_hz``::

    {"type": "intent_score", "intent_score": 72.3, "erd_score": 68.1,
     "classifier_score": 75.8, "is_artifact": false,
     "mode": "band_power_only", "timestamp": 1234567890.123}

Inbound (client -> server)::

    {"cmd": "ping"}        -> {"type": "pong", "timestamp": ...}
    {"cmd": "get_status"}  -> {"type": "status", ...}
    {"cmd": "set_mode", "mode": "band_power_only" | "csp_lda_blend"}

Unknown commands get a per-client ``{"type": "error", ...}`` reply (never
broadcast).
"""

from __future__ import annotations

import asyncio
import json
import logging
import queue
import threading
import time

import websockets

from vision.frame_encoder import encode_jpeg

logger = logging.getLogger(__name__)


class NeuroReachWSServer:
    """Bridge a ScoringService's output_queue to WebSocket clients."""

    def __init__(
        self,
        scoring_service,
        host: str = "localhost",
        port: int = 8765,
        broadcast_hz: float = 20.0,
        quality_hz: float = 5.0,
        session_controller=None,
        webrtc_receiver=None,
        kinematic_worker=None,
        vision_health_monitor=None,
        vision_health_hz: float = 2.0,
        camera_hz: float = 12.0,
    ):
        self.scoring_service = scoring_service
        self.host = host
        self.port = port
        self.broadcast_hz = float(broadcast_hz)
        # Contact-quality / live-trace frames for the console C2 setup screen go
        # out on their own slower cadence; the score-frame contract is untouched.
        self.quality_hz = float(quality_hz)
        # Optional dev-mode session gate (SessionSimulator). None on a real
        # headset run; then start_session/end_session reply with an error.
        self.session_controller = session_controller
        # Optional aiortc receiver for the patient camera track. None on a real
        # headset / standalone run; then webrtc-* signaling is silently ignored.
        self.webrtc_receiver = webrtc_receiver
        # Optional kinematic worker (V2-2b vision). None on a real headset /
        # standalone run; then calibrate_pose replies with an error.
        self.kinematic_worker = kinematic_worker
        # Optional camera-link health sampler (V2-2c). None on a real headset /
        # standalone / EEG-only boot; then no vision_health frame is emitted.
        self.vision_health_monitor = vision_health_monitor
        self.vision_health_hz = float(vision_health_hz)
        # Camera feed: JPEG + landmarks for the clinician console, driven off the
        # kinematic worker's decoded frames + latest pose. Clinician-only (this
        # localhost socket); the LAN relay allowlists intent_score, so a
        # camera_frame never reaches the patient.
        self.camera_hz = float(camera_hz)
        self._cam_emitted = 0
        self._cam_t0 = None
        # When a session controller is present, intent_score frames are only
        # broadcast while a session is active (between start_session and
        # end_session). This stops simulated scores from reaching the patient
        # once the clinician exits the live session. Without a controller (real
        # headset / standalone) broadcasting is never gated.
        self._session_active = False

        self.clients: set = set()
        self._last_result = None  # most recent IntentScoreResult (held value)

        self._loop: asyncio.AbstractEventLoop | None = None
        self._thread: threading.Thread | None = None
        self._server = None
        self._tasks: list[asyncio.Task] = []
        self._stop_future: asyncio.Future | None = None
        self._shutdown = False
        self._ready = threading.Event()  # set once the listener is accepting

        self._dispatch = {
            "ping": self._cmd_ping,
            "get_status": self._cmd_get_status,
            "set_mode": self._cmd_set_mode,
            "start_session": self._cmd_start_session,
            "end_session": self._cmd_end_session,
            "calibrate_pose": self._cmd_calibrate_pose,
        }

    # ------------------------------------------------------------------ lifecycle

    def start(self) -> None:
        """Start scoring + serve websockets, running the event loop in THIS
        thread (blocking). For tests use ``start_background``."""
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        try:
            self._loop.run_until_complete(self._serve())
        finally:
            self._loop.close()

    def start_background(self) -> "NeuroReachWSServer":
        """Run the event loop in a daemon thread; return once it's accepting."""
        if self._thread is not None and self._thread.is_alive():
            raise RuntimeError("server already running")
        self._ready.clear()
        self._thread = threading.Thread(
            target=self._run_loop, name="NeuroReachWSServer", daemon=True
        )
        self._thread.start()
        if not self._ready.wait(timeout=5.0):
            raise RuntimeError("WS server did not come up within 5s")
        return self

    def _run_loop(self) -> None:
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        try:
            self._loop.run_until_complete(self._serve())
        finally:
            self._loop.close()

    async def _serve(self) -> None:
        self._shutdown = False
        self._stop_future = self._loop.create_future()

        # Start the synchronous scoring thread (the producer of output_queue).
        self.scoring_service.start()

        self._server = await websockets.serve(self._handler, self.host, self.port)
        self._tasks = [
            asyncio.ensure_future(self._drain_loop()),
            asyncio.ensure_future(self._broadcast_loop()),
            asyncio.ensure_future(self._quality_loop()),
        ]
        if self.vision_health_monitor is not None:
            self._tasks.append(asyncio.ensure_future(self._vision_health_loop()))
        if self.kinematic_worker is not None:
            self._tasks.append(asyncio.ensure_future(self._camera_frame_loop()))
        logger.info("NeuroReachWSServer listening on ws://%s:%d", self.host, self.port)
        self._ready.set()

        try:
            await self._stop_future  # blocks until stop() fires
        finally:
            self._shutdown = True
            for t in self._tasks:
                t.cancel()
            self._server.close()
            await self._server.wait_closed()
            for ws in list(self.clients):
                try:
                    await ws.close()
                except Exception:  # noqa: BLE001 - best-effort cleanup
                    pass
            self.clients.clear()
            logger.info("NeuroReachWSServer stopped")

    def stop(self) -> None:
        """Stop scoring, close connections, stop the event loop (thread-safe)."""
        self.scoring_service.stop()
        if self._loop is not None and not self._loop.is_closed():
            self._loop.call_soon_threadsafe(self._trigger_stop)
        if self._thread is not None:
            self._thread.join(timeout=5.0)
            self._thread = None

    def _trigger_stop(self) -> None:
        if self._stop_future is not None and not self._stop_future.done():
            self._stop_future.set_result(None)

    # ------------------------------------------------------------------ queue bridge

    def _blocking_get(self):
        """Blocking queue read; runs in an executor thread, never the loop."""
        try:
            return self.scoring_service.output_queue.get(timeout=0.2)
        except queue.Empty:
            return None

    async def _drain_loop(self) -> None:
        """Continuously pull from the thread-safe queue into ``_last_result``.

        Uses ``run_in_executor`` so the blocking ``Queue.get`` never stalls the
        event loop. Drains regardless of client count, so the queue can't back
        up — the ScoringService keeps running no matter who's connected.
        """
        loop = asyncio.get_running_loop()
        try:
            while not self._shutdown:
                result = await loop.run_in_executor(None, self._blocking_get)
                if result is not None:
                    self._last_result = result
        except asyncio.CancelledError:
            pass

    async def _broadcast_loop(self) -> None:
        interval = 1.0 / self.broadcast_hz
        try:
            while not self._shutdown:
                await asyncio.sleep(interval)
                if self._last_result is None or not self.clients:
                    continue  # nothing to send / nobody listening -> keep ticking
                if self.session_controller is not None and not self._session_active:
                    continue  # session gated: no scores until start_session (dev sim)
                payload = json.dumps(self._format(self._last_result))
                await self._broadcast(payload)
        except asyncio.CancelledError:
            pass

    async def _quality_loop(self) -> None:
        """Broadcast the contact-quality + MI-trace snapshot for the C2 setup
        screen, on its own slower cadence and as a distinct message type so the
        20 Hz score-frame contract stays byte-for-byte unchanged."""
        interval = 1.0 / self.quality_hz
        try:
            while not self._shutdown:
                await asyncio.sleep(interval)
                if not self.clients:
                    continue
                snap = self.scoring_service.latest_quality()
                if snap is None:
                    continue
                payload = json.dumps({"type": "eeg_quality", **snap})
                await self._broadcast(payload)
        except asyncio.CancelledError:
            pass

    async def _vision_health_loop(self) -> None:
        """Broadcast the camera-link health snapshot on its own slow cadence, as a
        distinct clinician-only message type. Never gated by the session — the
        LAN relay allowlists intent_score, so this never reaches the patient."""
        interval = 1.0 / self.vision_health_hz
        try:
            while not self._shutdown:
                await asyncio.sleep(interval)
                if not self.clients:
                    continue
                snap = self.vision_health_monitor.sample()
                payload = json.dumps(
                    {"type": "vision_health", **snap, "timestamp": time.time()}
                )
                await self._broadcast(payload)
        except asyncio.CancelledError:
            pass

    def _serialize_landmarks(self, pose_frame) -> dict:
        """Normalized [0,1] image coords for the console overlay. Pose rows carry
        [x, y, visibility]; hands (if present) carry [x, y]."""
        pose = [[float(r[0]), float(r[1]), float(r[3])] for r in pose_frame.pose]
        hands = {}
        for side in ("left", "right"):
            h = pose_frame.hands.get(side) if pose_frame.hands else None
            hands[side] = None if h is None else [[float(p[0]), float(p[1])] for p in h]
        return {"pose": pose, "hands": hands}

    async def _camera_frame_loop(self) -> None:
        """Broadcast JPEG + MediaPipe landmarks for the clinician console feed."""
        interval = 1.0 / self.camera_hz
        worker = self.kinematic_worker
        try:
            while not self._shutdown:
                await asyncio.sleep(interval)
                if not self.clients:
                    continue
                av_frame = worker.sink.latest()
                pose_frame = worker.latest_pose()
                if av_frame is None or pose_frame is None:
                    continue
                jpeg = encode_jpeg(av_frame)
                if not jpeg:
                    continue
                self._cam_emitted += 1
                now = time.time()
                if self._cam_t0 is None:
                    self._cam_t0 = now
                elapsed = max(1e-6, now - self._cam_t0)
                payload = json.dumps({
                    "type": "camera_frame",
                    "jpeg": jpeg,
                    "landmarks": self._serialize_landmarks(pose_frame),
                    "fps": round(self._cam_emitted / elapsed, 1),
                    "timestamp": now,
                })
                await self._broadcast(payload)
        except asyncio.CancelledError:
            pass

    async def _broadcast(self, payload: str) -> None:
        for ws in list(self.clients):
            try:
                await ws.send(payload)
            except websockets.exceptions.ConnectionClosed:
                self.clients.discard(ws)  # client vanished mid-broadcast; skip on

    # ------------------------------------------------------------------ formatting

    def _current_mode(self) -> str:
        eng = self.scoring_service.engine
        if eng.online_classifier is not None and eng.classifier_reliable:
            return "csp_lda_blend"
        return "band_power_only"

    def _format(self, result) -> dict:
        # On artifact frames intent_score holds the last clean value (set by the
        # engine), so we forward it as-is; Unity reads is_artifact for the UI.
        return {
            "type": "intent_score",
            "intent_score": float(result.intent_score),
            "erd_score": result.erd_score,
            "classifier_score": result.classifier_score,
            "is_artifact": bool(result.is_artifact),
            "mode": self._current_mode(),
            "kinematic_score": getattr(result, "kinematic_score", None),
            "compensation_flag": bool(getattr(result, "compensation_flag", False)),
            "timestamp": result.timestamp,
        }

    # ------------------------------------------------------------------ connections

    async def _handler(self, websocket) -> None:
        self.clients.add(websocket)
        addr = websocket.remote_address
        logger.info("client connected %s (clients=%d)", addr, len(self.clients))
        try:
            async for raw in websocket:
                await self._handle_message(websocket, raw)
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.clients.discard(websocket)
            logger.info("client disconnected %s (clients=%d)", addr, len(self.clients))

    _SIGNALING_TYPES = {"webrtc-offer", "webrtc-answer", "webrtc-ice"}

    async def _handle_message(self, websocket, raw) -> None:
        try:
            data = json.loads(raw)
        except (ValueError, TypeError):
            await self._send(websocket, {"type": "error", "message": "invalid json"})
            return
        msg_type = data.get("type") if isinstance(data, dict) else None
        if msg_type in self._SIGNALING_TYPES:
            await self._handle_signaling(websocket, data)
            return
        cmd = data.get("cmd") if isinstance(data, dict) else None
        handler = self._dispatch.get(cmd)
        if handler is None:
            await self._send(
                websocket, {"type": "error", "message": f"unknown command: {cmd}"}
            )
            return
        await handler(websocket, data)

    async def _send(self, websocket, obj: dict) -> None:
        try:
            await websocket.send(json.dumps(obj))
        except websockets.exceptions.ConnectionClosed:
            self.clients.discard(websocket)

    async def _handle_signaling(self, websocket, data) -> None:
        rx = self.webrtc_receiver
        if rx is None:
            return  # standalone / no camera path: silently ignore
        if data["type"] == "webrtc-offer":
            answer = await rx.handle_offer(data["sdp"])
            logger.info("patient camera offer handled")
            await self._send(websocket, answer)
        elif data["type"] == "webrtc-ice":
            await rx.add_ice(data.get("candidate"))
        # webrtc-answer from patient is a no-op (patient is the offerer)

    # ------------------------------------------------------------------ commands

    async def _cmd_ping(self, websocket, data) -> None:
        await self._send(websocket, {"type": "pong", "timestamp": time.time()})

    async def _cmd_get_status(self, websocket, data) -> None:
        await self._send(websocket, self._status_payload())

    async def _cmd_set_mode(self, websocket, data) -> None:
        mode = data.get("mode")
        eng = self.scoring_service.engine
        # Classifier mode (band_power_only / csp_lda_blend) — optional; a message
        # carrying only fusion_mode/affected_side leaves it unchanged.
        if mode is not None:
            if mode == "csp_lda_blend":
                if eng.online_classifier is None:
                    await self._send(
                        websocket,
                        {"type": "error", "message": "no classifier available for csp_lda_blend"},
                    )
                    return
                eng.classifier_reliable = True
            elif mode == "band_power_only":
                eng.classifier_reliable = False
            else:
                await self._send(
                    websocket, {"type": "error", "message": f"invalid mode: {mode}"}
                )
                return
        # Fusion session mode (A/B/C) — controls the EEG/kinematic weight blend.
        fusion_mode = data.get("fusion_mode")
        if fusion_mode is not None:
            try:
                eng.set_session_mode(fusion_mode)
            except ValueError:
                await self._send(
                    websocket,
                    {"type": "error", "message": f"invalid fusion_mode: {fusion_mode}"},
                )
                return
        # Affected side mirrors the kinematic landmark selection. Rest pose is
        # side-specific (it anchors that arm's reach), so switching sides
        # invalidates any existing calibration — clear it so the clinician
        # recalibrates for the correct arm.
        side = data.get("affected_side")
        if side in ("left", "right") and self.kinematic_worker is not None:
            worker = self.kinematic_worker
            if worker.engine.affected_side != side:
                worker.engine.affected_side = side
                worker.engine.set_rest_pose(None)
                worker.reset_calibration()
        await self._send(websocket, self._status_payload())

    async def _cmd_calibrate_pose(self, websocket, data) -> None:
        worker = self.kinematic_worker
        if worker is None:
            await self._send(websocket, {"type": "error", "message": "no kinematic worker"})
            return
        worker.begin_calibration()
        await self._send(
            websocket, {"type": "pose_calibration", "status": worker.calibration_status()}
        )

    async def _cmd_start_session(self, websocket, data) -> None:
        await self._session_command(websocket, arm=True)

    async def _cmd_end_session(self, websocket, data) -> None:
        await self._session_command(websocket, arm=False)

    async def _session_command(self, websocket, *, arm: bool) -> None:
        ctrl = self.session_controller
        if ctrl is None:
            await self._send(websocket, {"type": "error", "message": "no session controller"})
            return
        if arm:
            ctrl.arm()
        else:
            ctrl.disarm()
        self._session_active = arm
        await self._send(websocket, {"type": "session", **ctrl.status()})

    def _status_payload(self) -> dict:
        return {
            "type": "status",
            "mode": self._current_mode(),
            "clients": len(self.clients),
            "broadcast_hz": self.broadcast_hz,
            "timestamp": time.time(),
        }
