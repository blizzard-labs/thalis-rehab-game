import { expect, test } from "@playwright/test";

test("a guest can review the current visit alongside a previous week without saving it", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-01T12:00:00Z"));
  await page.goto("/");
  async function completeRound() {
    await page.getByRole("button", { name: /Garden Grow/ }).click();
    await page.getByRole("button", { name: "Start game" }).click();
    await page.getByRole("button", { name: "Water", exact: true }).click();
    await page.getByRole("button", { name: "End session" }).click();
  }
  await completeRound();
  await page.getByRole("button", { name: "Save on this device" }).click();
  await expect(
    page.getByRole("button", { name: "Saved on this device" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to games" }).click();
  await page.clock.setFixedTime(new Date("2026-10-08T12:00:00Z"));
  await completeRound();
  await page.getByRole("button", { name: "Session report" }).click();
  const reader = page.getByRole("dialog", { name: "Session report" });
  await expect(
    reader.getByRole("heading", { name: "Four-week trend" }),
  ).toBeVisible();
  await expect(
    reader
      .getByRole("table", { name: "Four-week trend" })
      .getByRole("row")
      .filter({ hasText: "Visits" })
      .getByRole("cell")
      .nth(4),
  ).toHaveText("1");
  await reader.getByRole("button", { name: "Close report" }).click();
  await page.getByRole("button", { name: "Back to games" }).click();
  await page.getByRole("button", { name: "Saved sessions" }).click();
  await expect(page.getByRole("listitem")).toHaveCount(1);
});
