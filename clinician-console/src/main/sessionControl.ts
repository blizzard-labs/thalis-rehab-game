import type { SessionInfo } from "./lan/pairing";

export type SessionAction = "start" | "end";

/**
 * The sidecar control command to send for a given source + action, or null
 * when nothing should be sent. Only a "sim" start arms the simulator; end
 * always disarms (harmless if never armed).
 */
export function sessionControlCommand(
  source: SessionInfo["source"],
  action: SessionAction,
): string | null {
  if (action === "end") return JSON.stringify({ cmd: "end_session" });
  return source === "sim" ? JSON.stringify({ cmd: "start_session" }) : null;
}
