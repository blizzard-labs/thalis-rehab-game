export type AffectedSide = "left" | "right";

export const config = {
  wsUrl: "ws://localhost:8765",
  patient: { firstName: "Margaret", affectedSide: "left" as AffectedSide },
  /** Intent score (0–100) at/above which the patient counts as "engaged". */
  engagementThreshold: 55,
};
