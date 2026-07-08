import { useEffect, useRef, useState } from "react";
import type { ScoreStore } from "../scoring/scoreStore";

/**
 * V2-2c patient render of the vision fields on the score frame.
 *  - P4 "movement verified": shown whenever kinematicScore is present (vision
 *    is contributing to the fused score that grows the plant/reach).
 *  - P5 compensation cue: a non-punitive reminder to keep the trunk still,
 *    debounced with hysteresis so it never flickers frame-to-frame.
 * Never blocks play; the penalty is already applied upstream in intent_score.
 */
type Props = {
  store: ScoreStore;
  showAfterMs?: number;
  hideAfterMs?: number;
  pollMs?: number;
};

export function KinematicOverlay({ store, showAfterMs = 400, hideAfterMs = 600, pollMs = 100 }: Props) {
  const [verified, setVerified] = useState(false);
  const [showComp, setShowComp] = useState(false);
  const flaggedSince = useRef<number | null>(null);
  const clearedSince = useRef<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      const latest = store.latest();
      const now = Date.now();
      setVerified(latest != null && latest.kinematicScore !== null);

      const flagged = Boolean(latest?.compensationFlag);
      if (flagged) {
        clearedSince.current = null;
        if (flaggedSince.current === null) flaggedSince.current = now;
        if (now - flaggedSince.current >= showAfterMs) setShowComp(true);
      } else {
        flaggedSince.current = null;
        if (clearedSince.current === null) clearedSince.current = now;
        if (now - clearedSince.current >= hideAfterMs) setShowComp(false);
      }
    }, pollMs);
    return () => clearInterval(id);
  }, [store, showAfterMs, hideAfterMs, pollMs]);

  return (
    <div className="kin-overlay" aria-live="polite">
      {verified && (
        <span className="kin-verified" data-testid="verified-badge">✓ movement verified</span>
      )}
      {showComp && (
        <span className="kin-comp" data-testid="compensation-cue">
          Keep your trunk still — reach with your arm
        </span>
      )}
    </div>
  );
}

export default KinematicOverlay;
