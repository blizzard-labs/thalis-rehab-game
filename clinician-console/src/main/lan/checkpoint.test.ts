import { describe, it, expect } from "vitest";
import { isPatientCheckpoint, isClinicianCheckpoint } from "./checkpoint";

describe("checkpoint contract", () => {
  it("recognizes patient checkpoints", () => {
    expect(isPatientCheckpoint({ type: "patient-checkpoint", checkpoint: "session-begin" })).toBe(true);
    expect(isPatientCheckpoint({ type: "patient-checkpoint", checkpoint: "calibration-complete" })).toBe(true);
  });
  it("recognizes clinician checkpoints", () => {
    expect(isClinicianCheckpoint({ type: "clinician-checkpoint", checkpoint: "go-live" })).toBe(true);
  });
  it("rejects other/unknown messages", () => {
    expect(isPatientCheckpoint({ type: "intent_score" })).toBe(false);
    expect(isClinicianCheckpoint({ type: "webrtc-offer" })).toBe(false);
    expect(isPatientCheckpoint({ type: "patient-checkpoint", checkpoint: "nope" })).toBe(false);
  });
});
