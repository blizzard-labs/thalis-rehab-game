import { useEffect, useRef } from "react";
import type { ScoreStore } from "../scoring/scoreStore";
import type { EegQualityStore } from "../scoring/eegQualityStore";
import type { VisionHealthStore } from "../scoring/visionHealthStore";
import type { CameraFrameStore } from "../scoring/cameraFrameStore";
import type { ConnectionState } from "../net/scoreClient";
import type { SidecarState } from "../main/sidecar";
import type { Patient } from "../data/types";
import { LiveMonitor } from "./LiveMonitor";

type Props = {
  scoreStore: ScoreStore;
  qualityStore: EegQualityStore;
  visionHealthStore: VisionHealthStore;
  cameraFrameStore?: CameraFrameStore;
  connectionState: ConnectionState;
  sidecarState: SidecarState;
  patient: Patient;
  onBegin: () => void;
  onEndSession: () => void;
  onSwitchMode: (mode: "band_power_only" | "csp_lda_blend") => void;
};

// Step 4 — Live monitor. Arms the session (sim) exactly once on mount, then
// renders the hero monitor with its controls wired to the session lifecycle.
export function LiveStep(props: Props) {
  const armed = useRef(false);
  useEffect(() => {
    if (armed.current) return;
    armed.current = true;
    props.onBegin();
  }, [props]);

  return (
    <LiveMonitor
      store={props.scoreStore}
      qualityStore={props.qualityStore}
      visionHealthStore={props.visionHealthStore}
      cameraFrameStore={props.cameraFrameStore}
      connectionState={props.connectionState}
      sidecarState={props.sidecarState}
      patient={props.patient}
      onRest={async paused => {
        const host = (window as Window & {neuroreach?: {sendClinicianCheckpoint(c: string): Promise<void>}}).neuroreach;
        if (host) await host.sendClinicianCheckpoint(paused ? "pause" : "resume");
      }}
      onEndSession={props.onEndSession}
      onSwitchMode={props.onSwitchMode}
    />
  );
}
