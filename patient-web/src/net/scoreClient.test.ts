import { describe, it, expect, vi } from "vitest";
import { createScoreClient, type WsLike } from "./scoreClient";

function fakeSocket(): WsLike & { emitOpen(): void; emitMessage(d: string): void; emitClose(): void } {
  const s: any = { onopen: null, onclose: null, onmessage: null, onerror: null, close: vi.fn() };
  s.emitOpen = () => s.onopen?.({});
  s.emitMessage = (d: string) => s.onmessage?.({ data: d });
  s.emitClose = () => s.onclose?.({});
  return s;
}

const frame = (s: number) =>
  JSON.stringify({ type: "intent_score", intent_score: s, mode: "band_power_only", timestamp: 0 });

describe("createScoreClient", () => {
  it("delivers parsed frames and ignores junk", () => {
    const sock = fakeSocket();
    const frames: number[] = [];
    const states: string[] = [];
    const c = createScoreClient({
      url: "ws://x", createSocket: () => sock,
      onFrame: (f) => frames.push(f.intentScore),
      onState: (s) => states.push(s),
      scheduler: () => {},
    });
    c.connect();
    sock.emitOpen();
    sock.emitMessage(frame(42));
    sock.emitMessage("garbage");
    expect(frames).toEqual([42]);
    expect(states).toContain("open");
    expect(c.droppedCount()).toBe(1);
  });

  it("reconnects with backoff and stop() suppresses it", () => {
    let made = 0;
    const sockets: ReturnType<typeof fakeSocket>[] = [];
    const scheduled: Array<() => void> = [];
    const c = createScoreClient({
      url: "ws://x",
      createSocket: () => { made++; const s = fakeSocket(); sockets.push(s); return s; },
      onFrame: () => {},
      onState: () => {},
      scheduler: (fn) => { scheduled.push(fn); },
    });
    c.connect();
    expect(made).toBe(1);
    sockets[0].emitClose();           // drop → schedules a reconnect
    expect(scheduled.length).toBe(1);
    scheduled[0]();                    // run the scheduled reconnect
    expect(made).toBe(2);
    c.stop();
    sockets[1].emitClose();           // after stop, no new reconnect scheduled
    expect(scheduled.length).toBe(1);
  });
});
