import { useEffect, useRef, useState } from "react";
import type { JointAngles } from "./handPoses";
import { poseForPhase, type WarmupPhase } from "./warmupMotion";

/**
 * Drives the warm-up hand pose from the current calibration phase via a
 * requestAnimationFrame loop. Phase timing is owned by the caller
 * (CalibrationScene); this hook only tracks elapsed time within the active
 * phase and maps it to an interpolated pose.
 */
export function useWarmupPose(phase: WarmupPhase): JointAngles {
  const [pose, setPose] = useState<JointAngles>(() => poseForPhase(phase, 0));
  const startRef = useRef(0);

  useEffect(() => {
    startRef.current = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      setPose(poseForPhase(phase, t - startRef.current));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  return pose;
}
