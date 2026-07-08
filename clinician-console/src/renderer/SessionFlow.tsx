import { useState } from "react";
import type { ScoreStore } from "../scoring/scoreStore";
import type { EegQualityStore } from "../scoring/eegQualityStore";
import type { VisionHealthStore } from "../scoring/visionHealthStore";
import type { ConnectionState } from "../net/scoreClient";
import type { SidecarState } from "../main/sidecar";
import type { Patient } from "../data/types";
import { useSession } from "./useSession";
import { SignalCheckStep } from "./SignalCheckStep";
import { PairDeviceStep } from "./PairDeviceStep";
import { CalibrateStep } from "./CalibrateStep";
import { LiveStep } from "./LiveStep";

type Step = "signal" | "pair" | "calibrate" | "live";
const ORDER: Step[] = ["signal", "pair", "calibrate", "live"];
const LABELS: Record<Step, string> = {
  signal: "Signal", pair: "Pair", calibrate: "Calibrate", live: "Live",
};

type Props = {
  patient: Patient;
  scoreStore: ScoreStore;
  qualityStore: EegQualityStore;
  visionHealthStore: VisionHealthStore;
  connectionState: ConnectionState;
  sidecarState: SidecarState;
  onExit: () => void;
};

export function SessionFlow(props: Props) {
  const { patient, onExit } = props;
  const s = useSession();
  const [step, setStep] = useState<Step>("signal");
  const go = (next: Step) => setStep(next);

  async function endSession() {
    await s.end();
    onExit();
  }

  return (
    <>
      <div className="ws-header">
        <button className="link-btn" onClick={onExit}>← Workspace</button>
        <div className="ws-bio">{patient.name} · Session</div>
        <span className="spacer" style={{ flex: 1 }} />
        <ol className="stepper">
          {ORDER.map((k) => (
            <li key={k} className={`stepper-item ${k === step ? "active" : ""}`}>{LABELS[k]}</li>
          ))}
        </ol>
      </div>

      {step === "signal" && (
        <SignalCheckStep
          qualityStore={props.qualityStore}
          patient={patient}
          source={s.source}
          onSourceChange={s.setSource}
          onNext={() => go("pair")}
          onBack={onExit}
        />
      )}
      {step === "pair" && (
        <PairDeviceStep
          code={s.code}
          url={s.url}
          connected={s.connected}
          bridgeReady={s.bridgeReady}
          onOpen={() => s.open({
            patientFirstName: patient.name.split(" ")[0],
            affectedSide: patient.affectedSide.toLowerCase() as "left" | "right",
            mode: patient.mode,
          })}
          onNext={() => go("calibrate")}
          onBack={() => go("signal")}
        />
      )}
      {step === "calibrate" && (
        <CalibrateStep
          onNext={() => go("live")}
          onBack={() => go("pair")}
          onFusionMode={s.setFusionMode}
          onAffectedSide={s.setAffectedSide}
          onCalibratePose={s.calibratePose}
          defaultSide={patient.affectedSide.toLowerCase() as "left" | "right"}
        />
      )}
      {step === "live" && (
        <LiveStep
          scoreStore={props.scoreStore}
          qualityStore={props.qualityStore}
          visionHealthStore={props.visionHealthStore}
          connectionState={props.connectionState}
          sidecarState={props.sidecarState}
          patient={patient}
          onBegin={s.begin}
          onEndSession={endSession}
          onSwitchMode={s.setMode}
        />
      )}
    </>
  );
}
