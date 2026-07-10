import { useCallback, useEffect, useRef, useState } from "react";

type CheckpointBridge = {
  onPatientCheckpoint(cb: (checkpoint: string) => void): void;
  sendClinicianCheckpoint(checkpoint: string): Promise<void>;
  getCheckpointState(): Promise<{ patientBegan: boolean; patientCalibrated: boolean; clinicianLive: boolean }>;
};

function bridge(): CheckpointBridge | null {
  const nr = (window as unknown as { neuroreach?: CheckpointBridge }).neuroreach;
  return nr && typeof nr.getCheckpointState === "function" ? nr : null;
}

export function useCheckpoints(opts?: { onCalibrationReady?: () => void }) {
  const [patientBegan, setBegan] = useState(false);
  const [patientCalibrated, setCalibrated] = useState(false);
  const nr = bridge();
  // Ref so the checkpoint callback (registered once, effect deps [nr]) always
  // calls the latest handler instead of the one from first render.
  const readyCb = useRef(opts?.onCalibrationReady);
  readyCb.current = opts?.onCalibrationReady;

  useEffect(() => {
    if (!nr) return;
    void nr.getCheckpointState().then((s) => {
      setBegan(s.patientBegan);
      setCalibrated(s.patientCalibrated);
    });
    nr.onPatientCheckpoint((c) => {
      if (c === "session-begin") setBegan(true);
      if (c === "calibration-complete") setCalibrated(true);
      if (c === "calibration-ready") readyCb.current?.();
    });
  }, [nr]);

  const sendGoLive = useCallback(() => {
    void nr?.sendClinicianCheckpoint("go-live");
  }, [nr]);

  return { active: nr !== null, patientBegan, patientCalibrated, sendGoLive };
}
