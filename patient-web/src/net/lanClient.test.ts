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
