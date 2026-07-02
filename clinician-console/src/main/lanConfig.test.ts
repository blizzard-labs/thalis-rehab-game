import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LAN_PORT, lanServerOptions } from "./config";

describe("lanServerOptions", () => {
  let userData: string;
  beforeAll(() => { userData = mkdtempSync(join(tmpdir(), "nr-userdata-")); });
  afterAll(() => { rmSync(userData, { recursive: true, force: true }); });

  it("points the patient dist dir at the built patient-web bundle", () => {
    const o = lanServerOptions("/repo", userData);
    expect(o.port).toBe(LAN_PORT);
    expect(o.patientDistDir).toContain("patient-web");
    expect(o.patientDistDir).toContain("dist");
    expect(o.sidecarWsUrl).toContain("ws://");
    expect(o.cert.cert).toContain("BEGIN CERTIFICATE");
    expect(o.host).toMatch(/^\d{1,3}(\.\d{1,3}){3}$/);
  });
});
