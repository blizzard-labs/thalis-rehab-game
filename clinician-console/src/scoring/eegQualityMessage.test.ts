import { describe, it, expect } from "vitest";
import { parseEegQualityMessage } from "./eegQualityMessage";

const good = JSON.stringify({
  type: "eeg_quality",
  fs: 250,
  channels: [
    { label: "Fz", quality: "good", p2p: 12.3 },
    { label: "C3", quality: "check", p2p: 80.1 },
  ],
  trace: { C3: [1, 2, 3], Cz: [], C4: [4, 5] },
  timestamp: 1234.5,
});

describe("parseEegQualityMessage", () => {
  it("parses a well-formed frame", () => {
    const r = parseEegQualityMessage(good);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.frame.fs).toBe(250);
      expect(r.frame.channels.length).toBe(2);
      expect(r.frame.channels[1].quality).toBe("check");
      expect(r.frame.trace.C3).toEqual([1, 2, 3]);
    }
  });

  it("rejects malformed JSON", () => {
    expect(parseEegQualityMessage("{not json").ok).toBe(false);
  });

  it("rejects the wrong message type", () => {
    const r = parseEegQualityMessage(JSON.stringify({ type: "intent_score" }));
    expect(r.ok).toBe(false);
  });

  it("coerces an unknown quality value to poor", () => {
    const raw = JSON.stringify({
      type: "eeg_quality",
      fs: 250,
      channels: [{ label: "Cz", quality: "weird", p2p: 5 }],
      trace: {},
      timestamp: 1,
    });
    const r = parseEegQualityMessage(raw);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.frame.channels[0].quality).toBe("poor");
  });
});
