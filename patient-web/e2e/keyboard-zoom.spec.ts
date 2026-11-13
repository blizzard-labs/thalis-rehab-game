import {
  chromium,
  expect,
  test,
  type Locator,
  type Page,
} from "@playwright/test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

declare const chrome: any;

// Reach controls by Tab, without programmatic focus or pointer clicks.
async function tabTo(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  for (let i = 0; i < 40; i++) {
    if (await target.evaluate((node) => node === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
  await expect(target).toBeInViewport();
  expect(
    await target.evaluate((node) => {
      const box = node.getBoundingClientRect();
      const hit = document.elementFromPoint(
        box.left + box.width / 2,
        box.top + box.height / 2,
      );
      return hit !== null && node.contains(hit);
    }),
  ).toBe(true);
}

async function activate(page: Page, target: Locator) {
  await tabTo(page, target);
  await page.keyboard.press("Enter");
}

async function fits(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

for (const zoom of [2, 4]) {
  test(`keyboard play and reports remain reachable at ${zoom * 100}% browser zoom`, async ({
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "Uses Chromium's native tab zoom API",
    );
    test.setTimeout(60000);
    const root = await mkdtemp(path.join(os.tmpdir(), "nr-keyboard-zoom-"));
    const extension = path.join(root, "extension");
    await mkdir(extension);
    // A test-only helper changes actual browser zoom, not CSS zoom or emulated
    // viewport width. It is unrelated to the distributed game controller.
    await writeFile(
      path.join(extension, "manifest.json"),
      JSON.stringify({
        manifest_version: 3,
        name: "Browser zoom verification",
        version: "1.0",
        permissions: ["tabs"],
        background: { service_worker: "background.js" },
      }),
    );
    await writeFile(
      path.join(extension, "background.js"),
      "chrome.runtime.onInstalled.addListener(() => {});",
    );
    const context = await chromium.launchPersistentContext(
      path.join(root, "profile"),
      {
        channel: "chromium",
        headless: true,
        viewport: null,
        args: [
          "--window-size=1280,900",
          `--disable-extensions-except=${extension}`,
          `--load-extension=${extension}`,
        ],
      },
    );
    try {
      const worker =
        context.serviceWorkers()[0] ??
        (await context.waitForEvent("serviceworker"));
      const page = await context.newPage();
      await page.goto("http://127.0.0.1:5173/");
      await page.getByRole("heading", { name: "Choose a game" }).waitFor();
      const originalWidth = await page.evaluate(() => innerWidth);
      const factor = await worker.evaluate(async (value) => {
        const [tab] = await chrome.tabs.query({
          url: "http://127.0.0.1:5173/*",
        });
        await chrome.tabs.setZoom(tab.id, value);
        return chrome.tabs.getZoom(tab.id);
      }, zoom);
      expect(factor).toBeCloseTo(zoom);
      await expect
        .poll(() => page.evaluate(() => innerWidth))
        .toBeLessThanOrEqual(Math.ceil(originalWidth / zoom));

      for (const game of [
        "Garden Grow",
        "Star Catcher",
        "River Rowing",
        "Fruit Picking",
        "Lighthouse Keeper",
      ]) {
        await fits(page);
        await activate(
          page,
          page.getByRole("button", { name: new RegExp(game) }),
        );
        await fits(page);
        await activate(
          page,
          page.getByRole("button", { name: "Start game", exact: true }),
        );
        const action = page.locator(".game-dock .button-row .primary");
        await expect(action).toBeFocused();
        await expect(action).toBeInViewport();
        await page.keyboard.press("Space");
        await fits(page);
        await activate(
          page,
          page.getByRole("button", { name: "Pause", exact: true }),
        );
        await expect(action).toBeDisabled();
        await activate(
          page,
          page.getByRole("button", { name: "Resume", exact: true }),
        );
        await expect(action).toBeEnabled();
        await activate(
          page,
          page.getByRole("button", { name: "End session", exact: true }),
        );
        await expect(
          page.getByRole("heading", { name: "Session complete" }),
        ).toBeVisible();
        await fits(page);
        await activate(
          page,
          page.getByRole("button", { name: "Session report", exact: true }),
        );
        const report = page.getByRole("dialog", {
          name: "Session report",
          exact: true,
        });
        const close = report.getByRole("button", { name: "Close report" });
        await expect(close).toBeFocused();
        expect(
          await report.evaluate((node) => node.scrollWidth <= node.clientWidth),
        ).toBe(true);
        await tabTo(page, report.getByRole("button", { name: "Download PDF" }));
        await tabTo(page, report.getByRole("button", { name: "Export CSV" }));
        const downloaded = page.waitForEvent("download");
        await page.keyboard.press("Enter");
        expect((await downloaded).suggestedFilename()).toMatch(/\.csv$/);
        if (game === "Garden Grow") await page.keyboard.press("Escape");
        else await activate(page, close);
        await expect(report).toBeHidden();
        await expect(
          page.getByRole("button", { name: "Session report", exact: true }),
        ).toBeFocused();
        if (game === "Garden Grow") {
          await activate(
            page,
            page.getByRole("button", { name: "Save on this device" }),
          );
          await expect(
            page.getByRole("button", { name: "Saved on this device" }),
          ).toBeVisible();
        }
        await activate(
          page,
          page.getByRole("button", { name: "Back to games", exact: true }),
        );
      }
      await activate(
        page,
        page.getByRole("button", { name: "Saved sessions", exact: true }),
      );
      const progressButton = page.getByRole("button", {
        name: "Progress report",
        exact: true,
      });
      await activate(page, progressButton);
      const progress = page.getByRole("dialog", {
        name: "Longitudinal report",
        exact: true,
      });
      await expect(
        progress.getByRole("button", { name: "Close report" }),
      ).toBeFocused();
      expect(
        await progress.evaluate((node) => node.scrollWidth <= node.clientWidth),
      ).toBe(true);
      await tabTo(page, progress.getByRole("combobox", { name: "Period" }));
      // Native select type-ahead works without relying on an OS popup in headless mode.
      await page.keyboard.press("1");
      await expect(
        progress.getByRole("combobox", { name: "Period" }),
      ).toHaveValue("12");
      await tabTo(
        page,
        progress.getByRole("combobox", { name: "Game", exact: true }),
      );
      await page.keyboard.press("g");
      await expect(
        progress.getByRole("combobox", { name: "Game", exact: true }),
      ).toHaveValue("garden");
      await page.keyboard.press("Escape");
      await expect(progress).toBeHidden();
      await expect(progressButton).toBeFocused();
    } finally {
      await context.close();
      await rm(root, { recursive: true, force: true });
    }
  });
}
