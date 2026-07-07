import { EventEmitter } from "node:events";
import { createServer, type Server as HttpsServer } from "node:https";
import { createReadStream, existsSync, statSync } from "node:fs";
import { join, normalize, extname } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { SessionPairing, type SessionInfo } from "./pairing";
import { createScoreRelay, type RelaySocket } from "./scoreRelay";
import { handleSignalingMessage, isSignalingMessage } from "./signaling";

export type LanServerOptions = {
  host: string;
  port: number;
  patientDistDir: string;
  cert: { key: string; cert: string };
  sidecarWsUrl: string;
  createSidecarSocket: (url: string) => RelaySocket;
  pairing?: SessionPairing;
};

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

export class LanServer extends EventEmitter {
  private http: HttpsServer;
  private wss: WebSocketServer;
  private pairing: SessionPairing;
  private patientSocket: WebSocket | null = null;
  private relay: ReturnType<typeof createScoreRelay> | null = null;
  private nextId = 1;
  private port = 0;

  constructor(private opts: LanServerOptions) {
    super();
    this.pairing = opts.pairing ?? new SessionPairing();
    this.http = createServer({ key: opts.cert.key, cert: opts.cert.cert }, (req, res) =>
      this.serveStatic(req, res),
    );
    this.wss = new WebSocketServer({ noServer: true });
    this.http.on("upgrade", (req, socket, head) => {
      const origin = req.headers.origin;
      if (origin !== this.origin()) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => this.onConnection(ws));
    });
  }

  origin(): string {
    return `https://${this.opts.host}:${this.port || this.opts.port}`;
  }

  private serveStatic(req: IncomingMessage, res: ServerResponse): void {
    const urlPath = (req.url ?? "/").split("?")[0];
    const rel = normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
    let file = join(this.opts.patientDistDir, rel === "/" ? "index.html" : rel);
    if (!existsSync(file) || statSync(file).isDirectory()) {
      file = join(this.opts.patientDistDir, "index.html"); // SPA fallback
    }
    res.setHeader("Content-Type", MIME[extname(file)] ?? "application/octet-stream");
    createReadStream(file).pipe(res);
  }

  private onConnection(ws: WebSocket): void {
    const id = `sock-${this.nextId++}`;
    ws.on("message", (data) => {
      let msg: any;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (msg.type === "pair") {
        this.handlePair(ws, id, msg.code);
        return;
      }
      if (this.pairing.boundSocketId() !== id) return; // only the paired socket may proceed
      if (isSignalingMessage(msg)) {
        handleSignalingMessage(msg, (m) => ws.send(JSON.stringify(m)));
        return;
      }
      // game-event and other patient→server messages: emitted for S3 to persist
      if (msg.type === "game-event") this.emit("game-event", msg);
    });
    ws.on("close", () => {
      if (this.patientSocket === ws) {
        this.patientSocket = null;
        // Free the pairing slot (keep the code valid) and tear down the relay so
        // the same device can re-pair on reconnect instead of hitting session_taken.
        this.pairing.releaseSocket();
        this.relay?.stop();
        this.relay = null;
        this.emit("patient-disconnected");
      }
    });
  }

  private handlePair(ws: WebSocket, id: string, code: string): void {
    if (!this.pairing.validate(code)) {
      ws.send(JSON.stringify({ type: "error", reason: "bad_code" }));
      return;
    }
    if (!this.pairing.bind(id)) {
      ws.send(JSON.stringify({ type: "error", reason: "session_taken" }));
      return;
    }
    this.patientSocket = ws;
    ws.send(JSON.stringify({ type: "paired", session: this.pairing.session() }));
    this.emit("patient-connected");
    // Fan the sidecar score out to this patient.
    this.relay?.stop();
    this.relay = createScoreRelay({
      sidecarWsUrl: this.opts.sidecarWsUrl,
      createSocket: this.opts.createSidecarSocket,
      send: (raw) => {
        if (this.patientSocket?.readyState === WebSocket.OPEN) this.patientSocket.send(raw);
      },
    });
    this.relay.connect();
  }

  startSession(session: SessionInfo): { code: string; url: string } {
    const code = this.pairing.mint(session);
    return { code, url: `${this.origin()}/?c=${code}` };
  }

  endSession(): void {
    this.relay?.stop();
    this.relay = null;
    this.patientSocket?.close();
    this.patientSocket = null;
    this.pairing.end();
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.http.listen(this.opts.port, this.opts.host, () => {
        const a = this.http.address();
        if (a && typeof a === "object") this.port = a.port;
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    this.endSession();
    return new Promise((resolve) => {
      this.wss.close();
      this.http.close(() => resolve());
    });
  }
}
