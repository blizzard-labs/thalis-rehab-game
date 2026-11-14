import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("core player screens have no automated WCAG A/AA findings at phone width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  async function check() {
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      results.violations.map((v) => ({
        id: v.id,
        elements: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto("/");
  await page.getByRole("heading", { name: "NeuroReach", level: 1, exact: true }).waitFor();
  await check();
  await page.getByRole("button", { name: "Next guest" }).click();
  await expect(page.getByRole("button", { name: "Keep this guest" })).toBeFocused();
  await check();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: /Garden Grow/ }).click();
  await check();
  await page.getByRole("button", { name: "Start game" }).click();
  await check();
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: "End session" }).click();
  await check();
  await page.getByRole("button", { name: "Back to games" }).click();
  await page.getByRole("button", { name: /Star Catcher/ }).click();
  await page.getByRole("button", { name: "Start game" }).click();
  await check();
  for (const game of ["River Rowing", "Fruit Picking", "Lighthouse Keeper"]) {
    await page.getByRole("button", { name: "End session" }).click();
    await page.getByRole("button", { name: "Back to games" }).click();
    await page.getByRole("button", { name: new RegExp(game) }).click();
    await page.getByRole("button", { name: "Start game" }).click();
    await check();
  }
});
