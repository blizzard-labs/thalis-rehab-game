import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HistoryTrends } from "./HistoryTrends";
import { PatientStore } from "../data/store";

const margaret = new PatientStore().get("#0421")!;

describe("HistoryTrends (C4)", () => {
  it("renders KPI tiles with latest values and deltas", () => {
    const { container } = render(<HistoryTrends patient={margaret} />);
    expect(screen.getByText("73%")).toBeTruthy(); // classifier accuracy
    expect(screen.getByText(/82°/)).toBeTruthy(); // elbow ROM
    expect(screen.getByText("7")).toBeTruthy(); // game level
    expect(screen.getByText(/\+8%/)).toBeTruthy(); // accuracy delta
    expect(container.querySelector("svg.chart")).toBeTruthy();
  });
});
