import { expect, test } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { activate, fits, tabTo, zoomHarness } from "./keyboardHarness";
import { controllerHarness } from "./extensionHarness";

declare const chrome: any;
declare function beginSelection(tabId: number): Promise<void>;
declare function enqueue(task: () => Promise<void>): Promise<void>;

test.beforeEach(({ browserName }) => {
  test.skip(browserName !== "chromium", "Uses Chromium's native browser zoom");
});

test("external-game controller works with keyboard controls at 200% and 400% zoom", async () => {
  const run = await controllerHarness(undefined, undefined, true);
  try {
    const { controller, worker } = run;
    await expect
      .poll(() => worker.evaluate(() => (globalThis as any).status().connected))
      .toBe(true);
    for (const { zoom, width } of [
      { zoom: 2, width: 490 },
      { zoom: 2, width: 1280 },
      { zoom: 4, width: 1280 },
    ]) {
      const factor = await worker.evaluate(
        async ({ zoom, width }) => {
          const [window] = await chrome.windows.getAll({
            populate: true,
            windowTypes: ["popup"],
          });
          await chrome.windows.update(window.id, {
            left: 0,
            top: 0,
            width,
            height: 900,
          });
          await chrome.tabs.setZoom(window.tabs[0].id, zoom);
          return chrome.tabs.getZoom(window.tabs[0].id);
        },
        { zoom, width },
      );
      expect(factor).toBeCloseTo(zoom);
      await expect
        .poll(() => controller.evaluate(() => innerWidth))
        .toBeLessThanOrEqual(width / zoom);
      await fits(controller);
      await activate(
        controller,
        controller.getByRole("button", { name: "Set up input" }),
      );
      await fits(controller);
      await activate(
        controller,
        controller.getByRole("button", {
          name: "Enable controls",
          exact: true,
        }),
      );
      const before = (await run.events()).filter(
        (e) => e.type === "keyup",
      ).length;
      await activate(
        controller,
        controller.getByRole("button", { name: "→ Right", exact: true }),
      );
      await expect
        .poll(
          async () =>
            (await run.events()).filter(
              (e) => e.type === "keyup" && e.key === "ArrowRight" && e.trusted,
            ).length,
        )
        .toBe(before + 1);
      await activate(
        controller,
        controller.getByRole("button", { name: "Stop controls", exact: true }),
      );
      await expect(
        controller.getByText("○ Controls stopped", { exact: true }),
      ).toBeVisible();
      await activate(
        controller,
        controller.getByRole("button", { name: "Change controls" }),
      );
    }
    // A real game-window resize must still invalidate the area. Escape must
    // release the pre-selection attachment, and another selection must recover.
    const gameTab = await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({
        url: "https://poki.com/neuroreach-test",
      });
      await chrome.windows.update(tab.windowId, {
        left: 0,
        top: 0,
        width: 1150,
        height: 900,
      });
      return tab.id;
    });
    await expect
      .poll(() => worker.evaluate(() => (globalThis as any).status().connected))
      .toBe(false);
    await run.game.bringToFront();
    await worker.evaluate(
      (tabId) => enqueue(() => beginSelection(tabId)),
      gameTab,
    );
    await run.game.locator("[data-neuroreach-area]").waitFor();
    await run.game.keyboard.press("Escape");
    await expect(run.game.locator("[data-neuroreach-area]")).toHaveCount(0);
    await expect
      .poll(() =>
        worker.evaluate(async (tabId) => {
          // getTargets().attached also includes Playwright's own connection.
          try {
            await chrome.debugger.sendCommand({ tabId }, "Runtime.evaluate", {
              expression: "true",
            });
            return true;
          } catch {
            return false;
          }
        }, gameTab),
      )
      .toBe(false);
    await worker.evaluate(
      (tabId) => enqueue(() => beginSelection(tabId)),
      gameTab,
    );
    const overlay = run.game.locator("[data-neuroreach-area]");
    await overlay.dragTo(overlay, {
      sourcePosition: { x: 120, y: 60 },
      targetPosition: { x: 720, y: 560 },
    });
    await expect
      .poll(() => worker.evaluate(() => (globalThis as any).status().connected))
      .toBe(true);
    await controller.bringToFront();
    await activate(
      controller,
      controller.getByRole("button", { name: "Set up input" }),
    );
    await activate(
      controller,
      controller.getByRole("button", { name: "Enable controls", exact: true }),
    );
    await expect(
      controller.getByText("● Controls enabled · Alt+Shift+S to stop", {
        exact: true,
      }),
    ).toBeVisible();
    await activate(
      controller,
      controller.getByRole("button", { name: "Stop controls", exact: true }),
    );
  } finally {
    await run.close();
  }
});

for (const zoom of [2, 4]) {
  test(`clinician can manage a separate patient with keyboard controls at ${zoom * 100}% zoom`, async ({
    browser,
  }) => {
    test.setTimeout(60000);
    const python = process.env.NEUROREACH_TEST_PYTHON;
    test.skip(!python, "Requires the local companion and built web app");
    const port = 18781 + zoom;
    const host = `http://127.0.0.1:${port}`;
    let occupied = false;
    try {
      await fetch(host + "/api/health");
      occupied = true;
    } catch {}
    expect(occupied, "The disposable station port must be free").toBe(false);
    const root = await mkdtemp(path.join(os.tmpdir(), "nr-staff-zoom-"));
    const service = spawn(
      python!,
      [
        "../signal-engine/local_companion.py",
        "--local-only",
        "--port",
        String(port),
      ],
      {
        env: { ...process.env, NEUROREACH_DATA_DIR: root },
        stdio: "ignore",
      },
    );
    let run: Awaited<ReturnType<typeof zoomHarness>> | undefined;
    const patient = await browser.newContext();
    try {
      await expect
        .poll(
          async () => {
            try {
              return (await fetch(host + "/api/health")).ok;
            } catch {
              return false;
            }
          },
          { timeout: 20000 },
        )
        .toBe(true);
      run = await zoomHarness(zoom, host + "/#staff");
      const { page } = run;
      await tabTo(page, page.getByLabel("Staff password"));
      await page.keyboard.type("zoom-fixture-passphrase");
      await activate(page, page.getByRole("button", { name: "Set password" }));
      await fits(page);
      await tabTo(page, page.getByLabel("Participant label"));
      await page.keyboard.type("Zoom fixture");
      await tabTo(page, page.getByLabel(/Participant agreed/));
      await page.keyboard.press("Space");
      await activate(
        page,
        page.getByRole("button", { name: "Add participant" }),
      );
      await expect(
        page.getByRole("heading", { name: "Session history" }),
      ).toBeVisible();
      await fits(page);
      await activate(
        page,
        page.getByRole("button", { name: "Start supervised session" }),
      );
      await fits(page);
      const player = await patient.newPage();
      await player.goto(
        await page.getByLabel("Patient session link").inputValue(),
      );
      await player.getByRole("button", { name: "Pair this display" }).click();
      await expect(
        page.getByRole("button", { name: "Start patient game" }),
      ).toBeEnabled();
      await activate(
        page,
        page.getByRole("button", { name: "Start patient game" }),
      );
      const water = player.getByRole("button", { name: "Water", exact: true });
      for (let i = 0; i < 4; i++) await water.click();
      await expect(
        page
          .frameLocator('iframe[title="Live patient screen"]')
          .locator(".game-score"),
      ).toHaveText("1 bloom");
      await fits(page);
      await activate(
        page,
        page.getByRole("button", { name: "Pause patient game" }),
      );
      await expect(water).toBeDisabled();
      await activate(
        page,
        page.getByRole("button", { name: "Resume patient game" }),
      );
      await expect(water).toBeEnabled();
      await activate(
        page,
        page.getByRole("button", { name: "End supervised run" }),
      );
      await expect(
        player.getByRole("heading", { name: "Session complete" }),
      ).toBeVisible();
      await activate(
        page,
        page.getByRole("button", { name: "Return to roster" }),
      );
      await expect(page.getByText(/4 actions/)).toBeVisible();
      await fits(page);
      await activate(
        page,
        page.getByRole("button", { name: "Session report", exact: true }),
      );
      const report = page.getByRole("dialog", {
        name: "Session report",
        exact: true,
      });
      await expect(
        report.getByRole("button", { name: "Close report" }),
      ).toBeFocused();
      expect(
        await report.evaluate((node) => node.scrollWidth <= node.clientWidth),
      ).toBe(true);
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("button", { name: "Session report", exact: true }),
      ).toBeFocused();
      await activate(
        page,
        page.getByRole("button", { name: "Lock workstation" }),
      );
      await expect(
        page.getByRole("button", { name: "Unlock", exact: true }),
      ).toBeVisible();
    } finally {
      await patient.close();
      await run?.close();
      const stopped = new Promise((resolve) => service.once("exit", resolve));
      service.kill();
      if (service.exitCode === null && service.signalCode === null)
        await stopped;
      await rm(root, { recursive: true, force: true });
    }
  });
}
