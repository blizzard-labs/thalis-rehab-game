import type { FingerJoints, JointAngles, ThumbJoints } from "./handPoses";

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Minimum-jerk easing: smooth S-curve with zero velocity/acceleration at the
 * endpoints. Formula: 10t³ − 15t⁴ + 6t⁵.
 */
export const minimumJerk = (t: number): number => {
  const t3 = t * t * t;
  const t4 = t3 * t;
  const t5 = t4 * t;
  return 10 * t3 - 15 * t4 + 6 * t5;
};

const lerpJoints = <T extends FingerJoints | ThumbJoints>(
  a: T,
  b: T,
  t: number,
): T => {
  const out = {} as Record<string, number>;
  for (const joint of Object.keys(a) as (keyof T)[]) {
    out[joint as string] = lerp(a[joint] as number, b[joint] as number, t);
  }
  return out as unknown as T;
};

/**
 * Interpolate between two hand poses, applying minimum-jerk easing to `t`.
 */
export const interpolatePoses = (
  a: JointAngles,
  b: JointAngles,
  t: number,
): JointAngles => {
  const e = minimumJerk(t);
  return {
    thumb: lerpJoints(a.thumb, b.thumb, e),
    index: lerpJoints(a.index, b.index, e),
    pinky: lerpJoints(a.pinky, b.pinky, e),
  };
};
