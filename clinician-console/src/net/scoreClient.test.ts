import { describe, it, expect, vi } from "vitest";
import { createScoreClient, type WsLike } from "./scoreClient";

function makeFakeSocket(): WsLike & { emitOpen: () => void; emitMessage: (d: string) => void; emitClose: () => void } {
  const s: any = { onopen: null, onclose: null, onmessage: null, onerror: null, close: vi.fn() };
  s.emitOpen = () => s.onopen?.({});
  s.emitMessage = (d: string) => s.onmessage?.({ data: d });
  s.emitClose = () => s.onclose?.({});
  return s;
}

const validFrame = JSON.stringify({
  type: "intent_score", intent_score: 42, erd_score: 10,
  classifier_score: null, is_artifact: false, mode: "band_power_only", timestamp: 1,
});

describe("createScoreClient", () => {
  it("reports open and forwards parsed frames", () => {
    const sock = makeFakeSocket();
    const onFrame = vi.fn();
    const onState = vi.fn();
    const c = createScoreClient({ url: "ws://x", createSocket: () => sock, onFrame, onState });
    c.connect();
    expect(onState).toHaveBeenCalledWith("connecting");
    sock.emitOpen();
    expect(onState).toHaveBeenCalledWith("open");
    sock.emitMessage(validFrame);
    expect(onFrame).toHaveBeenCalledWith(expect.objectContaining({ intentScore: 42 }));
  });

  it("routes eeg_quality frames to onQuality, not onFrame", () => {
    const sock = makeFakeSocket();
    const onFrame = vi.fn();
    const onQuality = vi.fn();
    const c = createScoreClient({ url: "ws://x", createSocket: () => sock, onFrame, onQuality, onState: vi.fn() });
    c.connect();
    sock.emitOpen();
    sock.emitMessage(
      JSON.stringify({ type: "eeg_quality", fs: 250, channels: [{ label: "C3", quality: "good", p2p: 5 }], trace: { C3: [1] }, timestamp: 2 }),
    );
    expect(onQuality).toHaveBeenCalledWith(expect.objectContaining({ fs: 250 }));
    expect(onFrame).not.toHaveBeenCalled();
  });

  it("counts malformed frames without crashing", () => {
    const sock = makeFakeSocket();
    const c = createScoreClient({ url: "ws://x", createSocket: () => sock, onFrame: vi.fn(), onState: vi.fn() });
    c.connect();
    sock.emitOpen();
    sock.emitMessage("{bad");
    expect(c.droppedCount()).toBe(1);
  });

  it("reconnects with backoff on close", () => {
    const sockets: ReturnType<typeof makeFakeSocket>[] = [];
    const create = () => { const s = makeFakeSocket(); sockets.push(s); return s; };
    const onState = vi.fn();
    const scheduled: Array<{ fn: () => void; ms: number }> = [];
    const scheduler = (fn: () => void, ms: number) => { scheduled.push({ fn, ms }); };
    const c = createScoreClient({ url: "ws://x", createSocket: create, onFrame: vi.fn(), onState, scheduler, backoffBaseMs: 100 });
    c.connect();
    sockets[0].emitOpen();
    sockets[0].emitClose();
    expect(onState).toHaveBeenCalledWith("reconnecting");
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].ms).toBe(100);
    scheduled[0].fn(); // fire the reconnect
    expect(sockets).toHaveLength(2);
  });

  it("stop() prevents reconnect and closes socket", () => {
    const sock = makeFakeSocket();
    const onState = vi.fn();
    const scheduled: Array<() => void> = [];
    const c = createScoreClient({ url: "ws://x", createSocket: () => sock, onFrame: vi.fn(), onState, scheduler: (fn) => scheduled.push(fn) });
    c.connect();
    sock.emitOpen();
    c.stop();
    expect(sock.close).toHaveBeenCalled();
    sock.emitClose();
    expect(scheduled).toHaveLength(0);
    expect(onState).toHaveBeenLastCalledWith("closed");
  });
});
