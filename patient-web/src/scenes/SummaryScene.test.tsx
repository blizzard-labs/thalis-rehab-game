import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SummaryScene } from "./SummaryScene";
import { SessionStats } from "../session/SessionStats";

describe("SummaryScene", () => {
  it("shows minutes and streak with no raw percentage", () => {
    const stats = new SessionStats();
    for (let i = 0; i < 18 * 60; i++) stats.accumulate(1, true); // 18 active min, 1080 s streak
    render(<SummaryScene stats={stats} />);
    expect(screen.getByText(/great work today/i)).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument(); // minutes tile
    expect(screen.queryByText(/%/)).toBeNull();
  });
});
