import { ShadowHand3D } from "./ShadowHand3D";
import { useWarmupPose } from "./useWarmupPose";
import { getPose } from "./handPoses";
import type { WarmupPhase } from "./warmupMotion";

const NEUTRAL = getPose("neutral");

/**
 * Renders a left and a right hand side by side for the warm-up. The affected
 * (active) side animates from the phase-driven pose; the other side holds a
 * dimmed neutral pose.
 */
export function WarmupHands({
  phase,
  activeSide,
}: {
  phase: WarmupPhase;
  activeSide: "left" | "right";
}) {
  const activePose = useWarmupPose(phase);

  const left =
    activeSide === "left" ? (
      <ShadowHand3D side="left" jointAngles={activePose} />
    ) : (
      <ShadowHand3D side="left" jointAngles={NEUTRAL} dimmed />
    );

  const right =
    activeSide === "right" ? (
      <ShadowHand3D side="right" jointAngles={activePose} />
    ) : (
      <ShadowHand3D side="right" jointAngles={NEUTRAL} dimmed />
    );

  return (
    <div className="warmup-hands" data-testid="warmup-hands" data-active-side={activeSide}>
      <div className="warmup-hand" data-side="left" data-active={activeSide === "left"}>
        {left}
      </div>
      <div className="warmup-hand" data-side="right" data-active={activeSide === "right"}>
        {right}
      </div>
    </div>
  );
}

export default WarmupHands;
