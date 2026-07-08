export type SignalingMessage =
  | { type: "webrtc-offer"; sdp: string }
  | { type: "webrtc-answer"; sdp: string }
  | { type: "webrtc-ice"; candidate: unknown };

const SIGNALING_TYPES = new Set(["webrtc-offer", "webrtc-answer", "webrtc-ice"]);

export function isSignalingMessage(msg: { type?: string }): msg is SignalingMessage {
  return !!msg && typeof msg.type === "string" && SIGNALING_TYPES.has(msg.type);
}
