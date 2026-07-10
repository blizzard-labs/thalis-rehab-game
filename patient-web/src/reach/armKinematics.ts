type Pt = { x: number; y: number };

/**
 * Two-bone forward kinematics for the avatar arm. Maps measured joint angles to
 * elbow/wrist SVG points so the on-screen arm mirrors the patient's real pose.
 * SVG convention: +Y points DOWN, so an arm hanging down is +Y.
 */
export function fkArm(opts: {
  shoulder: Pt;
  shoulderElevationDeg: number; // 0 = arm down, 90 = arm horizontal
  elbowDeg: number;             // interior elbow angle, 180 = straight
  upperLen: number;
  foreLen: number;
  mirror: boolean;              // flip X for the affected side
}): { elbow: Pt; wrist: Pt } {
  const dir = opts.mirror ? -1 : 1;
  // Upper-arm direction: rotate the downward axis (+Y) up toward horizontal.
  const elev = (opts.shoulderElevationDeg * Math.PI) / 180;
  const ux = dir * Math.sin(elev);
  const uy = Math.cos(elev);
  const elbow = { x: opts.shoulder.x + ux * opts.upperLen, y: opts.shoulder.y + uy * opts.upperLen };

  // Forearm: bend from the upper-arm direction by (180 - elbowDeg).
  const bend = (((180 - opts.elbowDeg) * Math.PI) / 180) * dir;
  const ca = Math.cos(bend), sa = Math.sin(bend);
  const fx = ux * ca - uy * sa;
  const fy = ux * sa + uy * ca;
  const wrist = { x: elbow.x + fx * opts.foreLen, y: elbow.y + fy * opts.foreLen };
  return { elbow, wrist };
}
