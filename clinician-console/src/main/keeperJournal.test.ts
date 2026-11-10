import { expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { keeperJournal } from "./keeperJournal";

it("recovers keeper work on a later visit without mixing people or simulated sessions", () => {
  const dir = mkdtempSync(join(tmpdir(), "nr-keeper-"));
  try {
    const a = keeperJournal(dir, "patient-a", "live");
    a.save(8);
    a.save(6);
    expect(keeperJournal(dir, "patient-a", "live").read()).toBe(8);
    expect(keeperJournal(dir, "patient-a", "sim").read()).toBe(0);
    expect(keeperJournal(dir, "patient-b", "live").read()).toBe(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
