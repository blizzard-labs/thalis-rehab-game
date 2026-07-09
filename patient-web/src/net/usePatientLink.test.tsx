import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { usePatientLink } from "./usePatientLink";
import type { WsLike } from "./scoreClient";

function fakeSocket() {
  const s: any = { onopen: null, onclose: null, onmessage: null, onerror: null, send: vi.fn(), close: vi.fn() };
  s.emitOpen = () => s.onopen?.({});
  s.emit = (o: unknown) => s.onmessage?.({ data: JSON.stringify(o) });
  return s as WsLike & { emitOpen(): void; emit(o: unknown): void; send: ReturnType<typeof vi.fn> };
}

const scoreFrame = (v: number) => ({ type: "intent_score", intent_score: v, mode: "band_power_only", timestamp: 0 });

describe("usePatientLink", () => {
  it("remote: dials the LAN url, pairs with the code, and streams scores into one store", async () => {
    const sock = fakeSocket();
    let dialed: string | null = null;
    const { result } = renderHook(() =>
      usePatientLink("ABC234", "wss://clinic:8443", (url) => { dialed = url; return sock; }),
    );

    expect(dialed).toBe("wss://clinic:8443"); // NOT localhost
    act(() => sock.emitOpen());
    expect(sock.send).toHaveBeenCalledWith(JSON.stringify({ type: "pair", code: "ABC234" }));

    act(() => sock.emit({ type: "paired", session: { patientFirstName: "Jordan", affectedSide: "right", mode: "band_power_only" } }));
    await waitFor(() => expect(result.current.conn).toBe("open"));
    expect(result.current.session?.patientFirstName).toBe("Jordan");

    act(() => { sock.emit(scoreFrame(72)); sock.emit(scoreFrame(80)); });
    expect(result.current.store.size()).toBe(2);
    expect(result.current.store.latest()?.intentScore).toBe(80);
  });

  it("local (no code): dials the localhost sidecar and streams without a pairing handshake", async () => {
    const sock = fakeSocket();
    let dialed: string | null = null;
    const { result } = renderHook(() =>
      usePatientLink(null, "wss://clinic:8443", (url) => { dialed = url; return sock; }),
    );

    expect(dialed).toBe("ws://localhost:8765");
    act(() => sock.emitOpen());
    expect(sock.send).not.toHaveBeenCalled(); // no pair frame in dev
    await waitFor(() => expect(result.current.conn).toBe("open"));

    act(() => sock.emit(scoreFrame(55)));
    expect(result.current.store.latest()?.intentScore).toBe(55);
  });

  it("surfaces a pairing rejection as an error", async () => {
    const sock = fakeSocket();
    const { result } = renderHook(() => usePatientLink("BADCOD", "wss://clinic:8443", () => sock));
    act(() => sock.emitOpen());
    act(() => sock.emit({ type: "error", reason: "bad_code" }));
    await waitFor(() => expect(result.current.error).toBe("bad_code"));
  });

  it("routes inbound webrtc frames to a signaling subscriber", async () => {
    const sock = fakeSocket();
    const { result } = renderHook(() => usePatientLink("ABC234", "wss://clinic:8443", () => sock));
    act(() => sock.emitOpen());

    const received: unknown[] = [];
    act(() => result.current.subscribeSignaling((m) => received.push(m)));
    act(() => sock.emit({ type: "webrtc-answer", sdp: "A" }));

    expect(received).toEqual([{ type: "webrtc-answer", sdp: "A" }]);
  });

  it("sendSignaling writes to the paired socket", async () => {
    const sock = fakeSocket();
    const { result } = renderHook(() => usePatientLink("ABC234", "wss://clinic:8443", () => sock));
    act(() => sock.emitOpen());

    act(() => result.current.sendSignaling({ type: "webrtc-offer", sdp: "O" }));

    expect(sock.send).toHaveBeenCalledWith(JSON.stringify({ type: "webrtc-offer", sdp: "O" }));
  });

  it("keeps sendSignaling / subscribeSignaling identity stable across re-renders", () => {
    // Consumers (useCameraPublish) depend on these in a useEffect dep array. If
    // their identity changed each render, the effect would tear down and restart
    // the WebRTC publisher on every parent re-render — destroying the live camera
    // link. They must be memoized.
    const sock = fakeSocket();
    const { result, rerender } = renderHook(() =>
      usePatientLink("ABC234", "wss://clinic:8443", () => sock),
    );
    const send1 = result.current.sendSignaling;
    const sub1 = result.current.subscribeSignaling;
    rerender();
    rerender();
    expect(result.current.sendSignaling).toBe(send1);
    expect(result.current.subscribeSignaling).toBe(sub1);
  });
});
