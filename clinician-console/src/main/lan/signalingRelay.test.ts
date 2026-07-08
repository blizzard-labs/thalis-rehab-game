import { describe, it, expect, vi } from "vitest";
import { createSignalingRelay } from "./signalingRelay";
import type { RelaySocket } from "./scoreRelay";

function fakeSocket(): RelaySocket & { sent: string[] } {
  return {
    onmessage: null,
    onclose: null,
    onopen: null,
    sent: [],
    send(raw: string) {
      (this as any).sent.push(raw);
    },
    close() {
      this.onclose?.();
    },
  };
}

describe("signalingRelay", () => {
  it("forwards sidecar webrtc frames to the patient", () => {
    const sidecar = fakeSocket();
    const toPatient = vi.fn();
    const relay = createSignalingRelay({
      sidecarWsUrl: "ws://x",
      createSocket: () => sidecar,
      sendToPatient: toPatient,
    });
    relay.connect();

    sidecar.onmessage?.({ data: JSON.stringify({ type: "webrtc-answer", sdp: "A" }) });

    expect(toPatient).toHaveBeenCalledWith(JSON.stringify({ type: "webrtc-answer", sdp: "A" }));
  });

  it("ignores non-signaling sidecar frames (e.g. intent_score)", () => {
    const sidecar = fakeSocket();
    const toPatient = vi.fn();
    const relay = createSignalingRelay({
      sidecarWsUrl: "ws://x",
      createSocket: () => sidecar,
      sendToPatient: toPatient,
    });
    relay.connect();
    sidecar.onmessage?.({ data: JSON.stringify({ type: "intent_score", intent_score: 5 }) });
    expect(toPatient).not.toHaveBeenCalled();
  });

  it("forwards patient frames to the sidecar", () => {
    const sidecar = fakeSocket();
    const relay = createSignalingRelay({
      sidecarWsUrl: "ws://x",
      createSocket: () => sidecar,
      sendToPatient: vi.fn(),
    });
    relay.connect();
    sidecar.onopen?.(); // socket opens -> outbox drains

    relay.sendToSidecar(JSON.stringify({ type: "webrtc-offer", sdp: "O" }));

    expect(sidecar.sent).toContain(JSON.stringify({ type: "webrtc-offer", sdp: "O" }));
  });

  it("queues sends until the sidecar socket opens, then drains", () => {
    const sidecar = fakeSocket();
    const relay = createSignalingRelay({
      sidecarWsUrl: "ws://x",
      createSocket: () => sidecar,
      sendToPatient: vi.fn(),
    });
    relay.connect();

    relay.sendToSidecar(JSON.stringify({ type: "webrtc-offer", sdp: "O" }));
    expect(sidecar.sent).toEqual([]); // not open yet

    sidecar.onopen?.();
    expect(sidecar.sent).toContain(JSON.stringify({ type: "webrtc-offer", sdp: "O" }));
  });

  it("reconnects on close and stops cleanly", () => {
    const sockets: (RelaySocket & { sent: string[] })[] = [];
    const schedule = vi.fn((fn: () => void) => fn());
    const relay = createSignalingRelay({
      sidecarWsUrl: "ws://x",
      createSocket: () => {
        const s = fakeSocket();
        sockets.push(s);
        return s;
      },
      sendToPatient: vi.fn(),
      scheduler: schedule,
    });
    relay.connect();
    sockets[0].onclose?.();
    expect(sockets.length).toBe(2); // reconnected
    relay.stop();
    sockets[1].onclose?.();
    expect(sockets.length).toBe(2); // no reconnect after stop
  });
});
