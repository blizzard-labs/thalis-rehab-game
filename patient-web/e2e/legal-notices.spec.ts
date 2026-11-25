import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { NOTICE_KEY, NOTICE_VERSION } from "../src/legal/notices";
import { activate, fits, zoomHarness } from "./keyboardHarness";

const notice = (page: Page) => page.locator(".nr-notice[open]");
const accept = (page: Page) =>
  notice(page).getByRole("button", { name: "I understand · continue" }).click();
async function start(page: Page, source?: string) {
  await page.getByRole("button", { name: /Garden Grow/ }).click();
  if (source) await page.getByLabel(source, { exact: true }).check();
  await page.getByRole("button", { name: "Start game", exact: true }).click();
}

test("first-use notice is readable, cancellable and gates play; returning readers keep keyboard focus", async ({
  page,
}) => {
  await page.goto("/");
  await expect(notice(page)).toHaveCount(0);
  await start(page);
  await expect(notice(page).getByRole("heading", { level: 1 })).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Water", exact: true }),
  ).toHaveCount(0);
  await expect(notice(page)).toContainText(
    "Clinical benefit has not been established",
  );
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: test.info().outputPath("first-use-desktop.png"),
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /Garden Grow/ })).toBeVisible();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), NOTICE_KEY),
  ).toBeNull();
  await start(page);
  await notice(page)
    .getByText("Full safety, privacy & liability notice", { exact: true })
    .click();
  await expect(notice(page)).toContainText("not a release of those rights");
  await accept(page);
  await expect(
    page.getByRole("button", { name: "Water", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: "End session" }).click();
  await page.getByRole("button", { name: "Back to games" }).click();
  await start(page);
  await expect(
    page.getByRole("button", { name: "Water", exact: true }),
  ).toBeFocused();
  await expect(notice(page)).toHaveCount(0);
});

test("camera consent appears before acquisition even after button play was acknowledged", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).cameraRequests = 0;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          (window as any).cameraRequests++;
          throw new Error("Test camera denied");
        },
      },
    });
  });
  await page.goto("/");
  await start(page);
  await accept(page);
  await page.getByRole("button", { name: "End session" }).click();
  await page.getByRole("button", { name: "Back to games" }).click();
  await start(page, "Camera");
  await expect(notice(page)).toContainText("processes video on this device");
  expect(await page.evaluate(() => (window as any).cameraRequests)).toBe(0);
  await notice(page).getByRole("button", { name: "Go back" }).click();
  expect(await page.evaluate(() => (window as any).cameraRequests)).toBe(0);
  await start(page, "Camera");
  await accept(page);
  await expect
    .poll(() => page.evaluate(() => (window as any).cameraRequests))
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Use one button" }).click();
  await expect(
    page.getByRole("button", { name: "Water", exact: true }),
  ).toBeVisible();
});

test("supervised notice prevents session connections and is scoped to the invitation", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/api/")) requests.push(req.url());
  });
  await page.goto("/#display=privacy-test-one");
  await expect(notice(page)).toContainText("live camera preview");
  await expect(notice(page)).toContainText("Pause stops gameplay");
  expect(requests).toEqual([]);
  await notice(page)
    .getByRole("button", { name: "Allow sharing & continue" })
    .click();
  await expect(
    page.getByRole("button", { name: "Pair this display" }),
  ).toBeVisible();
  expect(requests).toEqual([]);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Pair this display" }),
  ).toBeVisible();
  await page.goto("/#display=privacy-test-two");
  await page.reload();
  await expect(notice(page)).toBeVisible();
  await notice(page).getByRole("button", { name: "Go back" }).click();
  await expect(page.getByRole("button", { name: /Garden Grow/ })).toBeVisible();
  expect(requests).toEqual([]);
});

test("staff access explains consent and individual records before loading station data", async ({
  page,
}) => {
  const requests: string[] = [];
  await page.route("**/api/staff/**", (route) => {
    requests.push(route.request().url());
    return route.fulfill({ json: { configured: true, authenticated: false } });
  });
  await page.goto("/#staff");
  await expect(notice(page)).toContainText(
    "not a signed clinical consent form",
  );
  expect(requests).toEqual([]);
  await accept(page);
  await expect(page.getByLabel("Staff password")).toBeVisible();
  expect(requests.length).toBeGreaterThan(0);
});

test("external library and direct controller entry disclose provider and input risks", async ({
  page,
}) => {
  await page.goto("/#library");
  await expect(notice(page)).toContainText("flashing effects");
  await expect(page.getByRole("link", { name: /Fruit Ninja/ })).toHaveCount(0);
  await accept(page);
  await expect(page.getByRole("link", { name: /Fruit Ninja/ })).toBeVisible();
  await page.goto("/#game-controller");
  await page.reload();
  await expect(notice(page)).toContainText("browser debugging permission");
  await expect(notice(page)).toContainText(
    "Stop controls alone does not turn off the camera",
  );
  await expect(page.getByRole("button", { name: "Set up input" })).toHaveCount(
    0,
  );
  await accept(page);
  await expect(
    page.getByRole("button", { name: "Set up input" }),
  ).toBeVisible();
});

test("Next guest clears acknowledgments along with the prior player's records", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await start(page);
  await accept(page);
  await page.getByRole("button", { name: "End session" }).click();
  const controller = await context.newPage();
  await controller.goto("/#game-controller");
  await accept(controller);
  await expect(
    controller.getByRole("button", { name: "Set up input" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next guest" }).click();
  await page
    .getByRole("button", { name: "Clear and start next guest" })
    .click();
  await expect(page.getByText("Ready for the next guest.")).toBeVisible();
  await expect(notice(controller)).toBeVisible();
  await expect(
    controller.getByRole("button", { name: "Set up input" }),
  ).toHaveCount(0);
  await start(page);
  await expect(notice(page)).toBeVisible();
});

test("changed notice versions require acknowledgment again", async ({
  page,
}) => {
  await page.addInitScript(
    (key) =>
      localStorage.setItem(
        key,
        JSON.stringify({ version: "old", read: ["play:button"] }),
      ),
    NOTICE_KEY,
  );
  await page.goto("/");
  await start(page);
  await expect(notice(page)).toContainText(NOTICE_VERSION);
  await accept(page);
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).version,
      NOTICE_KEY,
    ),
  ).toBe(NOTICE_VERSION);
});

test("blocked browser storage still permits an explicit choice and playable fallback", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error("Storage blocked");
    };
    Storage.prototype.setItem = () => {
      throw new Error("Storage blocked");
    };
  });
  await page.goto("/");
  await start(page);
  await accept(page);
  await expect(
    page.getByRole("button", { name: "Water", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "End session" }).click();
  await page.getByRole("button", { name: "Back to games" }).click();
  await start(page);
  await expect(
    page.getByRole("button", { name: "Water", exact: true }),
  ).toBeVisible();
  await page.reload();
  await start(page);
  await expect(notice(page)).toBeVisible();
});

test("reopening the notice pauses play and restores focus without resuming it", async ({
  page,
}) => {
  await page.goto("/");
  await start(page);
  await accept(page);
  await page
    .getByRole("button", { name: "Safety & privacy", exact: true })
    .click();
  await expect(notice(page)).toContainText(
    "participation-count-only community pilot",
  );
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Safety & privacy", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Resume", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Water", exact: true }),
  ).toBeDisabled();
});

for (const size of [
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test(`notice fits ${size.width}px screens and its full content stays accessible`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await page.goto("/");
    await start(page, "Camera + EEG");
    await expect(notice(page)).toBeVisible();
    expect(
      await notice(page).evaluate(
        (node) => node.scrollWidth <= node.clientWidth,
      ),
    ).toBe(true);
    await notice(page)
      .getByRole("button", { name: "I understand · continue" })
      .scrollIntoViewIfNeeded();
    await expect(
      notice(page).getByRole("button", { name: "Go back" }),
    ).toBeInViewport();
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({
      path: test.info().outputPath(`notice-${size.width}.png`),
    });
  });
}

test("full notice remains keyboard accessible at 400% browser zoom", async ({
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Uses native browser zoom");
  const run = await zoomHarness(4);
  try {
    await activate(
      run.page,
      run.page.getByRole("button", { name: "Safety & privacy", exact: true }),
    );
    await fits(run.page);
    expect(
      await notice(run.page).evaluate(
        (node) => node.scrollWidth <= node.clientWidth,
      ),
    ).toBe(true);
    await notice(run.page)
      .getByRole("button", { name: "Close notice" })
      .scrollIntoViewIfNeeded();
    await run.page.screenshot({
      path: test.info().outputPath("notice-400-zoom.png"),
    });
    await activate(
      run.page,
      notice(run.page).getByRole("button", { name: "Close notice" }),
    );
    await expect(
      run.page.getByRole("button", { name: "Safety & privacy", exact: true }),
    ).toBeFocused();
  } finally {
    await run.close();
  }
});
