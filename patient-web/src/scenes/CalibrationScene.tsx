import { useEffect, useRef, useState } from "react";

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
  const done = useRef(false);
  const phase = ORDER[phaseIdx];

  useEffect(() => {
    if (done.current) return;
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
  }, [phase, phaseIdx, trial, totalTrials, onComplete]);

  const showCue = phase === "cue" || phase === "imagine";
  return (
    <main className="scene scene--calibration" data-testid="calibration" data-phase={phase}>
      <div className="cal-header">Warm-up · trial {trial} of {totalTrials}</div>
      <div className={`hand-glyph hand-glyph--${phase}`} aria-hidden="true" />
      {showCue ? (
        <>
          <h1 className="cal-cue">Imagine opening your {affectedSide} hand</h1>
          <p className="cal-sub">feel the movement — don't actually move</p>
        </>
      ) : (
        <h1 className="cal-cue cal-cue--rest">{phase === "rest" ? "Rest" : "Get ready…"}</h1>
      )}
    </main>
  );
}
