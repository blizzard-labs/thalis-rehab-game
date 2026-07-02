# S1 — LAN Server + Session-Code Pairing — Design

**Date:** 2026-07-02
**Status:** approved, pre-implementation
**Spec refs:** [`specsv2.md`](../../specsv2.md) §4.3, §5, §7 (signaling only), §10.3, §12.1, §12.3
**Milestone:** foundation for specsv2 V2-2 (vision fusion) and V2-3 (clinical workflow)

---

## 1. Context & scope

The user asked to build specsv2 **Phase 2 (vision fusion)** and **Phase 3 (clinical
workflow)**. Both sit on a prerequisite that is currently **0% built**: the LAN
HTTPS/WSS server + session-code pairing (§4.3, §5). Without it:

- the patient browser cannot get a **secure context**, so `getUserMedia()` (camera,
  Phase 2) cannot run over the LAN;
- the patient device cannot receive the IntentScore off the clinic PC (it is hardcoded
  to `ws://localhost:8765` today);
- there is no WebRTC signaling path for Phase 2's camera stream.

The overall effort was decomposed into four dependency-ordered sub-projects:

| # | Sub-project | Depends on |
|---|---|---|
| **S1** | LAN server + session-code pairing + WSS score fan-out + WebRTC signaling relay + dev TLS | — (foundation) |
| **S2** | Vision fusion: patient WebRTC publisher → aiortc receiver → MediaPipe → Kinematic_Score into fusion + EEG-only fallback (§7) | S1 |
| **S3** | Clinical workflow: engine control channel, pairing/camera-health panels, SQLite persistence (§10/§11) | S1 |
| **S4** | Mock-EEG stream extensions to exercise S2/S3 features headlessly | woven into S2/S3 |

**This document specifies S1 only.** S2 and S3 each get their own spec → plan → build
cycle.

### Locked design decisions (confirmed with stakeholder)

- **No mock camera.** The camera is real and available on the patient-web hosting
  device. The only hardware we cannot use in testing is the EEG headset, which already
  has a synthetic stream (`MockUnicornOutlet` / `run_ws_server.py`). "Mock-stream
  updates" therefore means *extending the existing mock EEG* for new-feature coverage
  (lands in S3), **not** building a mock camera.
- **Dev TLS = self-signed cert, trust-on-first-use** (§12.3 option 2). Local-CA
  provisioning is deferred to V2-4 packaging.
- **Full SQLite via sidecar FastAPI** is the S3 persistence target (out of scope here,
  recorded for continuity).
- **Build order:** S1 first (foundation / transport spine), per the spec's own V2-0
  de-risking guidance.

---

## 2. Architecture

The LAN server lives **inside Electron main** per §4.3, implemented as an **isolated,
injectable module** at `clinician-console/src/main/lan/` that runs on plain Node
`https` + `ws` with **zero Electron imports**. Electron main instantiates it and passes
the patient-build path, the sidecar WS URL, and a cert provider. This keeps the whole
LAN server unit-testable headlessly (boot server, connect a mock WS client, assert
behaviour) without launching Electron.

```
┌───────────────────────── Electron MAIN (clinic PC) ─────────────────────────┐
│  SidecarSupervisor  ── spawns/supervises ──►  Python sidecar (ws://localhost:8765)
│                                                    intent_score + eeg_quality @ 20/5 Hz
│  LanServer (src/main/lan/)                                    │
│   ├─ https static server  ── serves patient-web/dist          │ (scoreRelay WS client)
│   ├─ ws WebSocketServer  (same port, LAN-IP bind only)        ▼
│   │    ├─ SessionPairing   (mint code / single claimant / TTL)
│   │    ├─ scoreRelay       (forward ONLY intent_score → patient)
│   │    └─ signaling        (WebRTC SDP/ICE relay; S2 wires aiortc peer)
│   └─ cert  (self-signed, cached in userData, TOFU)
└──────────────────────────────┬───────────────────────────────────────────────┘
                                │  clinic LAN — HTTPS + WSS (self-signed)
                                ▼
                   PATIENT DEVICE (browser, real camera)
                     patient-web  ← ?c=<code> → pair → receive score
```

**Rejected alternatives:**
- *LAN server in the Python sidecar.* Contradicts §4.3's ownership split (sidecar owns
  DSP/fusion/MediaPipe/SQLite; Electron main owns process supervision + the
  patient-facing LAN surface). Would also split patient-LAN concerns across two
  processes awkwardly.
- *Standalone 3rd Node process.* Buys the same testability the injectable-module design
  already gives, at the cost of another process to supervise. Overkill.

---

## 3. Components (`clinician-console/src/main/lan/`)

### 3.1 `pairing.ts` — `SessionPairing` (pure logic, no I/O)
- `mint()` → mints a **6-char code** from an ambiguity-free alphabet (Crockford base32
  minus `I L O U 0 1`), sets it as the single active session, records `mintedAt`.
- `validate(code)` → `boolean`; false if no active session, mismatch, expired, or already
  claimed.
- `bind(socketId)` → binds exactly one patient socket to the session; a second claimant
  is rejected (returns false).
- `end()` → invalidates the code, unbinds.
- **TTL:** configurable (default 10 min unclaimed); expiry checked in `validate`.
- Fully unit-tested; carries no sockets or timers itself (clock injected).

### 3.2 `lanServer.ts` — `LanServer`
- HTTPS static file server for `patient-web/dist` + a `ws` `WebSocketServer` on the
  **same port**.
- **Binds only to the detected LAN IPv4** (first non-loopback IPv4; config override).
  Never binds `0.0.0.0` or a public interface (§12.1).
- **Origin allowlist:** rejects WS upgrades whose `Origin` is not the served LAN origin
  (§12.1 strict origin).
- Injectable deps: `SessionPairing`, cert provider, sidecar-WS factory, clock, logger.
- Owns the WS message dispatcher: routes `pair`, WebRTC signaling messages, and
  game-session events.

### 3.3 `scoreRelay.ts`
- Opens a WS **client** to the sidecar's existing `ws://localhost:8765`.
- Forwards **only `intent_score`** frames (+ game-state messages) to the paired patient
  socket. **`eeg_quality` is never sent to the patient** — it stays clinician-side
  (§5: the patient channel carries game state + the 0–100 score only, no PHI, nothing
  more).
- Reconnects to the sidecar on drop (sidecar may restart under the supervisor).

### 3.4 `signaling.ts`
- Relays WebRTC **SDP offer/answer + ICE candidates** between the patient socket and the
  sidecar's (future) aiortc endpoint. **Host ICE candidates only — no STUN/TURN, no
  internet** (§4.3.4).
- **S1 scope:** define the relay message contract (`webrtc-offer` / `webrtc-answer` /
  `webrtc-ice`) and implement the relay plumbing with a **loopback echo stub** standing
  in for the aiortc peer. **S2 replaces the stub with the real aiortc peer.**

### 3.5 `cert.ts`
- Generates a self-signed cert via `selfsigned`, cached to Electron `userData`;
  regenerated if missing or expired. Trust-on-first-use (§12.3 option 2) — the patient
  device accepts the browser interstitial once per device.

---

## 4. WS message contract

Patient → server:
```jsonc
{"type":"pair","code":"ABC234"}
{"type":"webrtc-offer","sdp":"..."}          // S2 uses; S1 relays to stub
{"type":"webrtc-ice","candidate":{...}}      // S2 uses; S1 relays to stub
{"type":"game-event","event":"...","data":{...}}  // logged (S3 persists)
```

Server → patient:
```jsonc
{"type":"paired","session":{"patientFirstName":"...","affectedSide":"...","mode":"..."}}
{"type":"error","reason":"session_taken"|"bad_code"|"expired"}
{"type":"intent_score", ...}                 // forwarded verbatim from the sidecar
{"type":"webrtc-answer","sdp":"..."}         // S2; S1 echoes via stub
{"type":"webrtc-ice","candidate":{...}}      // S2; S1 echoes via stub
```

The `intent_score` frame is **forwarded byte-for-byte** from the sidecar — the v1 JSON
score contract is preserved unchanged (specsv2 §9.5 note).

---

## 5. Patient-web integration (`patient-web/`)

- **`net/lanClient.ts`** (new) — reads `?c=<code>` from the URL, opens the WSS
  connection, performs the `pair` handshake, exposes paired state + the score stream.
  Reconnect/backoff preserved from the existing `scoreClient`.
- **`scoreClient.ts`** — refactored to consume the paired socket from `lanClient` instead
  of a hardcoded `ws://localhost:8765`. When no `?c=` is present (local dev), it falls
  back to the direct localhost socket so the existing dev flow still works.
- **Pairing / connect scene** (new) — shown before Welcome when `?c=` is present:
  "Connecting to your session…" → on `paired`, advances to Welcome; on `error`, shows a
  friendly retry. When no code is present, the app boots straight to Welcome (dev mode).
- **Session identity** — the hardcoded `config.ts` `"Margaret"` identity is replaced by
  the identity delivered in the `paired` ack (closes a known V2-1 gap). `config.ts`
  retains a dev-mode default when unpaired.

---

## 6. Console integration (`clinician-console/renderer/`)

- **Pairing panel** (new renderer surface, the §10.3 "pairing panel"): a **Start
  Session** button, the rendered **QR** (`qrcode`) + the human-readable code, and a
  `patient connected ✓` indicator. Communicates with Electron main over the existing
  IPC channel (main owns `LanServer`).
- Camera-link health readout (§10.3) is **out of scope for S1** — it lands in S2/S3 once
  the WebRTC video path exists.

---

## 7. Dependencies

Add to `clinician-console`:
- `selfsigned` — self-signed cert generation (pure JS, tiny).
- `qrcode` — QR data-URL rendering for the pairing panel.

`ws` + `@types/ws` are already present. Node built-in `https`/`http`/`os` (LAN-IP
detection) cover the rest.

---

## 8. Testing (headless — no headset, no Electron)

- **Unit (Vitest):**
  - `SessionPairing`: code alphabet excludes confusables; single active session;
    single-claimant (second `bind` rejected); TTL expiry; `end` invalidates.
  - `scoreRelay`: only `intent_score` frames reach the patient; `eeg_quality` is
    dropped; reconnects on sidecar drop.
  - `signaling`: offer/answer/ICE relay echoes correctly through the stub.
  - `cert`: caches on first run, reuses on second, regenerates when expired.
  - `lanClient` (patient-web): parses `?c=`, performs handshake, surfaces `paired` /
    `error`; localhost fallback when no code.
- **Integration (Node, no Electron):** boot `LanServer` with a **fake sidecar WS**
  emitting canned `intent_score` frames → connect two mock patient sockets → assert:
  (a) first pairs, second rejected `session_taken`; (b) `intent_score` frames arrive at
  the paired socket, `eeg_quality` never does; (c) server bound to LAN IP not
  `0.0.0.0`; (d) wrong-`Origin` upgrade rejected; (e) expired code rejected.
- **Live smoke (manual):** `run_ws_server.py` (mock EEG) → `LanServer` → a real browser
  on a **second LAN device** loads patient-web over HTTPS (accept TOFU once), pairs, and
  renders the live score. Proves the transport spine end-to-end. **No new mock needed —
  the existing mock EEG stream is the score source.**

---

## 9. Security properties (§12.1)

- LAN-only bind (never public/routable interface).
- Single-use session code, single-claimant socket binding (reject second claimant).
- Short code TTL; invalidated on session end.
- Strict `Origin` allowlist on WS upgrades.
- **No PHI on the patient channel** — only game state + the 0–100 score outbound.
- Self-signed TLS gives the secure context `getUserMedia`/WebRTC will require in S2.

---

## 10. Out of scope for S1 (tracked for later)

- WebRTC **aiortc peer** + real video decode → MediaPipe (S2).
- Kinematic_Score fusion + EEG-only fallback (S2).
- Engine **control channel** (pause/rest/end/switch-mode) — S3.
- Camera-link **health** panel (S2/S3).
- **SQLite/FastAPI persistence** + real history/trends (S3).
- Local-CA cert provisioning + electron-builder installer (V2-4).
- Mock-EEG feature extensions (S3).
