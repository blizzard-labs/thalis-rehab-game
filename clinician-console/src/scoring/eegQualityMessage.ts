import type { ContactQuality } from "../data/types";

// Parser for the sidecar's `eeg_quality` frame (signal-engine ws_server, sent at
// ~5 Hz alongside the 20 Hz score frame). Drives the C2 setup electrode map +
// live trace. Defensive like the score parser: never throw on a bad frame.

export type ChannelQuality = {
  label: string;
  quality: ContactQuality;
  p2p: number;
};

export type EegQualityFrame = {
  fs: number;
  channels: ChannelQuality[];
  trace: Record<string, number[]>;
  timestamp: number;
};

export type QualityParseResult =
  | { ok: true; frame: EegQualityFrame }
  | { ok: false; error: string };

function asQuality(v: unknown): ContactQuality {
  return v === "good" || v === "check" ? v : "poor";
}

export function parseEegQualityMessage(raw: string): QualityParseResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: "malformed JSON" };
  }
  if (typeof data !== "object" || data === null) {
    return { ok: false, error: "not an object" };
  }
  const d = data as Record<string, unknown>;
  if (d.type !== "eeg_quality") {
    return { ok: false, error: `unexpected type: ${String(d.type)}` };
  }
  const rawChannels = Array.isArray(d.channels) ? d.channels : [];
  const channels: ChannelQuality[] = rawChannels.map((c) => {
    const o = (c ?? {}) as Record<string, unknown>;
    return {
      label: typeof o.label === "string" ? o.label : "?",
      quality: asQuality(o.quality),
      p2p: typeof o.p2p === "number" && Number.isFinite(o.p2p) ? o.p2p : 0,
    };
  });
  const trace: Record<string, number[]> = {};
  if (d.trace && typeof d.trace === "object") {
    for (const [k, v] of Object.entries(d.trace as Record<string, unknown>)) {
      if (Array.isArray(v)) trace[k] = v.filter((n): n is number => typeof n === "number");
    }
  }
  return {
    ok: true,
    frame: {
      fs: typeof d.fs === "number" ? d.fs : 250,
      channels,
      trace,
      timestamp: typeof d.timestamp === "number" ? d.timestamp : 0,
    },
  };
}
