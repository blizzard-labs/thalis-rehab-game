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
    expect(screen.getByTestId("mode-stars")).not.toBeDisabled();
    expect(screen.getByTestId("mode-river")).toBeDisabled();
  });

  it("allows selecting Star Catcher and confirms with its id", () => {
    const onConfirm = vi.fn();
    render(<GameModeSelect onConfirm={onConfirm} />);
    const stars = screen.getByTestId("mode-stars");
    expect(stars).not.toBeDisabled();
    fireEvent.click(stars);
    fireEvent.click(screen.getByTestId("mode-ready"));
    expect(onConfirm).toHaveBeenCalledWith("stars");
  });

  it("gates the 'I'm ready' button until a mode is selected", () => {
    render(<GameModeSelect onConfirm={() => {}} />);
    const ready = screen.getByTestId("mode-ready");
    expect(ready).toBeDisabled();
    fireEvent.click(screen.getByTestId("mode-garden"));
    expect(screen.getByTestId("mode-garden")).toHaveAttribute("data-selected", "true");
    expect(ready).not.toBeDisabled();
  });

  it("stays disabled after selecting a mode until the clinician is ready", () => {
    render(<GameModeSelect onConfirm={() => {}} clinicianReady={false} />);
    fireEvent.click(screen.getByTestId("mode-garden"));
    const ready = screen.getByTestId("mode-ready");
    expect(ready).toBeDisabled();
    expect(screen.getByTestId("waiting-spinner")).toHaveTextContent(/waiting for clinician/i);
  });

  it("enables 'I'm ready' when a mode is selected and the clinician is ready", () => {
    render(<GameModeSelect onConfirm={() => {}} clinicianReady={true} />);
    fireEvent.click(screen.getByTestId("mode-garden"));
    expect(screen.getByTestId("mode-ready")).not.toBeDisabled();
    expect(screen.queryByTestId("waiting-spinner")).toBeNull();
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
