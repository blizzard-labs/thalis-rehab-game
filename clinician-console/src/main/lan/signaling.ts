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
