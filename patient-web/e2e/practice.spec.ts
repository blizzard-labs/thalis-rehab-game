import { expect, test } from "@playwright/test";

test("guest grows a flower, rests, saves locally and clears the shared browser", async ({ page }) => {
  const sockets: string[] = [];
  page.on("websocket", ws => sockets.push(ws.url()));
  await page.goto("/");
  await page.getByRole("button", { name: /Garden Grow/ }).click();
  await page.getByRole("button", { name: "Start game" }).click();
  for (let i = 0; i < 4; i++) await page.keyboard.press("Space");
  await expect(page.getByText(/1 blooms/)).toBeVisible();
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
  await expect(page.getByText(/1 stars/)).toBeVisible();
  await page.getByRole("button", { name: "End session" }).click();
  await expect(page.getByRole("heading", { name: "Session complete" })).toBeVisible();
});
