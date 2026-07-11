import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PatientWorkspace } from "./PatientWorkspace";
import { PatientStore } from "../data/store";

function renderWs(tab: any = "history", onStart = vi.fn(), onExit = vi.fn()) {
  return render(
    <PatientWorkspace
      store={new PatientStore()}
      patientId="#0421"
      tab={tab}
      onTab={vi.fn()}
      onStartSession={onStart}
      onExit={onExit}
    />,
  );
}

describe("PatientWorkspace", () => {
  it("shows patient bio in the header", () => {
    renderWs();
    expect(screen.getByText(/Krishna B\./)).toBeTruthy();
    expect(screen.getByText(/L-hemiparesis/)).toBeTruthy();
  });

  it("renders the review tabs", () => {
    renderWs();
    for (const t of ["History & Trends", "Protocol", "Assessments"]) {
      expect(screen.getByRole("button", { name: t })).toBeTruthy();
    }
  });

  it("renders the Protocol tab content when selected", () => {
    renderWs("protocol");
    expect(screen.getByText(/Session mode/i)).toBeTruthy();
  });

  it("starts a session from the header", () => {
    const onStart = vi.fn();
    renderWs("history", onStart);
    fireEvent.click(screen.getByRole("button", { name: /Start session/i }));
    expect(onStart).toHaveBeenCalled();
  });
});
