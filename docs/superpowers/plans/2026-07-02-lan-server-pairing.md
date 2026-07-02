# LAN Server + Session-Code Pairing (S1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the patient-web app over LAN HTTPS/WSS from Electron main, pair one browser device to a live session via a session code, and fan the sidecar's IntentScore out to that device — the transport foundation for vision (S2) and clinical workflow (S3).

**Architecture:** A self-contained, Electron-free module at `clinician-console/src/main/lan/` runs Node `https` + `ws`. It serves `patient-web/dist`, mints single-claimant session codes, forwards only `intent_score` frames to the paired patient, and relays WebRTC signaling (stubbed now, aiortc in S2). Electron main instantiates it and exposes start/end-session over IPC; a renderer pairing panel shows the QR + code. patient-web gains a `lanClient` that pairs from a `?c=` URL param.

**Tech Stack:** TypeScript, Node `https`/`http`/`os`, `ws` (already a dep), `selfsigned` (cert), `qrcode` (QR render), Vitest, React 18.

## Global Constraints

- **LAN-only bind.** The server MUST bind to the detected non-loopback LAN IPv4, never `0.0.0.0` or a public/routable interface (specsv2 §12.1).
- **No PHI on the patient channel.** Only game state + the 0–100 score go outbound to the patient. `eeg_quality` frames MUST NOT be forwarded to the patient (specsv2 §5).
- **Single-claimant pairing.** Exactly one patient socket may bind a live session; a second claimant is rejected. Codes are single-use with a TTL and are invalidated on session end (specsv2 §5, §12.1).
- **Strict origin.** WS upgrades whose `Origin` is not the served LAN origin MUST be rejected (specsv2 §12.1).
- **Self-signed TOFU TLS.** Dev cert is self-signed, cached in Electron `userData`, regenerated when missing/expired (specsv2 §12.3 option 2). Local-CA provisioning is deferred to V2-4.
- **`intent_score` frame is forwarded byte-for-byte** — the v1 JSON score contract is unchanged (specsv2 §9.5).
- **Code alphabet excludes confusables:** Crockford base32 minus `I L O U 0 1` → `23456789ABCDEFGHJKMNPQRSTVWXYZ`. Code length = 6.
- **Injectable dependencies.** Sockets, clock, cert, and sidecar-WS factory are injected so every module unit-tests headlessly without Electron or a real network peer (follow the existing `sidecar.ts` / `scoreClient.ts` patterns).
- **Tests are co-located** as `*.test.ts` next to source; run with `npm test` (Vitest) from `clinician-console/` or `patient-web/`.

---

### Task 1: Dependencies + self-signed cert module

**Files:**
- Modify: `clinician-console/package.json` (add `selfsigned`, `qrcode`, `@types/qrcode`)
- Create: `clinician-console/src/main/lan/cert.ts`
- Test: `clinician-console/src/main/lan/cert.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type Cert = { key: string; cert: string }`; `function loadOrCreateCert(dir: string, opts?: { now?: () => number; days?: number }): Cert` — returns a cached cert from `<dir>/lan-cert.json`, generating + persisting a fresh self-signed cert when the file is missing or the cached cert has expired.

- [ ] **Step 1: Add dependencies**

```bash
cd clinician-console && npm install selfsigned qrcode && npm install -D @types/qrcode
```

- [ ] **Step 2: Write the failing test**

```ts
// clinician-console/src/main/lan/cert.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadOrCreateCert } from "./cert";

describe("loadOrCreateCert", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "nr-cert-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("generates a cert on first call and persists it", () => {
    const c = loadOrCreateCert(dir);
    expect(c.key).toContain("PRIVATE KEY");
    expect(c.cert).toContain("BEGIN CERTIFICATE");
    expect(existsSync(join(dir, "lan-cert.json"))).toBe(true);
  });

  it("reuses the cached cert on the second call", () => {
    const a = loadOrCreateCert(dir);
    const b = loadOrCreateCert(dir);
    expect(b.cert).toBe(a.cert);
  });

  it("regenerates when the cached file is corrupt", () => {
    loadOrCreateCert(dir);
    writeFileSync(join(dir, "lan-cert.json"), "not json");
    const c = loadOrCreateCert(dir);
    expect(c.cert).toContain("BEGIN CERTIFICATE");
    expect(() => JSON.parse(readFileSync(join(dir, "lan-cert.json"), "utf8"))).not.toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd clinician-console && npx vitest run src/main/lan/cert.test.ts`
Expected: FAIL — cannot resolve `./cert`.

- [ ] **Step 4: Write minimal implementation**

```ts
// clinician-console/src/main/lan/cert.ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import selfsigned from "selfsigned";

export type Cert = { key: string; cert: string; expiresAt: number };

const FILE = "lan-cert.json";

function generate(days: number, now: number): Cert {
  const pems = selfsigned.generate([{ name: "commonName", value: "neuroreach.local" }], {
    days,
    keySize: 2048,
    algorithm: "sha256",
  });
  return { key: pems.private, cert: pems.cert, expiresAt: now + days * 86_400_000 };
}

export function loadOrCreateCert(
  dir: string,
  opts: { now?: () => number; days?: number } = {},
): Cert {
  const now = (opts.now ?? Date.now)();
  const days = opts.days ?? 365;
  const path = join(dir, FILE);
  if (existsSync(path)) {
    try {
      const cached = JSON.parse(readFileSync(path, "utf8")) as Cert;
      if (cached.key && cached.cert && cached.expiresAt > now) return cached;
    } catch {
      /* fall through to regenerate */
    }
  }
  const fresh = generate(days, now);
  writeFileSync(path, JSON.stringify(fresh), "utf8");
  return fresh;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd clinician-console && npx vitest run src/main/lan/cert.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add clinician-console/package.json clinician-console/package-lock.json clinician-console/src/main/lan/cert.ts clinician-console/src/main/lan/cert.test.ts
git commit -m "feat(lan): self-signed TOFU cert module + deps"
```

---

### Task 2: SessionPairing (pure single-claimant/TTL logic)

**Files:**
- Create: `clinician-console/src/main/lan/pairing.ts`
- Test: `clinician-console/src/main/lan/pairing.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `class SessionPairing`. Constructor `(opts?: { ttlMs?: number; now?: () => number; rng?: () => number })`. Methods: `mint(session: SessionInfo): string` (returns the code, replaces any prior active session), `validate(code: string): boolean`, `bind(socketId: string): boolean` (true on first bind, false on second claimant / no session), `boundSocketId(): string | null`, `session(): SessionInfo | null`, `end(): void`. `type SessionInfo = { patientFirstName: string; affectedSide: "left" | "right"; mode: string }`. `const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ"`.

- [ ] **Step 1: Write the failing test**

```ts
// clinician-console/src/main/lan/pairing.test.ts
import { describe, it, expect } from "vitest";
import { SessionPairing, CODE_ALPHABET, type SessionInfo } from "./pairing";

const SESSION: SessionInfo = { patientFirstName: "Margaret", affectedSide: "left", mode: "band_power_only" };

function makeRng(seq: number[]) {
  let i = 0;
  return () => seq[i++ % seq.length];
}

describe("SessionPairing", () => {
  it("mints a 6-char code from the confusable-free alphabet", () => {
    const p = new SessionPairing();
    const code = p.mint(SESSION);
    expect(code).toHaveLength(6);
    for (const ch of code) expect(CODE_ALPHABET).toContain(ch);
    expect(CODE_ALPHABET).not.toMatch(/[ILOU01]/);
  });

  it("validates the active code and rejects others", () => {
    const p = new SessionPairing();
    const code = p.mint(SESSION);
    expect(p.validate(code)).toBe(true);
    expect(p.validate("ZZZZZZ")).toBe(false);
  });

  it("binds exactly one socket; rejects a second claimant", () => {
    const p = new SessionPairing();
    p.mint(SESSION);
    expect(p.bind("sock-a")).toBe(true);
    expect(p.bind("sock-b")).toBe(false);
    expect(p.boundSocketId()).toBe("sock-a");
  });

  it("rejects a code after TTL expiry", () => {
    let t = 1000;
    const p = new SessionPairing({ ttlMs: 500, now: () => t });
    const code = p.mint(SESSION);
    t = 1600;
    expect(p.validate(code)).toBe(false);
  });

  it("end() invalidates the code and clears the binding", () => {
    const p = new SessionPairing();
    const code = p.mint(SESSION);
    p.bind("sock-a");
    p.end();
    expect(p.validate(code)).toBe(false);
    expect(p.boundSocketId()).toBeNull();
    expect(p.session()).toBeNull();
  });

  it("uses the injected rng for deterministic codes", () => {
    const p = new SessionPairing({ rng: makeRng([0]) });
    expect(p.mint(SESSION)).toBe("222222");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd clinician-console && npx vitest run src/main/lan/pairing.test.ts`
Expected: FAIL — cannot resolve `./pairing`.

- [ ] **Step 3: Write minimal implementation**

```ts
// clinician-console/src/main/lan/pairing.ts
export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 6;

export type SessionInfo = {
  patientFirstName: string;
  affectedSide: "left" | "right";
  mode: string;
};

type Active = { code: string; session: SessionInfo; mintedAt: number; socketId: string | null };

export class SessionPairing {
  private active: Active | null = null;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly rng: () => number;

  constructor(opts: { ttlMs?: number; now?: () => number; rng?: () => number } = {}) {
    this.ttlMs = opts.ttlMs ?? 600_000; // 10 min
    this.now = opts.now ?? Date.now;
    this.rng = opts.rng ?? Math.random;
  }

  private generateCode(): string {
    let out = "";
    for (let i = 0; i < CODE_LENGTH; i++) {
      out += CODE_ALPHABET[Math.floor(this.rng() * CODE_ALPHABET.length)];
    }
    return out;
  }

  private expired(): boolean {
    return !!this.active && this.now() - this.active.mintedAt > this.ttlMs;
  }

  mint(session: SessionInfo): string {
    const code = this.generateCode();
    this.active = { code, session, mintedAt: this.now(), socketId: null };
    return code;
  }

  validate(code: string): boolean {
    if (!this.active || this.expired()) return false;
    return this.active.code === code;
  }

  bind(socketId: string): boolean {
    if (!this.active || this.expired()) return false;
    if (this.active.socketId !== null) return false;
    this.active.socketId = socketId;
    return true;
  }

  boundSocketId(): string | null {
    return this.active?.socketId ?? null;
  }

  session(): SessionInfo | null {
    return this.active && !this.expired() ? this.active.session : null;
  }

  end(): void {
    this.active = null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd clinician-console && npx vitest run src/main/lan/pairing.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add clinician-console/src/main/lan/pairing.ts clinician-console/src/main/lan/pairing.test.ts
git commit -m "feat(lan): SessionPairing single-claimant + TTL logic"
```

---

### Task 3: Score relay (forward only intent_score)

**Files:**
- Create: `clinician-console/src/main/lan/scoreRelay.ts`
- Test: `clinician-console/src/main/lan/scoreRelay.test.ts`

**Interfaces:**
- Consumes: nothing (self-contained; sockets injected).
- Produces: `type RelaySocket = { onmessage: ((ev: { data: any }) => void) | null; onclose: ((ev?: any) => void) | null; onopen: ((ev?: any) => void) | null; close(): void }`. `function createScoreRelay(opts: { sidecarWsUrl: string; createSocket: (url: string) => RelaySocket; send: (raw: string) => void; scheduler?: (fn: () => void, ms: number) => void; reconnectMs?: number }): { connect(): void; stop(): void }`. On each sidecar message whose parsed `type === "intent_score"`, it calls `send(raw)` with the **verbatim** payload; all other message types (e.g. `eeg_quality`) are dropped. Reconnects to the sidecar on close.

- [ ] **Step 1: Write the failing test**

```ts
// clinician-console/src/main/lan/scoreRelay.test.ts
import { describe, it, expect, vi } from "vitest";
import { createScoreRelay, type RelaySocket } from "./scoreRelay";

function fakeSocket(): RelaySocket & { emit: (data: string) => void } {
  const s: any = { onmessage: null, onclose: null, onopen: null, close: vi.fn() };
  s.emit = (data: string) => s.onmessage?.({ data });
  return s;
}

describe("createScoreRelay", () => {
  it("forwards intent_score frames verbatim and drops eeg_quality", () => {
    const sock = fakeSocket();
    const sent: string[] = [];
    const relay = createScoreRelay({
      sidecarWsUrl: "ws://x",
      createSocket: () => sock,
      send: (raw) => sent.push(raw),
    });
    relay.connect();
    const scoreFrame = JSON.stringify({ type: "intent_score", intent_score: 72.3 });
    sock.emit(scoreFrame);
    sock.emit(JSON.stringify({ type: "eeg_quality", channels: [] }));
    sock.emit("not json");
    expect(sent).toEqual([scoreFrame]);
  });

  it("reconnects to the sidecar after close", () => {
    const sockets: ReturnType<typeof fakeSocket>[] = [];
    const scheduled: Array<() => void> = [];
    const relay = createScoreRelay({
      sidecarWsUrl: "ws://x",
      createSocket: () => { const s = fakeSocket(); sockets.push(s); return s; },
      send: () => {},
      scheduler: (fn) => { scheduled.push(fn); },
      reconnectMs: 100,
    });
    relay.connect();
    sockets[0].onclose?.();
    expect(scheduled).toHaveLength(1);
    scheduled[0]();
    expect(sockets).toHaveLength(2);
  });

  it("stop() closes the socket and suppresses reconnect", () => {
    const sockets: ReturnType<typeof fakeSocket>[] = [];
    const scheduled: Array<() => void> = [];
    const relay = createScoreRelay({
      sidecarWsUrl: "ws://x",
      createSocket: () => { const s = fakeSocket(); sockets.push(s); return s; },
      send: () => {},
      scheduler: (fn) => { scheduled.push(fn); },
    });
    relay.connect();
    relay.stop();
    expect(sockets[0].close).toHaveBeenCalled();
    sockets[0].onclose?.();
    expect(scheduled).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd clinician-console && npx vitest run src/main/lan/scoreRelay.test.ts`
Expected: FAIL — cannot resolve `./scoreRelay`.

- [ ] **Step 3: Write minimal implementation**

```ts
// clinician-console/src/main/lan/scoreRelay.ts
export type RelaySocket = {
  onmessage: ((ev: { data: any }) => void) | null;
  onclose: ((ev?: any) => void) | null;
  onopen: ((ev?: any) => void) | null;
  close(): void;
};

export type ScoreRelayOptions = {
  sidecarWsUrl: string;
  createSocket: (url: string) => RelaySocket;
  send: (raw: string) => void;
  scheduler?: (fn: () => void, ms: number) => void;
  reconnectMs?: number;
};

export function createScoreRelay(opts: ScoreRelayOptions) {
  const schedule = opts.scheduler ?? ((fn, ms) => setTimeout(fn, ms));
  const reconnectMs = opts.reconnectMs ?? 1000;
  let socket: RelaySocket | null = null;
  let stopped = false;

  function open() {
    const s = opts.createSocket(opts.sidecarWsUrl);
    socket = s;
    s.onmessage = (ev) => {
      const raw = String(ev.data);
      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return;
      }
      if (parsed && parsed.type === "intent_score") opts.send(raw);
    };
    s.onclose = () => {
      socket = null;
      if (stopped) return;
      schedule(open, reconnectMs);
    };
  }

  return {
    connect() {
      stopped = false;
      open();
    },
    stop() {
      stopped = true;
      socket?.close();
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd clinician-console && npx vitest run src/main/lan/scoreRelay.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add clinician-console/src/main/lan/scoreRelay.ts clinician-console/src/main/lan/scoreRelay.test.ts
git commit -m "feat(lan): scoreRelay forwards only intent_score to patient"
```

---

### Task 4: WebRTC signaling relay contract + S1 stub

**Files:**
- Create: `clinician-console/src/main/lan/signaling.ts`
- Test: `clinician-console/src/main/lan/signaling.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: signaling message types + `function handleSignalingMessage(msg: SignalingMessage, sendToPatient: (m: SignalingMessage) => void): boolean`. Returns `true` if `msg` was a signaling message it handled, `false` otherwise (so the LanServer dispatcher can fall through). **S1 stub behaviour:** a `webrtc-offer` gets an immediate `webrtc-answer` echo (stand-in for the aiortc peer); `webrtc-ice` from the patient is acknowledged with a mirrored `webrtc-ice` (empty candidate list) so the patient's ICE gathering path is exercised. **S2 replaces the stub body with a real aiortc relay; the message contract and signature stay.**
- `type SignalingMessage = { type: "webrtc-offer"; sdp: string } | { type: "webrtc-answer"; sdp: string } | { type: "webrtc-ice"; candidate: unknown }`.

- [ ] **Step 1: Write the failing test**

```ts
// clinician-console/src/main/lan/signaling.test.ts
import { describe, it, expect } from "vitest";
import { handleSignalingMessage, type SignalingMessage } from "./signaling";

describe("handleSignalingMessage (S1 stub)", () => {
  it("answers a webrtc-offer with a webrtc-answer echo", () => {
    const out: SignalingMessage[] = [];
    const handled = handleSignalingMessage({ type: "webrtc-offer", sdp: "OFFER" }, (m) => out.push(m));
    expect(handled).toBe(true);
    expect(out[0].type).toBe("webrtc-answer");
  });

  it("mirrors a webrtc-ice back to the patient", () => {
    const out: SignalingMessage[] = [];
    const handled = handleSignalingMessage({ type: "webrtc-ice", candidate: { foo: 1 } }, (m) => out.push(m));
    expect(handled).toBe(true);
    expect(out[0].type).toBe("webrtc-ice");
  });

  it("returns false for non-signaling messages", () => {
    const out: SignalingMessage[] = [];
    const handled = handleSignalingMessage({ type: "pair" } as any, (m) => out.push(m));
    expect(handled).toBe(false);
    expect(out).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd clinician-console && npx vitest run src/main/lan/signaling.test.ts`
Expected: FAIL — cannot resolve `./signaling`.

- [ ] **Step 3: Write minimal implementation**

```ts
// clinician-console/src/main/lan/signaling.ts
export type SignalingMessage =
  | { type: "webrtc-offer"; sdp: string }
  | { type: "webrtc-answer"; sdp: string }
  | { type: "webrtc-ice"; candidate: unknown };

const SIGNALING_TYPES = new Set(["webrtc-offer", "webrtc-answer", "webrtc-ice"]);

export function isSignalingMessage(msg: { type?: string }): msg is SignalingMessage {
  return !!msg && typeof msg.type === "string" && SIGNALING_TYPES.has(msg.type);
}

// S1 stub: stands in for the aiortc peer so the patient's WebRTC negotiation path
// is exercisable end-to-end. S2 replaces the body with a real aiortc relay; the
// signature and message contract are frozen here.
export function handleSignalingMessage(
  msg: SignalingMessage,
  sendToPatient: (m: SignalingMessage) => void,
): boolean {
  if (!isSignalingMessage(msg)) return false;
  if (msg.type === "webrtc-offer") {
    sendToPatient({ type: "webrtc-answer", sdp: `stub-answer-for:${msg.sdp}` });
    return true;
  }
  if (msg.type === "webrtc-ice") {
    sendToPatient({ type: "webrtc-ice", candidate: null });
    return true;
  }
  return true; // webrtc-answer from patient is a no-op in the stub
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd clinician-console && npx vitest run src/main/lan/signaling.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add clinician-console/src/main/lan/signaling.ts clinician-console/src/main/lan/signaling.test.ts
git commit -m "feat(lan): WebRTC signaling contract + S1 echo stub"
```

---

### Task 5: LanServer (HTTPS static + ws dispatcher, LAN-only, origin allowlist)

**Files:**
- Create: `clinician-console/src/main/lan/lanServer.ts`
- Create: `clinician-console/src/main/lan/netUtil.ts` (LAN-IP detection)
- Test: `clinician-console/src/main/lan/lanServer.test.ts`
- Test: `clinician-console/src/main/lan/netUtil.test.ts`

**Interfaces:**
- Consumes: `loadOrCreateCert` (Task 1) via injected `cert: Cert`; `SessionPairing`, `SessionInfo` (Task 2); `createScoreRelay`, `RelaySocket` (Task 3); `handleSignalingMessage` (Task 4).
- Produces:
  - `netUtil.ts`: `function detectLanIpv4(): string` — first non-internal IPv4 from `os.networkInterfaces()`, or `"127.0.0.1"` fallback.
  - `lanServer.ts`: `class LanServer extends EventEmitter`. Constructor `(opts: LanServerOptions)`. `type LanServerOptions = { host: string; port: number; patientDistDir: string; cert: { key: string; cert: string }; sidecarWsUrl: string; createSidecarSocket: (url: string) => RelaySocket; pairing?: SessionPairing }`. Methods: `start(): Promise<void>`, `stop(): Promise<void>`, `startSession(session: SessionInfo): { code: string; url: string }`, `endSession(): void`, `origin(): string` (`https://${host}:${port}`). Events: `"patient-connected"`, `"patient-disconnected"`.

- [ ] **Step 1: Write the failing netUtil test**

```ts
// clinician-console/src/main/lan/netUtil.test.ts
import { describe, it, expect } from "vitest";
import { detectLanIpv4 } from "./netUtil";

describe("detectLanIpv4", () => {
  it("returns a dotted-quad string (real interface or loopback fallback)", () => {
    const ip = detectLanIpv4();
    expect(ip).toMatch(/^\d{1,3}(\.\d{1,3}){3}$/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd clinician-console && npx vitest run src/main/lan/netUtil.test.ts`
Expected: FAIL — cannot resolve `./netUtil`.

- [ ] **Step 3: Implement netUtil**

```ts
// clinician-console/src/main/lan/netUtil.ts
import { networkInterfaces } from "node:os";

export function detectLanIpv4(): string {
  const ifaces = networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] ?? []) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return "127.0.0.1";
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd clinician-console && npx vitest run src/main/lan/netUtil.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Write the failing LanServer integration test**

```ts
// clinician-console/src/main/lan/lanServer.test.ts
import { describe, it, expect, afterEach, beforeAll } from "vitest";
import WebSocket, { WebSocketServer } from "ws";
import { AddressInfo } from "node:net";
import { loadOrCreateCert } from "./cert";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LanServer, type LanServerOptions } from "./lanServer";
import type { RelaySocket } from "./scoreRelay";
import type { SessionInfo } from "./pairing";

const SESSION: SessionInfo = { patientFirstName: "Margaret", affectedSide: "left", mode: "band_power_only" };

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
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd clinician-console && npx vitest run src/main/lan/lanServer.test.ts`
Expected: FAIL — cannot resolve `./lanServer`.

- [ ] **Step 7: Implement LanServer**

```ts
// clinician-console/src/main/lan/lanServer.ts
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
```

- [ ] **Step 8: Run it to verify it passes**

Run: `cd clinician-console && npx vitest run src/main/lan/lanServer.test.ts`
Expected: PASS (5 tests). If a `waitFor` hangs, the dispatcher branch for that message type is wrong — recheck `handlePair`.

- [ ] **Step 9: Commit**

```bash
git add clinician-console/src/main/lan/lanServer.ts clinician-console/src/main/lan/lanServer.test.ts clinician-console/src/main/lan/netUtil.ts clinician-console/src/main/lan/netUtil.test.ts
git commit -m "feat(lan): LanServer HTTPS static + WSS pairing dispatcher"
```

---

### Task 6: Electron main wiring + IPC + preload

**Files:**
- Modify: `clinician-console/src/main/config.ts` (add LAN config)
- Modify: `clinician-console/src/main/main.ts` (instantiate LanServer, IPC handlers)
- Modify: `clinician-console/src/main/preload.ts` (expose pairing API)
- Test: `clinician-console/src/main/lanConfig.test.ts`

**Interfaces:**
- Consumes: `LanServer`, `LanServerOptions` (Task 5); `detectLanIpv4` (Task 5); `loadOrCreateCert` (Task 1); `SIDECAR_WS_URL` (existing config).
- Produces: `config.ts` gains `LAN_PORT = 8443` and `function lanServerOptions(repoRoot: string, userDataDir: string): Omit<LanServerOptions, "createSidecarSocket">`. `preload.ts` exposes `window.neuroreach.startSession(session)`, `.endSession()`, `.onPatientConnected(cb)`, `.onPatientDisconnected(cb)`, returning `{ code, url }` from `startSession`.

- [ ] **Step 1: Write the failing config test**

```ts
// clinician-console/src/main/lanConfig.test.ts
import { describe, it, expect } from "vitest";
import { LAN_PORT, lanServerOptions } from "./config";

describe("lanServerOptions", () => {
  it("points the patient dist dir at the built patient-web bundle", () => {
    const o = lanServerOptions("/repo", "/userdata");
    expect(o.port).toBe(LAN_PORT);
    expect(o.patientDistDir).toContain("patient-web");
    expect(o.patientDistDir).toContain("dist");
    expect(o.sidecarWsUrl).toContain("ws://");
    expect(o.cert.cert).toContain("BEGIN CERTIFICATE");
    expect(o.host).toMatch(/^\d{1,3}(\.\d{1,3}){3}$/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd clinician-console && npx vitest run src/main/lanConfig.test.ts`
Expected: FAIL — `LAN_PORT` / `lanServerOptions` not exported.

- [ ] **Step 3: Extend config.ts**

Append to `clinician-console/src/main/config.ts`:

```ts
import { detectLanIpv4 } from "./lan/netUtil";
import { loadOrCreateCert } from "./lan/cert";
import type { LanServerOptions } from "./lan/lanServer";

export const LAN_PORT = 8443;

export function lanServerOptions(
  repoRoot: string,
  userDataDir: string,
): Omit<LanServerOptions, "createSidecarSocket"> {
  return {
    host: detectLanIpv4(),
    port: LAN_PORT,
    patientDistDir: join(repoRoot, "patient-web", "dist"),
    cert: loadOrCreateCert(userDataDir),
    sidecarWsUrl: SIDECAR_WS_URL,
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd clinician-console && npx vitest run src/main/lanConfig.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Wire main.ts (no unit test — Electron runtime)**

Add to `clinician-console/src/main/main.ts` (imports + inside `app.whenReady`), and a `WebSocket`-backed `createSidecarSocket` adapter:

```ts
import { app, BrowserWindow, ipcMain } from "electron";
import WebSocket from "ws";
import { LanServer } from "./lan/lanServer";
import { lanServerOptions } from "./config";
import type { RelaySocket } from "./lan/scoreRelay";
import type { SessionInfo } from "./lan/pairing";

let lan: LanServer | null = null;

function nodeSidecarSocket(url: string): RelaySocket {
  const ws = new WebSocket(url);
  const s: RelaySocket = { onmessage: null, onclose: null, onopen: null, close: () => ws.close() };
  ws.on("open", () => s.onopen?.());
  ws.on("message", (d) => s.onmessage?.({ data: d.toString() }));
  ws.on("close", () => s.onclose?.());
  ws.on("error", () => {});
  return s;
}

function startLan() {
  lan = new LanServer({ ...lanServerOptions(REPO_ROOT, app.getPath("userData")), createSidecarSocket: nodeSidecarSocket });
  lan.on("patient-connected", () => win?.webContents.send("patient-connected"));
  lan.on("patient-disconnected", () => win?.webContents.send("patient-disconnected"));
  lan.start();

  ipcMain.handle("start-session", (_e, session: SessionInfo) => lan!.startSession(session));
  ipcMain.handle("end-session", () => lan!.endSession());
}
```

Call `startLan();` inside `app.whenReady().then(...)` after `startSidecar();`, and in the `before-quit` handler add `await lan?.stop();`.

- [ ] **Step 6: Expose the pairing API in preload.ts**

Replace `clinician-console/src/main/preload.ts` with:

```ts
import { contextBridge, ipcRenderer } from "electron";
import { SIDECAR_WS_URL } from "./config";

contextBridge.exposeInMainWorld("neuroreach", {
  sidecarWsUrl: SIDECAR_WS_URL,
  onSidecarStatus: (cb: (s: unknown) => void) => {
    ipcRenderer.on("sidecar-status", (_e, status) => cb(status));
  },
  startSession: (session: unknown) => ipcRenderer.invoke("start-session", session),
  endSession: () => ipcRenderer.invoke("end-session"),
  onPatientConnected: (cb: () => void) => ipcRenderer.on("patient-connected", () => cb()),
  onPatientDisconnected: (cb: () => void) => ipcRenderer.on("patient-disconnected", () => cb()),
});
```

- [ ] **Step 7: Verify the main build compiles**

Run: `cd clinician-console && npm run build:main`
Expected: `tsc -p tsconfig.main.json` exits 0, no type errors.

- [ ] **Step 8: Commit**

```bash
git add clinician-console/src/main/config.ts clinician-console/src/main/main.ts clinician-console/src/main/preload.ts clinician-console/src/main/lanConfig.test.ts
git commit -m "feat(lan): wire LanServer into Electron main + pairing IPC"
```

---

### Task 7: Console pairing panel (renderer)

**Files:**
- Create: `clinician-console/src/renderer/PairingPanel.tsx`
- Create: `clinician-console/src/renderer/PairingPanel.test.tsx`
- Modify: `clinician-console/src/renderer/App.tsx` (mount the panel)

**Interfaces:**
- Consumes: `window.neuroreach.startSession/endSession/onPatientConnected/onPatientDisconnected` (Task 6); `qrcode`.
- Produces: `PairingPanel` React component with an injectable `api` prop (defaults to `window.neuroreach`) so it tests without Electron: `type PairingApi = { startSession: (s: SessionInfo) => Promise<{ code: string; url: string }>; endSession: () => Promise<void>; onPatientConnected: (cb: () => void) => void; onPatientDisconnected: (cb: () => void) => void }`. Also re-export `type SessionInfo` from `../main/lan/pairing`.

- [ ] **Step 1: Write the failing test**

```tsx
// clinician-console/src/renderer/PairingPanel.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PairingPanel, type PairingApi } from "./PairingPanel";

function fakeApi(): PairingApi {
  return {
    startSession: vi.fn().mockResolvedValue({ code: "ABC234", url: "https://10.0.0.5:8443/?c=ABC234" }),
    endSession: vi.fn().mockResolvedValue(undefined),
    onPatientConnected: vi.fn(),
    onPatientDisconnected: vi.fn(),
  };
}

const SESSION = { patientFirstName: "Margaret", affectedSide: "left" as const, mode: "band_power_only" };

describe("PairingPanel", () => {
  it("mints and shows the code + URL on Start Session", async () => {
    const api = fakeApi();
    render(<PairingPanel api={api} session={SESSION} />);
    fireEvent.click(screen.getByRole("button", { name: /start session/i }));
    await waitFor(() => expect(screen.getByText("ABC234")).toBeInTheDocument());
    expect(api.startSession).toHaveBeenCalledWith(SESSION);
  });

  it("shows a connected indicator when a patient pairs", async () => {
    const api = fakeApi();
    let fire: () => void = () => {};
    (api.onPatientConnected as any).mockImplementation((cb: () => void) => { fire = cb; });
    render(<PairingPanel api={api} session={SESSION} />);
    fire();
    await waitFor(() => expect(screen.getByText(/patient connected/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd clinician-console && npx vitest run src/renderer/PairingPanel.test.tsx`
Expected: FAIL — cannot resolve `./PairingPanel`.

- [ ] **Step 3: Implement PairingPanel**

```tsx
// clinician-console/src/renderer/PairingPanel.tsx
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { SessionInfo } from "../main/lan/pairing";

export type { SessionInfo };

export type PairingApi = {
  startSession: (s: SessionInfo) => Promise<{ code: string; url: string }>;
  endSession: () => Promise<void>;
  onPatientConnected: (cb: () => void) => void;
  onPatientDisconnected: (cb: () => void) => void;
};

export function PairingPanel({ api, session }: { api: PairingApi; session: SessionInfo }) {
  const [code, setCode] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    api.onPatientConnected(() => setConnected(true));
    api.onPatientDisconnected(() => setConnected(false));
  }, [api]);

  async function start() {
    const { code, url } = await api.startSession(session);
    setCode(code);
    setQr(await QRCode.toDataURL(url));
  }

  async function end() {
    await api.endSession();
    setCode(null);
    setQr(null);
    setConnected(false);
  }

  return (
    <section className="pairing-panel">
      {!code ? (
        <button onClick={start}>Start Session</button>
      ) : (
        <div className="pairing-active">
          {qr && <img src={qr} alt="Session pairing QR code" width={180} height={180} />}
          <p className="pairing-code">{code}</p>
          <p className="pairing-status">
            {connected ? "✓ Patient connected" : "Waiting for patient to scan…"}
          </p>
          <button onClick={end}>End Session</button>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd clinician-console && npx vitest run src/renderer/PairingPanel.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Mount in App.tsx**

Import `PairingPanel` in `clinician-console/src/renderer/App.tsx` and render it in the patient-workspace header area, passing a `session` built from the selected patient (`patientFirstName`, `affectedSide`, `mode`) and `api={window.neuroreach}`. Guard for `window.neuroreach` being undefined in the Vitest App test (render the panel only when present, or pass a no-op api in the existing App test setup).

- [ ] **Step 6: Run the full renderer suite + typecheck**

Run: `cd clinician-console && npm test && npm run build:renderer`
Expected: all tests pass; Vite renderer build succeeds.

- [ ] **Step 7: Commit**

```bash
git add clinician-console/src/renderer/PairingPanel.tsx clinician-console/src/renderer/PairingPanel.test.tsx clinician-console/src/renderer/App.tsx
git commit -m "feat(console): pairing panel — QR + code + connected indicator"
```

---

### Task 8: patient-web lanClient (pair from ?c=, localhost fallback)

**Files:**
- Create: `patient-web/src/net/lanClient.ts`
- Test: `patient-web/src/net/lanClient.test.ts`

**Interfaces:**
- Consumes: reuses the existing `WsLike` type shape from `patient-web/src/net/scoreClient.ts` (import it).
- Produces: `function createLanClient(opts: LanClientOptions): { connect(): void; stop(): void }`. `type LanClientOptions = { code: string | null; wssUrl: string; localhostUrl: string; createSocket: (url: string) => WsLike; onScoreFrame: (raw: string) => void; onPaired: (session: PairedSession) => void; onError: (reason: string) => void; scheduler?: (fn: () => void, ms: number) => void }`. `type PairedSession = { patientFirstName: string; affectedSide: "left" | "right"; mode: string }`. When `code` is non-null it connects to `wssUrl`, sends `{type:"pair",code}`, and routes `paired`/`error`/`intent_score`; when `code` is null (dev) it connects to `localhostUrl` and treats the connection as immediately paired with a dev session, routing all `intent_score` frames.

- [ ] **Step 1: Write the failing test**

```ts
// patient-web/src/net/lanClient.test.ts
import { describe, it, expect, vi } from "vitest";
import { createLanClient } from "./lanClient";
import type { WsLike } from "./scoreClient";

function fakeSocket(): WsLike & { emit: (data: any) => void; fireOpen: () => void; sent: string[] } {
  const s: any = { onopen: null, onclose: null, onmessage: null, onerror: null, close: vi.fn(), sent: [] };
  s.send = (d: string) => s.sent.push(d);
  s.emit = (data: any) => s.onmessage?.({ data });
  s.fireOpen = () => s.onopen?.({});
  return s;
}

describe("createLanClient", () => {
  it("pairs with the code and surfaces paired + score frames", () => {
    const sock = fakeSocket();
    const paired: any[] = [];
    const frames: string[] = [];
    const c = createLanClient({
      code: "ABC234",
      wssUrl: "wss://host:8443",
      localhostUrl: "ws://localhost:8765",
      createSocket: () => sock,
      onScoreFrame: (raw) => frames.push(raw),
      onPaired: (s) => paired.push(s),
      onError: () => {},
    });
    c.connect();
    sock.fireOpen();
    expect(JSON.parse(sock.sent[0])).toEqual({ type: "pair", code: "ABC234" });
    sock.emit(JSON.stringify({ type: "paired", session: { patientFirstName: "Margaret", affectedSide: "left", mode: "band_power_only" } }));
    expect(paired[0].patientFirstName).toBe("Margaret");
    const frame = JSON.stringify({ type: "intent_score", intent_score: 40 });
    sock.emit(frame);
    expect(frames).toEqual([frame]);
  });

  it("surfaces error on rejection", () => {
    const sock = fakeSocket();
    const errors: string[] = [];
    const c = createLanClient({
      code: "ZZZZZZ", wssUrl: "wss://h", localhostUrl: "ws://l",
      createSocket: () => sock, onScoreFrame: () => {}, onPaired: () => {},
      onError: (r) => errors.push(r),
    });
    c.connect();
    sock.fireOpen();
    sock.emit(JSON.stringify({ type: "error", reason: "session_taken" }));
    expect(errors).toEqual(["session_taken"]);
  });

  it("dev mode (no code) connects to localhost and auto-pairs", () => {
    const sock = fakeSocket();
    const paired: any[] = [];
    let usedUrl = "";
    const c = createLanClient({
      code: null, wssUrl: "wss://h", localhostUrl: "ws://localhost:8765",
      createSocket: (u) => { usedUrl = u; return sock; },
      onScoreFrame: () => {}, onPaired: (s) => paired.push(s), onError: () => {},
    });
    c.connect();
    sock.fireOpen();
    expect(usedUrl).toBe("ws://localhost:8765");
    expect(sock.sent).toHaveLength(0);
    expect(paired).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd patient-web && npx vitest run src/net/lanClient.test.ts`
Expected: FAIL — cannot resolve `./lanClient`.

- [ ] **Step 3: Implement lanClient**

```ts
// patient-web/src/net/lanClient.ts
import type { WsLike } from "./scoreClient";

export type PairedSession = {
  patientFirstName: string;
  affectedSide: "left" | "right";
  mode: string;
};

export type LanClientOptions = {
  code: string | null;
  wssUrl: string;
  localhostUrl: string;
  createSocket: (url: string) => WsLike;
  onScoreFrame: (raw: string) => void;
  onPaired: (session: PairedSession) => void;
  onError: (reason: string) => void;
  scheduler?: (fn: () => void, ms: number) => void;
};

const DEV_SESSION: PairedSession = { patientFirstName: "Margaret", affectedSide: "left", mode: "band_power_only" };

export function createLanClient(opts: LanClientOptions) {
  let socket: WsLike | null = null;
  let stopped = false;

  function open() {
    const url = opts.code ? opts.wssUrl : opts.localhostUrl;
    const s = opts.createSocket(url);
    socket = s;
    s.onopen = () => {
      if (opts.code) s.send?.(JSON.stringify({ type: "pair", code: opts.code }));
      else opts.onPaired(DEV_SESSION); // dev: localhost score socket, no pairing handshake
    };
    s.onmessage = (ev) => {
      const raw = String(ev.data);
      let msg: any;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (msg.type === "paired") opts.onPaired(msg.session as PairedSession);
      else if (msg.type === "error") opts.onError(msg.reason);
      else if (msg.type === "intent_score") opts.onScoreFrame(raw);
    };
    s.onclose = () => {
      socket = null;
    };
  }

  return {
    connect() {
      stopped = false;
      open();
    },
    stop() {
      stopped = true;
      socket?.close();
    },
  };
}
```

> Note: `WsLike` in `scoreClient.ts` has no `send` in its type. Add an optional `send?(data: string): void;` to the `WsLike` type in `patient-web/src/net/scoreClient.ts` as part of this step (browser `WebSocket` already has `send`). This is a type-only widening; the existing scoreClient behaviour is unchanged.

- [ ] **Step 4: Run it to verify it passes**

Run: `cd patient-web && npx vitest run src/net/lanClient.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add patient-web/src/net/lanClient.ts patient-web/src/net/lanClient.test.ts patient-web/src/net/scoreClient.ts
git commit -m "feat(patient-web): lanClient — pair from ?c= with localhost dev fallback"
```

---

### Task 9: patient-web pairing scene + App integration + session identity

**Files:**
- Create: `patient-web/src/scenes/PairingScene.tsx`
- Create: `patient-web/src/scenes/PairingScene.test.tsx`
- Modify: `patient-web/src/App.tsx` (pairing gate + identity from ack)
- Modify: `patient-web/src/config.ts` (dev default + `readSessionCode` helper)
- Test: `patient-web/src/App.test.tsx` (extend for the pairing gate)

**Interfaces:**
- Consumes: `createLanClient`, `PairedSession` (Task 8).
- Produces: `PairingScene` component: props `{ code: string; wssUrl: string; onPaired: (s: PairedSession) => void }` — renders "Connecting to your session…", calls `createLanClient`, advances via `onPaired`, shows a friendly retry on `onError`. `config.ts` gains `function readSessionCode(search?: string): string | null` (parses `?c=`) and keeps the hardcoded identity only as a dev default.

- [ ] **Step 1: Write the failing config helper + scene test**

```tsx
// patient-web/src/scenes/PairingScene.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { PairingScene } from "./PairingScene";
import { readSessionCode } from "../config";

describe("readSessionCode", () => {
  it("parses ?c= and returns null when absent", () => {
    expect(readSessionCode("?c=ABC234")).toBe("ABC234");
    expect(readSessionCode("")).toBeNull();
  });
});

describe("PairingScene", () => {
  it("shows connecting text, then calls onPaired", async () => {
    const onPaired = vi.fn();
    // Stub WebSocket so the scene's default socket factory resolves paired quickly.
    const socket: any = { onopen: null, onclose: null, onmessage: null, onerror: null, send: vi.fn(), close: vi.fn() };
    render(
      <PairingScene
        code="ABC234"
        wssUrl="wss://host:8443"
        onPaired={onPaired}
        createSocket={() => socket}
      />,
    );
    expect(screen.getByText(/connecting to your session/i)).toBeInTheDocument();
    socket.onopen?.({});
    socket.onmessage?.({ data: JSON.stringify({ type: "paired", session: { patientFirstName: "Margaret", affectedSide: "left", mode: "band_power_only" } }) });
    await waitFor(() => expect(onPaired).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd patient-web && npx vitest run src/scenes/PairingScene.test.tsx`
Expected: FAIL — cannot resolve `./PairingScene` / `readSessionCode`.

- [ ] **Step 3: Add readSessionCode to config.ts**

Append to `patient-web/src/config.ts`:

```ts
export function readSessionCode(search: string = window.location.search): string | null {
  const params = new URLSearchParams(search);
  return params.get("c");
}
```

- [ ] **Step 4: Implement PairingScene**

```tsx
// patient-web/src/scenes/PairingScene.tsx
import { useEffect, useState } from "react";
import { createLanClient, type PairedSession } from "../net/lanClient";
import type { WsLike } from "../net/scoreClient";

export function PairingScene({
  code,
  wssUrl,
  onPaired,
  createSocket = (url) => new WebSocket(url) as unknown as WsLike,
}: {
  code: string;
  wssUrl: string;
  onPaired: (s: PairedSession) => void;
  createSocket?: (url: string) => WsLike;
}) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = createLanClient({
      code,
      wssUrl,
      localhostUrl: wssUrl,
      createSocket,
      onScoreFrame: () => {},
      onPaired,
      onError: (r) => setError(r),
    });
    client.connect();
    return () => client.stop();
  }, [code, wssUrl, onPaired, createSocket]);

  return (
    <div className="pairing-scene">
      {error ? (
        <p role="alert">We couldn't connect ({error}). Ask your clinician to start a new session.</p>
      ) : (
        <p>Connecting to your session…</p>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Integrate into App.tsx**

In `patient-web/src/App.tsx`: compute `const code = readSessionCode();` once. Add a `"pairing"` view as the initial view **when a code is present**; hold `PairedSession` in state; on `onPaired`, store the identity and advance to `"welcome"`. Replace `config.patient.firstName` reads with the paired identity (falling back to `config.patient` in dev when no code). Derive the WSS URL from `window.location` (`wss://<host>/`). When no code is present, keep the current initial `"welcome"` view (dev flow unchanged).

- [ ] **Step 6: Extend App.test.tsx**

Add a test asserting that with a code in the URL the app first renders the pairing scene, and after a simulated `paired` message advances to Welcome showing the paired name. Keep the existing no-code tests green (they exercise the dev flow).

- [ ] **Step 7: Run the full patient-web suite + typecheck + build**

Run: `cd patient-web && npm test && npx tsc -b && npm run build`
Expected: all tests pass (existing 52 + new), typecheck clean, Vite build succeeds.

- [ ] **Step 8: Commit**

```bash
git add patient-web/src/scenes/PairingScene.tsx patient-web/src/scenes/PairingScene.test.tsx patient-web/src/App.tsx patient-web/src/App.test.tsx patient-web/src/config.ts
git commit -m "feat(patient-web): pairing scene + session identity from paired ack"
```

---

### Task 10: Live smoke verification + docs

**Files:**
- Modify: `docs/todos.md` (S1 changelog entry + updated gaps)

**Interfaces:** none (verification + documentation).

- [ ] **Step 1: Build the patient bundle**

Run: `cd patient-web && npm run build`
Expected: `patient-web/dist/index.html` exists (the LanServer serves this).

- [ ] **Step 2: Full console + patient test suites green**

Run: `cd clinician-console && npm test` then `cd patient-web && npm test`
Expected: all unit + integration tests pass in both packages.

- [ ] **Step 3: Live LAN smoke (manual, no headset)**

1. Start the mock-EEG sidecar: `conda run -n eeg python signal-engine/run_ws_server.py`
2. Start the console: `cd clinician-console && npm run dev`
3. Click **Start Session** → note the QR + code.
4. On a **second device on the same LAN**, open `https://<clinic-ip>:8443/?c=<code>`, accept the self-signed certificate warning once (TOFU), confirm the pairing scene advances to Welcome and the live score animates during virtual-MI bursts.
5. Confirm a second device attempting the same code is rejected.

Record the observed result (frames seen, pairing accepted/second-rejected) in the todos entry.

- [ ] **Step 4: Update docs/todos.md**

Add an `S1 — LAN server + session-code pairing — DONE` block mirroring the existing V2-* entries: components built (`cert`, `pairing`, `scoreRelay`, `signaling`, `lanServer`, Electron wiring, pairing panel, patient `lanClient` + pairing scene), test counts, the live-smoke result, and updated gaps (signaling is a stub → S2 aiortc; control channel + camera-health + SQLite persistence → S3; `getUserMedia`/WebRTC camera → S2).

- [ ] **Step 5: Commit**

```bash
git add docs/todos.md
git commit -m "docs(S1): LAN server + pairing done — changelog + gaps update"
```

---

## Self-Review Notes

- **Spec coverage:** §4.3 (serve React build → Task 5 static server; score fan-out → Task 3/5; signaling → Task 4; TLS → Task 1) ✓; §5 pairing flow (mint/QR/validate/single-claimant/TTL/ephemeral) → Tasks 2, 5, 7 ✓; §7 signaling relay only → Task 4 (aiortc explicitly deferred) ✓; §10.3 pairing panel → Task 7 ✓; §12.1 (LAN-only bind, single-use, single-claimant, origin allowlist, no PHI) → Tasks 2, 5 ✓; §12.3 self-signed TOFU → Task 1 ✓; §9.5 verbatim `intent_score` → Task 3 ✓; patient-web integration + identity from ack → Tasks 8, 9 ✓.
- **Deferred (documented in spec §10, restated per-task):** aiortc peer, Kinematic_Score, control channel, camera-health panel, SQLite persistence, mock-EEG extensions, local-CA/installer.
- **Type consistency:** `RelaySocket` (Task 3) reused by Task 5 + main.ts (Task 6); `WsLike` (scoreClient) reused + `send?` widened in Task 8; `SessionInfo` (Task 2) flows through Tasks 5/6/7; `PairedSession` (Task 8) flows to Task 9. Codes use the single `CODE_ALPHABET` constant everywhere.
