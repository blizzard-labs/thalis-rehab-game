import { useEffect } from "react";

export type RomStatus = "idle" | "collecting" | "complete";

/**
 * Per-joint max-ROM capture sub-step. Fires `begin_rom_calibration` at the
 * sidecar; the worker tracks each joint's maximum reach over a short window and
 * builds the per-patient target catalogue used by the Star Catcher game.
 */
export function RomCaptureStep({
  onBegin, status, onDone,
}: { onBegin: () => void; status: RomStatus; onDone: () => void }) {
  useEffect(() => {
    if (status === "complete") onDone();
  }, [status, onDone]);

  return (
    <div className="rom-capture" data-testid="rom-capture">
      <p>Ask the patient to reach as far as is comfortable in each direction — up, out to the side, and straightening the arm.</p>
      <button type="button" onClick={onBegin} disabled={status === "collecting"}>
        {status === "collecting" ? "Capturing…" : "Capture range of motion"}
      </button>
      <span data-testid="rom-status">{status}</span>
    </div>
  );
}
