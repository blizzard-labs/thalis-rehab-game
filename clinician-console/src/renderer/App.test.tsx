import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { App } from "./App";
import { PatientStore } from "../data/store";
import { ScoreStore } from "../scoring/scoreStore";
import { EegQualityStore } from "../scoring/eegQualityStore";

function renderApp() {
  return render(
    <App
      patientStore={new PatientStore()}
      scoreStore={new ScoreStore()}
      qualityStore={new EegQualityStore()}
      connectionState="open"
      sidecarState="ready"
    />,
  );
}

describe("App navigation", () => {
  it("starts on the roster", () => {
    renderApp();
    expect(screen.getByText("NeuroReach Console")).toBeTruthy();
    expect(screen.getByPlaceholderText(/search/i)).toBeTruthy();
  });

  it("opens a patient workspace from the roster", () => {
    renderApp();
    fireEvent.click(screen.getByText("Margaret R."));
    expect(screen.getByRole("button", { name: "Live Monitor" })).toBeTruthy();
  });

  it("enters setup from the workspace and returns to live", () => {
    renderApp();
    fireEvent.click(screen.getByText("Margaret R."));
    fireEvent.click(screen.getByRole("button", { name: /Start session/i }));
    expect(screen.getByText(/Setup/)).toBeTruthy();
    fireEvent.click(screen.getByText(/Next: Calibration/i));
    // back in the workspace on the live tab
    expect(screen.getByTestId("intent-score")).toBeTruthy();
  });

  it("returns to the roster from the workspace", () => {
    renderApp();
    fireEvent.click(screen.getByText("Margaret R."));
    fireEvent.click(screen.getByText("← Roster"));
    expect(screen.getByPlaceholderText(/search/i)).toBeTruthy();
  });
});
