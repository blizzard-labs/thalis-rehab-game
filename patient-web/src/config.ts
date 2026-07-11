export type AffectedSide = "left" | "right";

export const config = {
  wsUrl: "ws://localhost:8765",
  patient: { firstName: "Krishna", affectedSide: "left" as AffectedSide },
  /** Intent score (0–100) at/above which the patient counts as "engaged". */
  engagementThreshold: 55,
  /**
   * TEMPORARY PROTOTYPING CRUTCH — remove before clinical use.
   * With the simulated EEG the engagement gate can stall a catch for a long
   * time even with the net on the star. When > 0, holding the net on the goal
   * for this many seconds force-collects the star regardless of the EEG gate.
   * Applies to BOTH `npm run dev` and the built/QR LAN version. Set to 0 to
   * restore the pure EEG-gated behaviour.
   */
  devAutoCollectSeconds: 3,
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
