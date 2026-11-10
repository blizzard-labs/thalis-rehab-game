import type { Game, Side, Source, PracticeRecord } from "./session";

export type Participant = {
  id: string;
  name: string;
  side: Side;
  consent: string;
  protocol: {
    source: Source;
    easy: boolean;
    schedule?: PracticeRecord["schedule"];
  };
  assessments: { date: string; fma: number; arat: number }[];
};
export type Visit = {
  id: string;
  participant: string;
  record: PracticeRecord;
  note: string;
  status: string;
  updated: string;
};
export type Auth = { configured: boolean; authenticated: boolean };
export type LiveInput = {
  phase: "setup" | "play";
  camera: string;
  eeg: string;
  input: number | null;
  cameraLevel: number | null;
  eegLevel: number | null;
};
export type DisplayState = {
  session: string;
  participant: string;
  target: "display" | "workstation";
  state: "waiting" | "playing" | "paused" | "ending" | "complete";
  started: string | null;
  outcome: "complete" | "interrupted" | "cancelled" | null;
  game: Game;
  side: Side;
  source: Source;
  easy: boolean;
  schedule: PracticeRecord["schedule"];
  revision: number;
  expired: boolean;
  paired: boolean;
  connected: boolean;
  patientPaused: boolean;
  url: string | null;
  record: PracticeRecord | null;
  telemetry: LiveInput | null;
};
export class StationError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api/staff/" + path, {
      method,
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(
      "The station could not be reached. Check the local companion and retry.",
    );
  }
  if (!response.ok) {
    const message = (await response.text()).trim();
    throw new StationError(
      message && !message.startsWith("<")
        ? message.slice(0, 200)
        : "The local companion is unavailable.",
      response.status,
    );
  }
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error("Start the local companion to use the staff workspace.");
  return response.json();
}
export const errorText = (err: unknown) =>
  err instanceof Error
    ? err.message
    : "The station could not complete that action.";
export const duration = (seconds: number) =>
  Math.floor(seconds / 60) +
  ":" +
  String(Math.floor(seconds) % 60).padStart(2, "0");
export async function checkReportAccess() {
  if (!(await api<Auth>("state")).authenticated)
    throw new Error("Station locked");
}
export function playerToken(session: string, token?: string | null): string {
  const key = "nr-workstation-" + session;
  try {
    if (token === null) sessionStorage.removeItem(key);
    else if (token) sessionStorage.setItem(key, token);
    return sessionStorage.getItem(key) ?? "";
  } catch {
    return token ?? "";
  }
}
