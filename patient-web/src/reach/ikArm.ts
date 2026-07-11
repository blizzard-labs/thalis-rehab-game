type Pt = { x: number; y: number };

/**
 * Two-bone inverse kinematics. Given a shoulder and a target wrist point, place
 * the elbow so the forearm tip reaches the target (clamped to upper+fore length).
 * `bendSign` (+1/−1) selects which side the elbow bows to.
 */
export function ikArm(opts: {
  shoulder: Pt; target: Pt; upperLen: number; foreLen: number; bendSign: number;
}): { elbow: Pt; wrist: Pt } {
  const { shoulder, target, upperLen: l1, foreLen: l2, bendSign } = opts;
  const dxr = target.x - shoulder.x, dyr = target.y - shoulder.y;
  const raw = Math.hypot(dxr, dyr);
  // cosA is clamped below, so the exact full-reach boundary (d = l1+l2) is safe.
  const min = Math.abs(l1 - l2) + 1e-3, max = l1 + l2;
  const d = Math.max(min, Math.min(max, raw));
  const ux = raw < 1e-9 ? 0 : dxr / raw, uy = raw < 1e-9 ? 1 : dyr / raw;
  const wrist = { x: shoulder.x + ux * d, y: shoulder.y + uy * d };
  // Angle at the shoulder between the upper arm and the shoulder→wrist line.
  const cosA = Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
  const a = Math.acos(cosA);
  const base = Math.atan2(uy, ux);
  const th = base + bendSign * a;
  const elbow = { x: shoulder.x + Math.cos(th) * l1, y: shoulder.y + Math.sin(th) * l1 };
  return { elbow, wrist };
}
