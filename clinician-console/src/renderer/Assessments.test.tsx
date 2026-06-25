import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { Assessments } from "./Assessments";
import { PatientStore } from "../data/store";

describe("Assessments (C4 clinical scales)", () => {
  let store: PatientStore;
  beforeEach(() => {
    store = new PatientStore();
  });

  it("lists existing clinical scores", () => {
    render(<Assessments store={store} patientId="#0421" />);
    const rows = screen.getAllByRole("row");
    // header + 3 seeded scores
    expect(rows.length).toBe(1 + 3);
    expect(screen.getByText("2026-05-06")).toBeTruthy();
  });

  it("adds a score through the form and shows it", () => {
    render(<Assessments store={store} patientId="#0421" />);
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: "2026-06-10" } });
    fireEvent.change(screen.getByLabelText(/FMA-UE/i), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText(/ARAT/i), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: /Add score/i }));
    expect(screen.getByText("2026-06-10")).toBeTruthy();
    expect(store.get("#0421")!.scores.some((s) => s.fmaUe === 40)).toBe(true);
  });

  it("offers a CSV export", () => {
    render(<Assessments store={store} patientId="#0421" />);
    expect(screen.getByText(/Export PDF\/CSV/i)).toBeTruthy();
  });
});
