import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Roster } from "./Roster";
import { PatientStore } from "../data/store";

describe("Roster (C1)", () => {
  it("lists all seeded patients", () => {
    render(<Roster store={new PatientStore()} onOpen={() => {}} />);
    expect(screen.getByText("Krishna B.")).toBeTruthy();
    expect(screen.getByText("Robert T.")).toBeTruthy();
    expect(screen.getAllByRole("row").length).toBe(1 + 4); // header + 4
  });

  it("filters by search", () => {
    render(<Roster store={new PatientStore()} onOpen={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: "helen" } });
    expect(screen.getByText("Helen C.")).toBeTruthy();
    expect(screen.queryByText("Krishna B.")).toBeNull();
  });

  it("opens a patient on row click", () => {
    const onOpen = vi.fn();
    render(<Roster store={new PatientStore()} onOpen={onOpen} />);
    fireEvent.click(screen.getByText("Krishna B."));
    expect(onOpen).toHaveBeenCalledWith("#0421");
  });
});
