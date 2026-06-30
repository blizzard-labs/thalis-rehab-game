import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GameModeSelect } from "./GameModeSelect";

describe("GameModeSelect", () => {
  it("shows the completion prompt and three game modes", () => {
    render(<GameModeSelect onConfirm={() => {}} />);
    expect(screen.getByText(/great work/i)).toBeInTheDocument();
    expect(screen.getByText(/choose a game mode to continue/i)).toBeInTheDocument();
    expect(screen.getByTestId("mode-garden")).toBeInTheDocument();
    expect(screen.getByTestId("mode-river")).toBeInTheDocument();
    expect(screen.getByTestId("mode-stars")).toBeInTheDocument();
  });

  it("disables placeholder modes that are not yet available", () => {
    render(<GameModeSelect onConfirm={() => {}} />);
    expect(screen.getByTestId("mode-garden")).not.toBeDisabled();
    expect(screen.getByTestId("mode-river")).toBeDisabled();
    expect(screen.getByTestId("mode-stars")).toBeDisabled();
  });

  it("gates the 'I'm ready' button until a mode is selected", () => {
    render(<GameModeSelect onConfirm={() => {}} />);
    const ready = screen.getByTestId("mode-ready");
    expect(ready).toBeDisabled();
    fireEvent.click(screen.getByTestId("mode-garden"));
    expect(screen.getByTestId("mode-garden")).toHaveAttribute("data-selected", "true");
    expect(ready).not.toBeDisabled();
  });

  it("calls onConfirm with the selected mode id only after ready is pressed", () => {
    const onConfirm = vi.fn();
    render(<GameModeSelect onConfirm={onConfirm} />);
    fireEvent.click(screen.getByTestId("mode-garden"));
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("mode-ready"));
    expect(onConfirm).toHaveBeenCalledWith("garden");
  });
});
