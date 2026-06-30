/**
 * Warm-up hand pose library (ported subset of the archive collector's
 * HAND_POSES). Joint angles are normalized [0,1]: 0 = fully extended,
 * 1 = fully flexed. Only the three poses needed for the open/close warm-up
 * motion are included.
 *
 * Thumb joints: cmc (opposition), mcp (flexion), ip (flexion)
 * Index/pinky joints: mcp, pip, dip (all flexion)
 */

export type FingerJoints = { mcp: number; pip: number; dip: number };
export type ThumbJoints = { cmc: number; mcp: number; ip: number };
export type JointAngles = {
  thumb: ThumbJoints;
  index: FingerJoints;
  pinky: FingerJoints;
};
export type PoseName = "neutral" | "open" | "closedGrasp";

export const HAND_POSES: Record<PoseName, JointAngles> = {
  // Relaxed neutral — rest / non-cue phases.
  neutral: {
    thumb: { cmc: 0.1, mcp: 0.15, ip: 0.1 },
    index: { mcp: 0.15, pip: 0.15, dip: 0.1 },
    pinky: { mcp: 0.2, pip: 0.2, dip: 0.15 },
  },
  // All fingers fully extended — cue target / open extreme of the loop.
  open: {
    thumb: { cmc: 0.6, mcp: 0, ip: 0 },
    index: { mcp: 0, pip: 0, dip: 0 },
    pinky: { mcp: 0, pip: 0, dip: 0 },
  },
  // All fingers flexed — closed extreme of the imagine loop.
  closedGrasp: {
    thumb: { cmc: 0.7, mcp: 0.8, ip: 0.7 },
    index: { mcp: 0.85, pip: 0.9, dip: 0.8 },
    pinky: { mcp: 0.9, pip: 0.95, dip: 0.85 },
  },
};

export const getPose = (name: PoseName): JointAngles => HAND_POSES[name];
