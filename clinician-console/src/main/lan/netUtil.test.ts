import { describe, it, expect } from "vitest";
import { detectLanIpv4 } from "./netUtil";

describe("detectLanIpv4", () => {
  it("returns a dotted-quad string (real interface or loopback fallback)", () => {
    const ip = detectLanIpv4();
    expect(ip).toMatch(/^\d{1,3}(\.\d{1,3}){3}$/);
  });
});
