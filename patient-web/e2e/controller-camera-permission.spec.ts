import { expect, test } from "./noticesHarness";
import { openGameFixture } from "./extensionHarness";
import { evaluateView } from "./extensionViews";

test("sidebar camera permission can be granted, retried and cancelled without losing the game", async ({ browserName }) => {
  test.skip(browserName !== "chromium", "Native Chrome extension permission flow");
  test.setTimeout(60000);
  // Real getUserMedia + real Chromium permission state; only the physical
  // device is synthetic. Do not use fake-ui or replace getUserMedia here.
  const run = await openGameFixture(undefined, undefined, true, "allow", true);
  const { context, worker, game } = run;
  const client = await context.browser()!.newBrowserCDPSession();
  const panel = (js: string) => evaluateView(client, "/#game-controller", js);
  const click = (name: string) => panel(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(name)} && !b.disabled)?.click()`);
  const has = (text: string) => expect.poll(() => panel(`document.body.innerText.includes(${JSON.stringify(text)})`).catch(() => false)).toBe(true);
  try {
    await worker.evaluate(async () => {
      const c = (globalThis as any).chrome;
      const [game] = await c.tabs.query({ url: "https://poki.com/neuroreach-test" });
      await c.action.openPopup({ windowId: game.windowId });
    });
    await expect.poll(() => evaluateView(client, "/popup.html", "!connect.disabled").catch(() => false)).toBe(true);
    await evaluateView(client, "/popup.html", "connect.click()");
    const area = game.locator("[data-neuroreach-area]");
    await area.dragTo(area, { sourcePosition: { x: 120, y: 60 }, targetPosition: { x: 720, y: 560 } });
    await has("Game connected");
    await panel("Array.from(document.querySelectorAll('label')).find(l=>l.textContent.trim()==='Camera').querySelector('input').click()");
    await click("Set up input");
    await has("Allow your camera in a separate tab");
    expect(await panel("Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Set resting position').disabled")).toBe(true);
    expect(await panel("document.body.innerText.includes('declined')")).toBe(false);

    const opened = context.waitForEvent("page");
    await click("Open camera setup");
    const helper = await opened;
    await helper.waitForURL("chrome-extension://*/camera.html");
    const page = helper.frameLocator("iframe");
    await expect(page.getByRole("heading", { name: "Allow your camera" })).toBeVisible();
    // Only the owning helper tab can obtain its station; arbitrary controller
    // content cannot send a fabricated completion or redirect the helper.
    expect(await worker.evaluate("armed")).toBe(false);
    await click("Open camera setup");
    expect(context.pages().filter(p => p.url().endsWith("/camera.html"))).toHaveLength(1);

    const extensionOrigin = helper.url().replace(/\/camera.html$/, "");
    const permission = { name: "camera" };
    await client.send("Browser.setPermission", { permission, setting: "denied", origin: extensionOrigin, embeddedOrigin: "http://127.0.0.1:5173" });
    await page.getByRole("button", { name: "Allow camera", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("blocked or the prompt was dismissed");
    await expect(page.getByRole("button", { name: "Try camera again" })).toBeEnabled();
    await client.send("Browser.setPermission", { permission, setting: "granted", origin: extensionOrigin, embeddedOrigin: "http://127.0.0.1:5173" });
    // Track actual browser streams to verify the permission check releases its
    // camera immediately. This wraps and calls the real API, never substitutes it.
    const frame = helper.frames().find(f => f.url().endsWith("/camera-permission.html"))!;
    await frame.evaluate(() => {
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const stream = await original(constraints);
        (window as any).permissionTracks = stream.getTracks();
        return stream;
      };
    });
    await page.getByRole("button", { name: "Try camera again" }).click();
    await expect(page.getByRole("status")).toContainText("Camera access is ready");
    expect(await frame.evaluate(() => (window as any).permissionTracks.every((track: MediaStreamTrack) => track.readyState === "ended"))).toBe(true);
    await page.getByRole("button", { name: "Return to game" }).click();
    await expect.poll(() => helper.isClosed()).toBe(true);
    await expect.poll(() => panel("document.querySelector('video').srcObject?.getVideoTracks()[0]?.readyState").catch(() => null)).toBe("live");
    expect(await worker.evaluate("armed")).toBe(false);
    expect(await worker.evaluate("!!target.rect")).toBe(true);
    expect((await run.events()).filter(e => e.type === "keydown")).toHaveLength(0);

    // Simulate revocation and reopen setup, then close without granting. The
    // controller remains usable and offers retry/manual controls.
    await click("Use on-screen controls");
    await click("Change controls");
    await client.send("Browser.setPermission", { permission, setting: "denied", origin: extensionOrigin, embeddedOrigin: "http://127.0.0.1:5173" });
    await panel("Array.from(document.querySelectorAll('label')).find(l=>l.textContent.trim()==='Camera').querySelector('input').click()");
    await click("Set up input");
    await has("Open camera setup");
    const second = context.waitForEvent("page");
    await click("Open camera setup");
    const cancelled = await second;
    await cancelled.waitForURL("chrome-extension://*/camera.html");
    await cancelled.close();
    await game.bringToFront();
    await has("Allow your camera in a separate tab");
    await click("Use on-screen controls");
    await has("Select highlighted control");
    expect(await worker.evaluate("armed")).toBe(false);
  } finally { await run.close(); }
});
