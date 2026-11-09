export type PatientCheckpoint = "session-begin" | "calibration-complete" | "calibration-ready";
export type ClinicianCheckpoint = "go-live" | "pause" | "resume" | "end";

export type CheckpointMessage =
  | { type: "patient-checkpoint"; checkpoint: PatientCheckpoint }
  | { type: "clinician-checkpoint"; checkpoint: ClinicianCheckpoint };

const PATIENT_CHECKPOINTS = new Set<string>(["session-begin", "calibration-complete", "calibration-ready"]);
const CLINICIAN_CHECKPOINTS = new Set<string>(["go-live","pause","resume","end"]);

export function isPatientCheckpoint(
  msg: { type?: string; checkpoint?: string },
): msg is { type: "patient-checkpoint"; checkpoint: PatientCheckpoint } {
  return !!msg && msg.type === "patient-checkpoint" && PATIENT_CHECKPOINTS.has(msg.checkpoint ?? "");
}

export function isClinicianCheckpoint(
  msg: { type?: string; checkpoint?: string },
): msg is { type: "clinician-checkpoint"; checkpoint: ClinicianCheckpoint } {
  return !!msg && msg.type === "clinician-checkpoint" && CLINICIAN_CHECKPOINTS.has(msg.checkpoint ?? "");
}
