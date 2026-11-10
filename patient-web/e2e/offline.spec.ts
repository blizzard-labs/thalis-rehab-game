import { expect, test } from "@playwright/test";
import { preview } from "vite";

test("built guest app plays offline and caches build assets only", async ({
  page,
}) => {
  const server = await preview({ preview: { host: "127.0.0.1", port: 0 } });
  const addr = server.httpServer.address();
  if (!addr || typeof addr === "string") throw new Error("No preview address");
  let stopped = false;
  try {
    await page.goto("http://127.0.0.1:" + addr.port);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await expect
      .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
      .toBe(true);
    // Close the origin itself. This also exercises offline navigation in WebKit,
    // where Playwright’s network-emulation switch can abort the navigation.
    await server.close();
    stopped = true;
    await page.reload();
    await page.getByRole("button", { name: /Garden Grow/ }).click();
    await page.getByRole("button", { name: "Start game" }).click();
    await page.getByRole("button", { name: "Water" }).click();
    await page.getByRole("button", { name: "End session" }).click();
    await expect(page.getByText("Session complete")).toBeVisible();
    await page.getByRole("button", { name: "Session report" }).click();
    const reader = page.getByRole("dialog", { name: "Session report" });
    const pdf = page.waitForEvent("download");
    await reader.getByRole("button", { name: "Download PDF" }).click();
    expect((await pdf).suggestedFilename()).toMatch(
      /NeuroReach-session-.*\.pdf$/,
    );
    await reader.getByRole("button", { name: "Close report" }).click();
    const cached = await page.evaluate(async () => {
      const names = await caches.keys();
      const cache = await caches.open(
        names.find((n) => n.startsWith("neuroreach-web-"))!,
      );
      return (await cache.keys()).map((r) => new URL(r.url).pathname);
    });
    expect(cached).toContain("/models/pose_landmarker_lite.task");
    expect(cached.filter((url) => url.startsWith("/api/"))).toEqual([]);
  } finally {
    if (!stopped) await server.close();
  }
});
