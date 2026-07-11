import { useEffect, useRef, useState } from "react";
import type { ScoreStore } from "../scoring/scoreStore";

/**
 * V2-2c patient render of the vision fields on the score frame.
 *  - Trunk-lean indicator: a non-punitive reminder to keep the trunk still,
 *    debounced with hysteresis so it never flickers frame-to-frame. Rendered
 *    as a bottom-right badge (next to the tracking-arm badge).
 * Never blocks play; the penalty is already applied upstream in intent_score.
 */
type Props = {
  store: ScoreStore;
  showAfterMs?: number;
  hideAfterMs?: number;
  pollMs?: number;
};

export function KinematicOverlay({ store, showAfterMs = 400, hideAfterMs = 600, pollMs = 100 }: Props) {
  const [showComp, setShowComp] = useState(false);
  const flaggedSince = useRef<number | null>(null);
  const clearedSince = useRef<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      const latest = store.latest();
      const now = Date.now();

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

  if (!showComp) return null;
  return (
    <span className="trunklean-badge" data-testid="compensation-cue" aria-live="polite">
      ⚠ Trunk lean — reach with your arm
    </span>
  );
}

export default KinematicOverlay;
