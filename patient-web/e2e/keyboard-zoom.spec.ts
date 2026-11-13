import { activate, fits, tabTo, zoomHarness } from "./keyboardHarness";
import { expect, test } from "@playwright/test";

for (const zoom of [2, 4]) {
  test(`keyboard play and reports remain reachable at ${zoom * 100}% browser zoom`, async ({
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "Uses Chromium's native tab zoom API",
    );
    test.setTimeout(60000);
    const run = await zoomHarness(zoom);
    const { page } = run;
    try {
      await page.getByRole("heading", { name: "Choose a game" }).waitFor();
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
      await run.close();
    }
  });
}
