import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { StarCatchScene } from "./StarCatchScene";
import { SessionStats } from "../session/SessionStats";
import type { WsLike } from "../net/scoreClient";

function fakeSocket(): WsLike & { open(): void; send(s: number): void } {
  const s: any = { onopen: null, onclose: null, onmessage: null, onerror: null, close: vi.fn() };
  s.open = () => s.onopen?.({});
  s.send = (v: number) =>
    s.onmessage?.({ data: JSON.stringify({ type: "intent_score", intent_score: v, mode: "band_power_only", timestamp: 0 }) });
  return s;
}

describe("StarCatchScene", () => {
  let raf: Array<FrameRequestCallback>;
  beforeEach(() => {
    raf = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => { raf.push(cb); return raf.length; });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  function pump(times: number, ms: number) {
    for (let i = 0; i < times; i++) {
      const cbs = raf;
      raf = [];
      act(() => cbs.forEach((cb) => cb(performance.now() + i * ms)));
    }
  }

  it("extends the reach and collects a star as scores stay high", () => {
    const stats = new SessionStats();
    const sock = fakeSocket();
    render(
      <StarCatchScene stats={stats} engagementThreshold={55} createSocket={() => sock} onEnd={() => {}} />,
    );
    act(() => sock.open());
    const before = Number(screen.getByTestId("reach-hand").getAttribute("data-reach"));

    act(() => sock.send(95));
    pump(40, 100); // ~4 s of high score → reach saturates and a star collects
    const after = Number(screen.getByTestId("reach-hand").getAttribute("data-reach"));

    expect(after).toBeGreaterThan(before);
    expect(screen.getByTestId("status-pill")).toHaveAttribute("data-engaged", "true");
    expect(stats.trialsCompleted).toBeGreaterThanOrEqual(1);
  });

  it("ends the session on the End button", () => {
    const onEnd = vi.fn();
    const sock = fakeSocket();
    render(<StarCatchScene stats={new SessionStats()} engagementThreshold={55} createSocket={() => sock} onEnd={onEnd} />);
    screen.getByRole("button", { name: /end session/i }).click();
    expect(onEnd).toHaveBeenCalledOnce();
  });
});
