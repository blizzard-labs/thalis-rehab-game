import { describe, it, expect, vi } from "vitest";
import { createCameraPublisher } from "./cameraPublisher";

function fakePeer() {
  return {
    localDescription: null as any,
    remote: null as any,
    added: [] as any[],
    tracks: [] as any[],
    onicecandidate: null as any,
    addTrack(t: any) {
      this.tracks.push(t);
    },
    async createOffer() {
      return { type: "offer", sdp: "OFFER" };
    },
    async setLocalDescription(d: any) {
      this.localDescription = d;
    },
    async setRemoteDescription(d: any) {
      this.remote = d;
    },
    async addIceCandidate(c: any) {
      this.added.push(c);
    },
    close: vi.fn(),
  };
}

function fakeStream() {
  const track = { stop: vi.fn(), kind: "video" };
  return { getTracks: () => [track], _track: track } as any;
}

describe("cameraPublisher", () => {
  it("offers after acquiring the stream", async () => {
    const peer = fakePeer();
    const stream = fakeStream();
    const send = vi.fn();
    const pub = createCameraPublisher({
      getStream: async () => stream,
      createPeer: () => peer as any,
      send,
    });

    await pub.start();

    expect(peer.tracks).toContain(stream._track);
    expect(peer.localDescription).toEqual({ type: "offer", sdp: "OFFER" });
    expect(send).toHaveBeenCalledWith({ type: "webrtc-offer", sdp: "OFFER" });
  });

  it("applies an inbound answer", async () => {
    const peer = fakePeer();
    const pub = createCameraPublisher({
      getStream: async () => fakeStream(),
      createPeer: () => peer as any,
      send: vi.fn(),
    });
    await pub.start();

    await pub.handleSignaling({ type: "webrtc-answer", sdp: "ANS" });

    expect(peer.remote).toEqual({ type: "answer", sdp: "ANS" });
  });

  it("adds inbound ice candidates and ignores null", async () => {
    const peer = fakePeer();
    const pub = createCameraPublisher({
      getStream: async () => fakeStream(),
      createPeer: () => peer as any,
      send: vi.fn(),
    });
    await pub.start();

    await pub.handleSignaling({ type: "webrtc-ice", candidate: { candidate: "c" } });
    await pub.handleSignaling({ type: "webrtc-ice", candidate: null });

    expect(peer.added).toEqual([{ candidate: "c" }]);
  });

  it("emits local ice candidates via send", async () => {
    const peer = fakePeer();
    const send = vi.fn();
    const pub = createCameraPublisher({
      getStream: async () => fakeStream(),
      createPeer: () => peer as any,
      send,
    });
    await pub.start();

    peer.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: "local" }) } });

    expect(send).toHaveBeenCalledWith({ type: "webrtc-ice", candidate: { candidate: "local" } });
  });

  it("stop() stops tracks and closes the peer", async () => {
    const peer = fakePeer();
    const stream = fakeStream();
    const pub = createCameraPublisher({
      getStream: async () => stream,
      createPeer: () => peer as any,
      send: vi.fn(),
    });
    await pub.start();
    pub.stop();

    expect(stream._track.stop).toHaveBeenCalled();
    expect(peer.close).toHaveBeenCalled();
  });
});

it("releases camera permission arriving after session end", async () => {
  let grant!: (s:MediaStream)=>void;
  const stream = fakeStream();
  const createPeer = vi.fn();
  const publisher = createCameraPublisher({getStream:()=>new Promise(res=>{grant=res;}),createPeer,send:vi.fn()});
  const start = publisher.start();
  publisher.stop();
  grant(stream); await start;
  expect(stream._track.stop).toHaveBeenCalledOnce();
  expect(createPeer).not.toHaveBeenCalled();
});
