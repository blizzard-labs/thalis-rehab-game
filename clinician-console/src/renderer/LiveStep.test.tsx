import { it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LiveStep } from "./LiveStep";
import { ScoreStore } from "../scoring/scoreStore";
import { EegQualityStore } from "../scoring/eegQualityStore";
import { PatientStore } from "../data/store";

const margaret = new PatientStore().get("#0421")!;

it("arms the session once on mount and renders the monitor", () => {
  const onBegin = vi.fn();
  render(
    <LiveStep
      scoreStore={new ScoreStore()}
      qualityStore={new EegQualityStore()}
      connectionState="open"
      sidecarState="ready"
      patient={margaret}
      onBegin={onBegin}
      onEndSession={() => {}}
      onSwitchMode={() => {}}
    />,
  );
  expect(onBegin).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId("intent-score")).toBeTruthy();
});
