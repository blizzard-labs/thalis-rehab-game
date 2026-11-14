import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("independent game library opens official services and is usable on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: /Play familiar games/ }).click();
  await expect(page).toHaveURL(/#library$/);
  const header = page.getByRole("banner");
  await header
    .locator("img")
    .evaluate((logo: HTMLImageElement) => logo.decode());
  await expect(
    header.getByRole("link", { name: "Powered by THALis" }),
  ).toHaveAttribute("href", "https://krishna-bhatt.com/");
  await expect(page.locator(".library-hero img")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Explore full libraries" }),
  ).toBeVisible();
  await expect(page.locator(".library-services a")).toHaveCount(4);
  await expect(page.locator(".library-favorites a")).toHaveCount(6);
  await expect(page.getByRole("link", { name: /Fruit Ninja/ })).toHaveAttribute(
    "href",
    "https://poki.com/en/g/fruit-ninja",
  );
  await expect(
    page.getByRole("link", { name: /Angry Birds Friends/ }),
  ).toHaveAttribute("href", "https://redsclub.com/ab-friends/play/");
  for (const anchor of await page
    .locator(".library-services a, .library-favorites a")
    .all()) {
    await expect(anchor).toHaveAttribute("target", "_blank");
    await expect(anchor).toHaveAttribute("rel", "noopener noreferrer");
    await anchor
      .locator("img")
      .evaluate((logo: HTMLImageElement) => logo.decode());
  }
  await page.getByLabel("Find a favorite").fill("2048");
  await expect(page.locator(".library-favorites a")).toHaveCount(1);
  await page.getByLabel("Find a favorite").fill("nonsense");
  await expect(page.getByText(/No matching favorite/)).toBeVisible();
  await page.getByLabel("Find a favorite").fill("");
  await page.getByText("Set up camera / EEG controls", { exact: true }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Download the Game Controller extension" })
    .click();
  expect((await download).suggestedFilename()).toBe(
    "game-controller-extension.zip",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .include(".game-library")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.getByRole("button", { name: "← NeuroReach games" }).click();
  await page.getByRole("button", { name: "Saved sessions" }).click();
  await expect(
    page.getByText("You haven’t saved a session yet."),
  ).toBeVisible();
});

test("controller without extension cannot arm and camera denial can use manual controls", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: async () => {
          throw new DOMException("denied", "NotAllowedError");
        },
      },
      configurable: true,
    }),
  );
  await page.goto("/#game-controller");
  await expect(
    page.getByRole("button", { name: "Enable controls", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Camera", { exact: true }).check();
  await page.getByRole("button", { name: "Set up input" }).click();
  await expect(page.getByText(/permission was declined/)).toBeVisible();
  await page.getByRole("button", { name: "Use on-screen controls" }).click();
  await expect(
    page.getByRole("button", { name: "Select highlighted control" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enable controls", exact: true }),
  ).toBeDisabled();
});
