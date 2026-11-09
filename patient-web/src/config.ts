export type AffectedSide = "left" | "right";

export const config = {
  wsUrl: "ws://localhost:8765",
  patient: { firstName: "Krishna", affectedSide: "left" as AffectedSide },
  /** Intent score (0–100) at/above which the patient counts as "engaged". */
  engagementThreshold: 55,
};

/**
 * Reads the session-pairing code from the URL query (`?c=<code>`). Returns null
 * when absent (dev/local mode — the app boots straight to Welcome and the score
 * client falls back to the localhost sidecar).
 */
export function readSessionCode(search: string = window.location.search): string | null {
  const params = new URLSearchParams(search);
  return params.get("c");
}
