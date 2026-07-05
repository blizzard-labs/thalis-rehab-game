"""Scripted session simulator for dev / headset-free end-to-end testing.

Drives a MockUnicornOutlet through a canonical rehab-session arc so the full
pipeline (filter -> ERD -> IntentScore -> LAN relay -> patient game) can be
exercised without a real headset. Owns one worker thread, armed on Start Session
and disarmed on End Session. Knows nothing about WebSockets or the console.

Arc (all durations tunable):
  settle       ~4 s   clean rest, no ERD (scores floor; contact quality reads good)
  calibration  ~16 s  alternating 4 s rest / 4 s imagine, moderate consistent ERD
  gameplay     until disarm: cue -> ramped imagine (variable depth) -> release,
               with slow fatigue drift and occasional artifact spikes
"""
from __future__ import annotations

import logging
import threading
import time

import numpy as np

logger = logging.getLogger(__name__)


class SessionSimulator:
    def __init__(
        self,
        outlet,
        *,
        seed: int | None = None,
        settle_s: float = 4.0,
        calib_s: float = 16.0,
        step_s: float = 1.0,
        mi_channels: tuple[str, ...] = ("C3", "C4"),
        mu_band: tuple[float, float] = (8.0, 12.0),
        beta_band: tuple[float, float] = (13.0, 30.0),
    ):
        self._outlet = outlet
        self._rng = np.random.default_rng(seed)
        self.settle_s = float(settle_s)
        self.calib_s = float(calib_s)
        self.step_s = float(step_s)
        self.mi_channels = tuple(mi_channels)
        self.mu_band = (float(mu_band[0]), float(mu_band[1]))
        self.beta_band = (float(beta_band[0]), float(beta_band[1]))

        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._armed_at: float | None = None

    # ------------------------------------------------------------------ pure logic
    def phase_at(self, elapsed_s: float) -> str:
        if elapsed_s < self.settle_s:
            return "settle"
        if elapsed_s < self.settle_s + self.calib_s:
            return "calibration"
        return "gameplay"

    # ------------------------------------------------------------------ lifecycle
    def status(self) -> dict:
        elapsed = 0.0 if self._armed_at is None else max(0.0, time.monotonic() - self._armed_at)
        armed = self._armed_at is not None
        return {
            "armed": armed,
            "phase": self.phase_at(elapsed) if armed else "idle",
            "elapsed_s": elapsed,
        }

    def arm(self) -> None:
        self.disarm()  # idempotent: restart the arc from phase 0
        self._stop.clear()
        self._armed_at = time.monotonic()
        self._thread = threading.Thread(target=self._run, name="SessionSimulator", daemon=True)
        self._thread.start()
        logger.info("SessionSimulator armed")

    def disarm(self) -> None:
        self._stop.set()
        t = self._thread
        if t is not None and t.is_alive():
            t.join(timeout=2.0)
        self._thread = None
        self._armed_at = None
        logger.info("SessionSimulator disarmed")

    # ------------------------------------------------------------------ worker
    def _run(self) -> None:
        trial = 0
        try:
            while not self._stop.is_set():
                elapsed = time.monotonic() - (self._armed_at or time.monotonic())
                phase = self.phase_at(elapsed)
                if phase == "settle":
                    pass  # no injection: mock streams clean rest
                elif phase == "calibration":
                    # 4 s rest / 4 s imagine cycle within the calibration window.
                    block = int(elapsed - self.settle_s) // 4
                    if block % 2 == 1:
                        self._inject_imagine(depth_mu=0.75, depth_beta=0.6, duration_s=self.step_s)
                else:  # gameplay
                    self._drive_trial(trial)
                    trial += 1
                self._stop.wait(self.step_s)
        except Exception:  # noqa: BLE001 - worker must not take down the process
            logger.exception("SessionSimulator worker crashed")

    def _inject_imagine(self, *, depth_mu: float, depth_beta: float, duration_s: float) -> None:
        for ch in self.mi_channels:
            self._outlet.inject_erd(ch, self.mu_band, 0.0, duration_s, depth_mu)
            self._outlet.inject_erd(ch, self.beta_band, 0.0, duration_s, depth_beta)

    def _drive_trial(self, trial: int) -> None:
        # Slow fatigue: peak depth decays ~10%/min (~ per-20-trial), floored at 0.5.
        fatigue = max(0.5, 1.0 - 0.005 * trial)
        # Per-trial outcome variability: success / partial / miss.
        base = float(self._rng.uniform(0.6, 0.9)) * fatigue
        # Ramp-in: two stepped sub-injections approximate an ease-in, then plateau.
        self._inject_imagine(depth_mu=base * 0.5, depth_beta=base * 0.4, duration_s=self.step_s * 0.4)
        self._inject_imagine(depth_mu=base, depth_beta=base * 0.8, duration_s=self.step_s)
        # Occasional artifact (~1 in 35 gameplay steps) to exercise the gate.
        if self._rng.random() < (1.0 / 35.0):
            self._outlet.inject_spike(amplitude_uv=250.0, n_samples=25, start_in_s=0.0)
