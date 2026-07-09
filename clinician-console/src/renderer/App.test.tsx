import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { App } from "./App";
import { PatientStore } from "../data/store";
import { ScoreStore } from "../scoring/scoreStore";
import { EegQualityStore } from "../scoring/eegQualityStore";
import { VisionHealthStore } from "../scoring/visionHealthStore";

function renderApp() {
  return render(
    <App
      patientStore={new PatientStore()}
      scoreStore={new ScoreStore()}
      qualityStore={new EegQualityStore()}
      visionHealthStore={new VisionHealthStore()}
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
    expect(screen.getByRole("button", { name: "History & Trends" })).toBeTruthy();
  });

  it("launches the session flow from the workspace and returns on exit", () => {
    renderApp();
    fireEvent.click(screen.getByText("Margaret R."));
    fireEvent.click(screen.getByRole("button", { name: /Start session/i }));
    // session flow, step 1
    expect(screen.getByText(/Signal check/i)).toBeTruthy();
    // back out via the workspace link
    fireEvent.click(screen.getByRole("button", { name: /← Workspace/i }));
    expect(screen.getByRole("button", { name: "History & Trends" })).toBeTruthy();
  });

  it("returns to the roster from the workspace", () => {
    renderApp();
    fireEvent.click(screen.getByText("Margaret R."));
    fireEvent.click(screen.getByText("← Roster"));
    expect(screen.getByPlaceholderText(/search/i)).toBeTruthy();
  });
});
