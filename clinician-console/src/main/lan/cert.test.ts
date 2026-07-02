import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadOrCreateCert } from "./cert";

describe("loadOrCreateCert", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "nr-cert-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("generates a cert on first call and persists it", () => {
    const c = loadOrCreateCert(dir);
    expect(c.key).toContain("PRIVATE KEY");
    expect(c.cert).toContain("BEGIN CERTIFICATE");
    expect(existsSync(join(dir, "lan-cert.json"))).toBe(true);
  });

  it("reuses the cached cert on the second call", () => {
    const a = loadOrCreateCert(dir);
    const b = loadOrCreateCert(dir);
    expect(b.cert).toBe(a.cert);
  });

  it("regenerates when the cached file is corrupt", () => {
    loadOrCreateCert(dir);
    writeFileSync(join(dir, "lan-cert.json"), "not json");
    const c = loadOrCreateCert(dir);
    expect(c.cert).toContain("BEGIN CERTIFICATE");
    expect(() => JSON.parse(readFileSync(join(dir, "lan-cert.json"), "utf8"))).not.toThrow();
  });
});
