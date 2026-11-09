import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

// Garden opens a real WebSocket; stub it so the flow test stays offline.
beforeEach(() => {
  vi.stubGlobal("WebSocket", class {
    onopen: any = null; onclose: any = null; onmessage: any = null; onerror: any = null;
    close() {}
  });
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 0);
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("App flow", () => {
  it("plays a complete guest round without opening a signal socket", async () => {
    const socket = vi.fn();
    vi.stubGlobal("WebSocket", socket);
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /garden grow/i }));
    await user.click(screen.getByRole("button", { name: /start game/i }));
    for (let i = 0; i < 4; i++) await user.click(screen.getByRole("button", { name: "Water" }));
    expect(screen.getByText(/1 bloom/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "End session" }));
    expect(screen.getByText("Session complete")).toBeInTheDocument();
    expect(socket).not.toHaveBeenCalled();
  });

  it("pairs first when a session code is in the URL, then shows Welcome with the paired name", async () => {
    // Capture the pairing socket so we can drive the paired handshake.
    let sock: any = null;
    vi.stubGlobal("WebSocket", class {
      onopen: any = null; onclose: any = null; onmessage: any = null; onerror: any = null;
      send() {}
      close() {}
      constructor() { sock = this; }
    });
    window.history.pushState({}, "", "/?c=ABC234");
    try {
      render(<App />);
      expect(screen.getByText(/connecting to your session/i)).toBeInTheDocument();

      act(() => {
        sock.onopen?.({});
        sock.onmessage?.({
          data: JSON.stringify({
            type: "paired",
            session: { patientFirstName: "Jordan", affectedSide: "right", mode: "band_power_only" },
          }),
        });
      });

      expect(screen.getByText(/hi jordan/i)).toBeInTheDocument();
      expect(screen.getByText(/ready to play/i)).toBeInTheDocument();
    } finally {
      window.history.pushState({}, "", "/");
    }
  });

  it("notifies session-begin over the paired socket when Let's begin is pressed", () => {
    const sent: string[] = [];
    let sock: any = null;
    vi.stubGlobal("WebSocket", class {
      onopen: any = null; onclose: any = null; onmessage: any = null; onerror: any = null;
      send(raw: string) { sent.push(raw); }
      close() {}
      constructor() { sock = this; }
    });
    window.history.pushState({}, "", "/?c=ABC234");
    try {
      render(<App />);
      act(() => {
        sock.onopen?.({});
        sock.onmessage?.({
          data: JSON.stringify({
            type: "paired",
            session: { patientFirstName: "Jordan", affectedSide: "right", mode: "band_power_only" },
          }),
        });
      });
      fireEvent.click(screen.getByRole("button", { name: /let's begin/i }));
      expect(sent.some((r) => r.includes("patient-checkpoint") && r.includes("session-begin"))).toBe(true);
    } finally {
      window.history.pushState({}, "", "/");
    }
  });
});
