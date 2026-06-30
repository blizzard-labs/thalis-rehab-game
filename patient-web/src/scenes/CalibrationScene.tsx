import { useEffect, useRef, useState } from "react";
import { WarmupHands } from "../warmup/WarmupHands";
import { CameraFeed } from "./CameraFeed";

type Phase = "fixation" | "cue" | "imagine" | "rest";
const DURATIONS: Record<Phase, () => number> = {
  fixation: () => 2000,
  cue: () => 1250,
  imagine: () => 4000,
  rest: () => 2000 + Math.random() * 1000, // 2–3 s
};
const ORDER: Phase[] = ["fixation", "cue", "imagine", "rest"];

/**
 * Cosmetic Graz cue sequencer (spec §6). NOT wired to the real
 * CalibrationOrchestrator / LSL marker stream — no marker channel reaches the
 * browser yet (see docs/superpowers/specs/2026-06-25-patient-web-prototype-design.md §5.2).
 * It demonstrates the paradigm only; real wiring lands with the LAN server.
 */
export function CalibrationScene({
  affectedSide,
  totalTrials = 20,
  onComplete,
}: {
  affectedSide: "left" | "right";
  totalTrials?: number;
  onComplete: () => void;
}) {
  const [trial, setTrial] = useState(1);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  // Clinician gate: the cue sequence (and recording) is held until the clinician
  // confirms pre-calibration setup — electrode contact, camera position, patient
  // profile — by pressing "I'm ready".
  const [ready, setReady] = useState(false);
  const done = useRef(false);
  const phase = ORDER[phaseIdx];

  useEffect(() => {
    if (done.current || paused || !ready) return;
    const t = setTimeout(() => {
      if (phaseIdx < ORDER.length - 1) {
        setPhaseIdx(phaseIdx + 1);
      } else if (trial < totalTrials) {
        setTrial(trial + 1);
        setPhaseIdx(0);
      } else {
        done.current = true;
        onComplete();
      }
    }, DURATIONS[phase]());
    return () => clearTimeout(t);
  }, [phase, phaseIdx, trial, totalTrials, onComplete, paused, ready]);

  // Motor-imagery window: the cue lead-in plus the imagine phase. The text box
  // turns green here to signal "imagine now".
  const isMI = phase === "cue" || phase === "imagine";
  const headline = isMI
    ? `Imagine closing your ${affectedSide} hand`
    : phase === "rest"
      ? "Rest"
      : "Get ready…";

  return (
    <main className="scene scene--calibration" data-testid="calibration" data-phase={phase}>
      {/* Pre-calibration gate: thin green bar centered on top. The clinician
          checks electrode contact, camera position, and patient profile, then
          presses it to start the cue sequence. It disappears once pressed. */}
      {!ready && (
        <button
          type="button"
          className="cal-ready-btn"
          onClick={() => setReady(true)}
          data-testid="ready-btn"
        >
          I’m ready
        </button>
      )}

      {/* Row: existing cue/hands stack on the left, camera sidecar on the right,
          vertically centered against the whole group. */}
      <div className="cal-stage">
        <div className="cal-main">
          <div className="cal-header">Warm-up · trial {trial} of {totalTrials}</div>

          {/* Fixed-size text box: always rendered so the layout never reflows
              between rest and MI. Grey by default, green during motor imagery. */}
          <div className="cal-textbox" data-mi={isMI}>
            <h1 className="cal-cue">{headline}</h1>
            {/* Reserve the caption line height even when empty to keep height stable. */}
            <p className="cal-sub">{isMI ? "feel the movement — don't actually move" : " "}</p>
          </div>

          <WarmupHands phase={phase} activeSide={affectedSide} />
        </div>

        <CameraFeed recording={ready} />
      </div>

      <div className="cal-controls">
        <button
          type="button"
          className="cal-ctl-btn"
          onClick={() => setPaused((p) => !p)}
          aria-pressed={paused}
        >
          {paused ? "Resume" : "Pause"}
        </button>
        {/* Dev-only: skip the cue block and jump straight to mode select. */}
        <button
          type="button"
          className="cal-ctl-btn cal-ctl-btn--skip"
          data-testid="skip-btn"
          onClick={() => { done.current = true; onComplete(); }}
        >
          Skip
        </button>
      </div>
    </main>
  );
}
