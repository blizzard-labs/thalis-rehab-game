import { describe, it, expect, afterEach, beforeAll } from "vitest";
import WebSocket, { WebSocketServer } from "ws";
import { AddressInfo } from "node:net";
import { loadOrCreateCert } from "./cert";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LanServer, type LanServerOptions } from "./lanServer";
import type { RelaySocket } from "./scoreRelay";
import type { SessionInfo } from "./pairing";

const SESSION: SessionInfo = { patientFirstName: "Margaret", affectedSide: "left", mode: "band_power_only", source: "sim" };

// A fake sidecar: a real ws server we point the relay at, so we can push frames.
function fakeSidecar(): Promise<{ url: string; push: (o: unknown) => void; close: () => void }> {
  return new Promise((resolve) => {
    const wss = new WebSocketServer({ port: 0 }, () => {
      const port = (wss.address() as AddressInfo).port;
      const clients = new Set<WebSocket>();
      wss.on("connection", (c) => { clients.add(c); c.on("close", () => clients.delete(c)); });
      resolve({
        url: `ws://127.0.0.1:${port}`,
        push: (o) => clients.forEach((c) => c.send(JSON.stringify(o))),
        close: () => wss.close(),
      });
    });
  });
}

// Node ws adapter matching the RelaySocket shape the relay expects.
function nodeRelaySocket(url: string): RelaySocket {
  const ws = new WebSocket(url);
  const s: RelaySocket = { onmessage: null, onclose: null, onopen: null, close: () => ws.close() };
  ws.on("open", () => s.onopen?.());
  ws.on("message", (d) => s.onmessage?.({ data: d.toString() }));
  ws.on("close", () => s.onclose?.());
  ws.on("error", () => {});
  return s;
}

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "nr-lan-"));
  mkdirSync(join(dir, "dist"));
  writeFileSync(join(dir, "dist", "index.html"), "<!doctype html><title>patient</title>");
});

let server: LanServer | null = null;
let sidecar: Awaited<ReturnType<typeof fakeSidecar>> | null = null;
afterEach(async () => {
  await server?.stop();
  sidecar?.close();
  server = null;
  sidecar = null;
});

function baseOpts(): LanServerOptions {
  return {
    host: "127.0.0.1",
    port: 0,
    patientDistDir: join(dir, "dist"),
    cert: loadOrCreateCert(dir),
    sidecarWsUrl: sidecar!.url,
    createSidecarSocket: nodeRelaySocket,
  };
}

// Connect a patient WSS client (accept self-signed), returning a small driver.
function connectPatient(server: LanServer) {
  const addr = (server as any).port as number;
  const ws = new WebSocket(`wss://127.0.0.1:${addr}`, {
    rejectUnauthorized: false,
    origin: server.origin(),
  });
  const messages: any[] = [];
  ws.on("message", (d) => messages.push(JSON.parse(d.toString())));
  return {
    ws,
    messages,
    open: () => new Promise<void>((r) => ws.on("open", () => r())),
    send: (o: unknown) => ws.send(JSON.stringify(o)),
    waitFor: (type: string) =>
      new Promise<any>((resolve) => {
        const check = () => {
          const m = messages.find((x) => x.type === type);
          if (m) return resolve(m);
          setTimeout(check, 10);
        };
        check();
      }),
  };
}

describe("LanServer", () => {
  it("pairs the first patient and forwards intent_score frames", async () => {
    sidecar = await fakeSidecar();
    server = new LanServer(baseOpts());
    await server.start();
    const code = server.startSession(SESSION).code;

    const p = connectPatient(server);
    await p.open();
    p.send({ type: "pair", code });
    const paired = await p.waitFor("paired");
    expect(paired.session.patientFirstName).toBe("Margaret");

    sidecar.push({ type: "intent_score", intent_score: 61.2 });
    const score = await p.waitFor("intent_score");
    expect(score.intent_score).toBe(61.2);
    p.ws.close();
  });

  it("never forwards eeg_quality to the patient", async () => {
    sidecar = await fakeSidecar();
    server = new LanServer(baseOpts());
    await server.start();
    const code = server.startSession(SESSION).code;
    const p = connectPatient(server);
    await p.open();
    p.send({ type: "pair", code });
    await p.waitFor("paired");

    sidecar.push({ type: "eeg_quality", channels: [] });
    sidecar.push({ type: "intent_score", intent_score: 50 });
    await p.waitFor("intent_score");
    expect(p.messages.find((m) => m.type === "eeg_quality")).toBeUndefined();
    p.ws.close();
  });

  it("rejects a second claimant with session_taken", async () => {
    sidecar = await fakeSidecar();
    server = new LanServer(baseOpts());
    await server.start();
    const code = server.startSession(SESSION).code;

    const a = connectPatient(server);
    await a.open();
    a.send({ type: "pair", code });
    await a.waitFor("paired");

    const b = connectPatient(server);
    await b.open();
    b.send({ type: "pair", code });
    const err = await b.waitFor("error");
    expect(err.reason).toBe("session_taken");
    a.ws.close();
    b.ws.close();
  });

  it("rejects a bad code", async () => {
    sidecar = await fakeSidecar();
    server = new LanServer(baseOpts());
    await server.start();
    server.startSession(SESSION);
    const p = connectPatient(server);
    await p.open();
    p.send({ type: "pair", code: "ZZZZZZ" });
    const err = await p.waitFor("error");
    expect(err.reason).toBe("bad_code");
    p.ws.close();
  });

  it("rejects a WS upgrade from a foreign origin", async () => {
    sidecar = await fakeSidecar();
    server = new LanServer(baseOpts());
    await server.start();
    const addr = (server as any).port as number;
    const ws = new WebSocket(`wss://127.0.0.1:${addr}`, {
      rejectUnauthorized: false,
      origin: "https://evil.example.com",
    });
    const closed = await new Promise<boolean>((resolve) => {
      ws.on("unexpected-response", () => resolve(true));
      ws.on("error", () => resolve(true));
      ws.on("open", () => resolve(false));
    });
    expect(closed).toBe(true);
  });
});
