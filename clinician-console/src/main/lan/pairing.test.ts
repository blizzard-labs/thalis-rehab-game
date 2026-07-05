import { describe, it, expect } from "vitest";
import { SessionPairing, CODE_ALPHABET, type SessionInfo } from "./pairing";

const SESSION: SessionInfo = { patientFirstName: "Margaret", affectedSide: "left", mode: "band_power_only", source: "sim" };

function makeRng(seq: number[]) {
  let i = 0;
  return () => seq[i++ % seq.length];
}

describe("SessionPairing", () => {
  it("mints a 6-char code from the confusable-free alphabet", () => {
    const p = new SessionPairing();
    const code = p.mint(SESSION);
    expect(code).toHaveLength(6);
    for (const ch of code) expect(CODE_ALPHABET).toContain(ch);
    expect(CODE_ALPHABET).not.toMatch(/[ILOU01]/);
  });

  it("validates the active code and rejects others", () => {
    const p = new SessionPairing();
    const code = p.mint(SESSION);
    expect(p.validate(code)).toBe(true);
    expect(p.validate("ZZZZZZ")).toBe(false);
  });

  it("binds exactly one socket; rejects a second claimant", () => {
    const p = new SessionPairing();
    p.mint(SESSION);
    expect(p.bind("sock-a")).toBe(true);
    expect(p.bind("sock-b")).toBe(false);
    expect(p.boundSocketId()).toBe("sock-a");
  });

  it("rejects a code after TTL expiry", () => {
    let t = 1000;
    const p = new SessionPairing({ ttlMs: 500, now: () => t });
    const code = p.mint(SESSION);
    t = 1600;
    expect(p.validate(code)).toBe(false);
  });

  it("end() invalidates the code and clears the binding", () => {
    const p = new SessionPairing();
    const code = p.mint(SESSION);
    p.bind("sock-a");
    p.end();
    expect(p.validate(code)).toBe(false);
    expect(p.boundSocketId()).toBeNull();
    expect(p.session()).toBeNull();
  });

  it("uses the injected rng for deterministic codes", () => {
    const p = new SessionPairing({ rng: makeRng([0]) });
    expect(p.mint(SESSION)).toBe("222222");
  });
});
