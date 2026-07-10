import { describe, it, expect, vi } from "vitest";
import { createScoreRelay, type RelaySocket } from "./scoreRelay";

function fakeSocket(): RelaySocket & { emit: (data: string) => void } {
  const s: any = { onmessage: null, onclose: null, onopen: null, close: vi.fn() };
  s.emit = (data: string) => s.onmessage?.({ data });
  return s;
}

describe("createScoreRelay", () => {
  it("forwards intent_score frames verbatim and drops clinician-only frames", () => {
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
    // vision_health is clinician-only and must never reach the patient (V2-2c).
    sock.emit(JSON.stringify({ type: "vision_health", connection: "connected" }));
    sock.emit("not json");
    expect(sent).toEqual([scoreFrame]);
  });

  it("forwards rom_targets frames to the patient", () => {
    const sock = fakeSocket();
    const sent: string[] = [];
    const relay = createScoreRelay({
      sidecarWsUrl: "ws://x",
      createSocket: () => sock,
      send: (raw) => sent.push(raw),
    });
    relay.connect();
    const romFrame = JSON.stringify({ type: "rom_targets", targets: {} });
    sock.emit(romFrame);
    expect(sent).toEqual([romFrame]);
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
