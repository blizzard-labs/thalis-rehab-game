import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
declare const chrome: any;
import { chromium, expect, type Locator, type Page } from "@playwright/test";

// Reach controls by Tab, without programmatic focus or pointer clicks.
export async function tabTo(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  for (let i = 0; i < 60; i++) {
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

export async function activate(page: Page, target: Locator) {
  await tabTo(page, target);
  await page.keyboard.press("Enter");
}

export async function fits(page: Page) {
  const layout = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
    overflow: [...document.querySelectorAll("body *")]
      .filter((node) => node.getBoundingClientRect().right > innerWidth + 1)
      .slice(0, 12)
      .map((node) => ({
        tag: node.tagName,
        class: node.className,
        text: node.textContent?.slice(0, 50),
      })),
  }));
  expect(layout.scroll, JSON.stringify(layout)).toBeLessThanOrEqual(
    layout.width,
  );
}

export async function zoomHarness(
  zoom: number,
  url = "http://127.0.0.1:5173/",
) {
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
    await page.goto(url);
    const originalWidth = await page.evaluate(() => innerWidth);
    const factor = await worker.evaluate(
      async ({ value, url }) => {
        const [tab] = await chrome.tabs.query({
          url: new URL(url).origin + "/*",
        });
        await chrome.tabs.setZoom(tab.id, value);
        return chrome.tabs.getZoom(tab.id);
      },
      { value: zoom, url },
    );
    expect(factor).toBeCloseTo(zoom);
    await expect
      .poll(() => page.evaluate(() => innerWidth))
      .toBeLessThanOrEqual(Math.ceil(originalWidth / zoom));

    return {
      page,
      context,
      close: async () => {
        await context.close();
        await rm(root, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await context.close();
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}
