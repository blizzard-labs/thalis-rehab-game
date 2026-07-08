import type { VisionHealthStore } from "../scoring/visionHealthStore";
import type { ScoreStore } from "../scoring/scoreStore";
import { useVisionHealthStore } from "./useVisionHealthStore";
import { useScoreStore } from "./useScoreStore";

type Props = {
  visionHealthStore: VisionHealthStore;
  scoreStore: ScoreStore;
};

// C3 sub-panel — camera-link health (V2-2c). Connection state + frame rate, a
// "vision degraded → EEG-only" banner, a kinematic-score readout, and a
// compensation cue mirror. Absent frame = no camera link (EEG-only session).
export function VisionHealthPanel({ visionHealthStore, scoreStore }: Props) {
  const vh = useVisionHealthStore(visionHealthStore).latest;
  const latest = useScoreStore(scoreStore).latest;

  return (
    <div className="vh-panel" data-testid="vision-health-panel">
      <span className="vh-title">CAMERA LINK</span>
      {vh === null ? (
        <span className="vh-nolink">no camera link</span>
      ) : (
        <>
          <span className="vh-conn" data-state={vh.connection}>
            ● {vh.connection} · {vh.fps.toFixed(1)} fps
          </span>
          {vh.degraded && (
            <span className="vh-degraded" data-testid="vision-degraded-banner">
              vision degraded — EEG-only
            </span>
          )}
        </>
      )}
      <span className="vh-kin">
        KINEMATIC {latest && latest.kinematicScore !== null ? latest.kinematicScore.toFixed(0) : "—"}
      </span>
      {latest?.compensationFlag && (
        <span className="vh-comp" data-testid="compensation-indicator">
          ⚠ trunk compensation
        </span>
      )}
    </div>
  );
}
