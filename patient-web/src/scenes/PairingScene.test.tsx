import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { PairingScene } from "./PairingScene";
import { readSessionCode } from "../config";

describe("readSessionCode", () => {
  it("parses ?c= and returns null when absent", () => {
    expect(readSessionCode("?c=ABC234")).toBe("ABC234");
    expect(readSessionCode("")).toBeNull();
  });
});

describe("PairingScene", () => {
  it("shows connecting text, then calls onPaired", async () => {
    const onPaired = vi.fn();
    const socket: any = { onopen: null, onclose: null, onmessage: null, onerror: null, send: vi.fn(), close: vi.fn() };
    render(
      <PairingScene
        code="ABC234"
        wssUrl="wss://host:8443"
        onPaired={onPaired}
        createSocket={() => socket}
      />,
    );
    expect(screen.getByText(/connecting to your session/i)).toBeInTheDocument();
    socket.onopen?.({});
    socket.onmessage?.({ data: JSON.stringify({ type: "paired", session: { patientFirstName: "Margaret", affectedSide: "left", mode: "band_power_only" } }) });
    await waitFor(() => expect(onPaired).toHaveBeenCalled());
  });
});
