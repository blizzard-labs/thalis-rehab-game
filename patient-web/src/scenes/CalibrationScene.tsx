import { useEffect, useRef, useState } from "react";
import { WarmupHands } from "../warmup/WarmupHands";
import { CameraFeed } from "./CameraFeed";

type Phase = "fixation" | "cue" | "imagine" | "rest";
const DURATIONS: Record<Phase, () => number> = {
  fixation: () => 2000,
  cue: () => 1250,
  imagine: () => 4000,
  rest: () => 2000 + Math.random() * 1000, // 2–3 s randomized ITI
};
const ORDER: Phase[] = ["fixation", "cue", "imagine", "rest"];

const otherSide = (s: "left" | "right"): "left" | "right" =>
  s === "left" ? "right" : "left";

/**
 * Cosmetic Graz calibration sequencer (spec §6). NOT wired to the real
 * CalibrationOrchestrator / LSL marker stream — no marker channel reaches the
 * browser yet (see docs/superpowers/specs/2026-06-25-patient-web-prototype-design.md §5.2).
 * It renders the paradigm only; real marker wiring lands with the LAN server.
 *
 * Block structure (spec §6):
 *   1. Baseline rest — a single `baselineMs` (60 s default) eyes-open fixation
 *      capture for the resting spectral baseline, once, before any cued trial.
 *   2. Cued trials — a 2-class block (affected vs unaffected hand). Each trial is
 *      2 s fixation → 1.25 s cue → 4 s kinesthetic imagery → 2–3 s ITI rest, and
 *      the cued side alternates affected → unaffected every trial. `totalTrials`
 *      is the count PER CLASS, so the block runs `totalTrials × 2` cued trials.
 */
export function CalibrationScene({
  affectedSide,
  totalTrials = 20,
  baselineMs = 60000,
  onComplete,
  onReady,
}: {
  affectedSide: "left" | "right";
  /** Cued trials PER CLASS (spec §6 step 2: ≈20 per class). */
  totalTrials?: number;
  /** Baseline eyes-open rest window (spec §6 step 1: 60 s). */
  baselineMs?: number;
  onComplete: () => void;
  /** Fired when the patient presses "I'm ready" — starts rest-pose + baseline calibration. */
  onReady?: () => void;
}) {
  // Two classes (affected / unaffected) interleaved across the block.
  const total = totalTrials * 2;

  const [inBaseline, setInBaseline] = useState(true);
  const [trial, setTrial] = useState(1);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  // Clinician gate: baseline + cue sequence (and recording) are held until the
  // clinician confirms pre-calibration setup — electrode contact, camera
  // position, patient profile — by pressing "I'm ready".
  const [ready, setReady] = useState(false);
  // Framing gate (merged from the old FramingCheckScene): the clinician must
  // make a framing choice — "I'm in frame" (camera heuristic passed) or "Skip
  // (no camera)" (EEG-only fallback) — before the "I'm ready" gate unlocks.
  const [framed, setFramed] = useState(false);
  const [framingReady, setFramingReady] = useState(false);
  const done = useRef(false);
  const phase = ORDER[phaseIdx];

  // Step 1: a single baseline-rest window before the first cued trial. Gated on
  // `ready` so the 60 s of "resting" EEG is only captured once the clinician has
  // confirmed the montage — matching the signal-engine's clean-rest baseline pull.
  useEffect(() => {
    if (done.current || paused || !ready || !inBaseline) return;
    const t = setTimeout(() => setInBaseline(false), baselineMs);
    return () => clearTimeout(t);
  }, [ready, paused, inBaseline, baselineMs]);

  // Step 2: cued-trial phase sequencer, runs once the baseline completes.
  useEffect(() => {
    if (done.current || paused || !ready || inBaseline) return;
    const t = setTimeout(() => {
      if (phaseIdx < ORDER.length - 1) {
        setPhaseIdx(phaseIdx + 1);
      } else if (trial < total) {
        setTrial(trial + 1);
        setPhaseIdx(0);
      } else {
        done.current = true;
        onComplete();
      }
    }, DURATIONS[phase]());
    return () => clearTimeout(t);
  }, [phase, phaseIdx, trial, total, onComplete, paused, ready, inBaseline]);

  // 2-class block: the cued side alternates affected (odd trials) → unaffected
  // (even trials) so both hemispheres are sampled for CSP/LDA training.
  const cuedSide = trial % 2 === 1 ? affectedSide : otherSide(affectedSide);

  // Motor-imagery window: the cue lead-in plus the imagine phase. The text box
  // turns green here to signal "imagine now". Never during the baseline rest.
  const isMI = !inBaseline && (phase === "cue" || phase === "imagine");
  const dataPhase = inBaseline ? "baseline" : phase;

  const headline = inBaseline
    ? "Relax — eyes open, stay still"
    : isMI
      ? `Imagine closing your ${cuedSide} hand`
      : phase === "rest"
        ? "Rest"
        : "Get ready…";
  const subline = inBaseline
    ? "Recording your resting baseline"
    : isMI
      ? "feel the movement — don't actually move"
      : " ";

  return (
    <main className="scene scene--calibration" data-testid="calibration" data-phase={dataPhase}>
      {/* Pre-calibration gate: thin green bar centered on top. The clinician
          checks electrode contact, camera position, and patient profile, then
          presses it to start baseline + the cue sequence. It disappears once pressed. */}
      {!ready && (
        <button
          type="button"
          className="cal-ready-btn"
          onClick={() => { setReady(true); onReady?.(); }}
          disabled={!framed}
          data-testid="ready-btn"
        >
          I’m ready
        </button>
      )}

      {/* Row: existing cue/hands stack on the left, camera sidecar on the right,
          vertically centered against the whole group. */}
      <div className="cal-stage">
        <div className="cal-main">
          <div className="cal-header">
            {inBaseline ? "Baseline rest" : `Calibration · trial ${trial} of ${total}`}
          </div>

          {/* Fixed-size text box: always rendered so the layout never reflows
              between rest and MI. Grey by default, green during motor imagery. */}
          <div className="cal-textbox" data-mi={isMI}>
            <h1 className="cal-cue">{headline}</h1>
            {/* Reserve the caption line height even when empty to keep height stable. */}
            <p className="cal-sub">{subline}</p>
          </div>

          <WarmupHands
            phase={inBaseline ? "rest" : phase}
            activeSide={inBaseline ? affectedSide : cuedSide}
          />
        </div>

        {/* Camera sidecar + framing choice. Buttons carry the old
            FramingCheckScene logic: skip always advances (EEG-only), in-frame
            unlocks only once the camera heuristic passes. Either choice arms
            the "I'm ready" gate above. Hidden once framed so it does not
            distract during the block. */}
        <div className="cal-cam-col">
          <CameraFeed
            recording={ready}
            framing={!framed}
            onFramingReady={setFramingReady}
          />
          {!framed && (
            <div className="cal-framing-actions">
              <button
                type="button"
                className="cal-ctl-btn cal-ctl-btn--skip"
                data-testid="framing-skip"
                onClick={() => setFramed(true)}
              >
                Skip (no camera)
              </button>
              <button
                type="button"
                className="cal-ctl-btn"
                data-testid="framing-confirm"
                disabled={!framingReady}
                onClick={() => setFramed(true)}
              >
                I'm in frame ▶
              </button>
            </div>
          )}
        </div>
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
        {/* Dev-only: skip the block and jump straight to mode select. */}
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
