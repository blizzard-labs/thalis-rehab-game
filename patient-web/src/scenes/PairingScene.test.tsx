import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PairingScene } from "./PairingScene";
import { readSessionCode } from "../config";

describe("readSessionCode", () => {
  it("parses ?c= and returns null when absent", () => {
    expect(readSessionCode("?c=ABC234")).toBe("ABC234");
    expect(readSessionCode("")).toBeNull();
  });
});

describe("PairingScene", () => {
  it("shows connecting text while waiting for the handshake", () => {
    render(<PairingScene error={null} />);
    expect(screen.getByText(/connecting to your session/i)).toBeInTheDocument();
  });

  it("surfaces a pairing error to the patient", () => {
    render(<PairingScene error="session_taken" />);
    expect(screen.getByRole("alert")).toHaveTextContent(/session_taken/i);
  });
});
