import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The preload runs in Electron's default SANDBOX (Electron >= 20). A sandboxed
// preload's `require` only resolves `electron` (+ a tiny builtin whitelist) — it
// CANNOT require local modules or node-heavy deps (fs, crypto, selfsigned, …).
// If the preload imports such a module it throws at load, `exposeInMainWorld`
// never runs, and `window.neuroreach` is undefined in the renderer (the bridge
// silently vanishes). So: the preload may only import from "electron".
describe("preload is sandbox-safe", () => {
  it("imports nothing but electron", () => {
    const src = readFileSync(join(__dirname, "preload.ts"), "utf8");
    const imports = [...src.matchAll(/(?:import\s.*?from\s*|require\()\s*["']([^"']+)["']/g)].map(
      (m) => m[1],
    );
    const forbidden = imports.filter((m) => m !== "electron");
    expect(forbidden).toEqual([]);
  });
});
