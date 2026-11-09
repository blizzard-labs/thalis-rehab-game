import type { SignalingMessage } from "./signaling";

export type CameraPublisherDeps = {
  releaseStream?: (stream: MediaStream) => void;
  getStream: () => Promise<MediaStream>;
  createPeer: () => RTCPeerConnection;
  send: (msg: SignalingMessage) => void;
};

/**
 * Publishes the patient camera to the sidecar's aiortc receiver. Patient is the
 * offerer/send-only peer; SDP + trickled ICE go out via `send` (over the paired
 * LAN socket), and the sidecar's answer/ICE come back through `handleSignaling`.
 * getUserMedia and RTCPeerConnection are injected so jsdom tests use fakes.
 */
export function createCameraPublisher(deps: CameraPublisherDeps) {
  let pc: RTCPeerConnection | null = null;
  let stream: MediaStream | null = null;

  let stopped = false;
  const release = deps.releaseStream ?? ((s: MediaStream) => s.getTracks().forEach(t => t.stop()));

  return {
    async start(): Promise<void> {
      const acquired = await deps.getStream();
      if (stopped) { release(acquired); return; }
      stream = acquired;
      const peer = deps.createPeer();
      pc = peer;
      stream.getTracks().forEach((t) => peer.addTrack(t, stream as MediaStream));
      peer.onicecandidate = (e) => {
        if (e.candidate) deps.send({ type: "webrtc-ice", candidate: e.candidate.toJSON() });
      };
      const offer = await peer.createOffer();
      if (stopped) return;
      await peer.setLocalDescription(offer);
      if (stopped) return;
      deps.send({ type: "webrtc-offer", sdp: offer.sdp as string });
    },

    async handleSignaling(msg: SignalingMessage): Promise<void> {
      if (!pc) return;
      if (msg.type === "webrtc-answer") {
        await pc.setRemoteDescription({ type: "answer", sdp: msg.sdp } as RTCSessionDescriptionInit);
      } else if (msg.type === "webrtc-ice" && msg.candidate) {
        await pc.addIceCandidate(msg.candidate as RTCIceCandidateInit);
      }
    },

    stop(): void {
      stopped = true;
      if (stream) release(stream);
      pc?.close();
      pc = null;
      stream = null;
    },
  };
}
