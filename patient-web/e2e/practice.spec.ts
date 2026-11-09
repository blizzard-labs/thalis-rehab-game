import { expect, test } from "@playwright/test";

test("guest grows a flower, rests, saves locally and clears the shared browser", async ({ page }) => {
  const sockets: string[] = [];
  page.on("websocket", ws => sockets.push(ws.url()));
  await page.goto("/");
  await page.getByRole("button", { name: /Garden Grow/ }).click();
  await page.getByRole("button", { name: "Start game" }).click();
  for (let i = 0; i < 4; i++) await page.keyboard.press("Space");
  await expect(page.getByText(/1 bloom/)).toBeVisible();
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("button", { name: "Water" })).toBeDisabled();
  await page.getByRole("button", { name: "End session" }).click();
  await page.getByRole("button", { name: "Save on this device" }).click();
  await expect(page.getByRole("button", { name: "Saved on this device" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Saved sessions" }).click();
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await page.getByRole("button", { name: "Delete saved sessions" }).click();
  await page.getByRole("button", { name: "Confirm delete all sessions" }).click();
  await expect(page.getByRole("listitem")).toHaveCount(0);
  expect(sockets.filter(url => url.includes("8765") || url.includes("/api/eeg"))).toEqual([]);
});

test("a phone player selects and catches a star by touch", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: /Star Catcher/ }).click();
  await page.getByRole("button", { name: "Start game" }).click();
  await expect(page.locator(".slot-1")).toHaveAttribute("data-scan", "true");
  await page.getByRole("button", { name: "Catch" }).click();
  await expect(page.getByText(/1 star/)).toBeVisible();
  await page.getByRole("button", { name: "End session" }).click();
  await expect(page.getByRole("heading", { name: "Session complete" })).toBeVisible();
});

test("camera denial can continue the same session using a switch", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: () => Promise.reject(new DOMException("Denied", "NotAllowedError"))
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Garden Grow/ }).click();
  await page.getByLabel("Camera", { exact: true }).check();
  await page.getByRole("button", { name: "Start game" }).click();
  await expect(page.getByText(/permission was declined/)).toBeVisible();
  await page.getByRole("button", { name: "Use one button" }).click();
  await page.getByRole("button", { name: "Water" }).click();
  await page.getByRole("button", { name: "End session" }).click();
  await expect(page.getByText("Camera → One button")).toBeVisible();
});

test("bundled pose worker processes a real image frame with no person", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(() => new Promise((resolve,reject) => {
    const worker = new Worker("/vision-wasm/pose-worker.js");
    worker.onerror = error => reject(error.message);
    worker.onmessage = async ({data}) => {
      if (data.kind === "ready") {
        const canvas = document.createElement("canvas");
        canvas.width = 320; canvas.height = 240;
        const frame = await createImageBitmap(canvas);
        worker.postMessage({ kind:"frame", frame, side:"left", time:performance.now() }, [frame]);
      } else {
        worker.terminate();
        if (data.kind === "error") reject(data.message); else resolve(data);
      }
    };
    worker.postMessage({kind:"open"});
  }));
  expect(result).toMatchObject({ kind:"sample", point:null });
});
