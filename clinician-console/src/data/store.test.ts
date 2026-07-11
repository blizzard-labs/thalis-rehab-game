import { describe, it, expect, beforeEach } from "vitest";
import { PatientStore } from "./store";

describe("PatientStore", () => {
  let store: PatientStore;
  beforeEach(() => {
    store = new PatientStore();
  });

  it("seeds the four wireframe patients", () => {
    const ids = store.list().map((p) => p.id);
    expect(ids).toContain("#0421"); // Krishna B.
    expect(store.list().length).toBe(4);
  });

  it("looks a patient up by id", () => {
    const p = store.get("#0421");
    expect(p?.name).toBe("Krishna B.");
    expect(p?.affectedSide).toBe("Left");
  });

  it("returns undefined for an unknown id", () => {
    expect(store.get("#9999")).toBeUndefined();
  });

  it("filters the roster by case-insensitive name search", () => {
    const hits = store.search("krishna");
    expect(hits.length).toBe(1);
    expect(hits[0].id).toBe("#0421");
  });

  it("adds a clinical score and keeps scores sorted by date ascending", () => {
    store.addScore("#0421", { date: "2026-02-01", fmaUe: 25, arat: 17 });
    const scores = store.get("#0421")!.scores;
    expect(scores[0].date).toBe("2026-02-01"); // earliest first
    expect(scores.some((s) => s.fmaUe === 25)).toBe(true);
  });

  it("persists a protocol update within the session", () => {
    store.updateProtocol("#0421", { trialsPerBlock: 30, mode: "Active" });
    const proto = store.get("#0421")!.protocol;
    expect(proto.trialsPerBlock).toBe(30);
    expect(proto.mode).toBe("Active");
    // unrelated fields untouched
    expect(proto.imageryWindowSec).toBe(4.0);
  });

  it("notifies subscribers on mutation", () => {
    let calls = 0;
    store.subscribe(() => (calls += 1));
    store.addScore("#0421", { date: "2026-06-01", fmaUe: 40, arat: 28 });
    expect(calls).toBe(1);
  });
});
