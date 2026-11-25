import { test, expect } from "../e2e/noticesHarness";
import { attachPoseFixture } from "../e2e/poseFixture";
import { controllerHarness, enable } from "../e2e/extensionHarness";
import AxeBuilder from "@axe-core/playwright";

test("first-use website notice explains hosting and stays accessible on a phone", async ({
  browser,
  baseURL,
}, testInfo) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  try {
    const page = await context.newPage();
    await page.goto(baseURL!);
    await page.getByRole("button", { name: /Garden Grow/ }).click();
    await page.getByRole("button", { name: "Start game" }).click();
    const notice = page.getByRole("dialog", { name: "Before you play" });
    await expect(notice).toBeVisible();
    await notice
      .getByText("Full safety, privacy & liability notice", { exact: true })
      .click();
    await expect(
      notice.getByRole("heading", { name: "Public website & hosting" }),
    ).toBeVisible();
    await expect(
      notice.getByRole("link", { name: "GitHub hosting privacy" }),
    ).toHaveAttribute("href", /docs\.github\.com/);
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
        .violations,
    ).toEqual([]);
    await notice.getByRole("button", { name: "Go back" }).click();
    await page.screenshot({
      path: testInfo.outputPath("website-setup-phone.png"),
      fullPage: true,
    });
    await expect(
      page.getByRole("button", { name: /Garden Grow/ }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test("published project paths load every game, icons and downloadable controls", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const name of [
    "Garden Grow",
    "Star Catcher",
    "River Rowing",
    "Fruit Picking",
    "Lighthouse Keeper",
  ]) {
    await page.goto("./");
    await page.getByRole("button", { name: new RegExp(name) }).click();
    await page.getByRole("button", { name: "Start game" }).click();
    const action =
      name === "Lighthouse Keeper"
        ? page.locator(".keeper-action")
        : page.getByRole("button", {
            name:
              name === "Garden Grow"
                ? "Water"
                : name === "Star Catcher"
                  ? "Catch"
                  : name === "River Rowing"
                    ? "Row"
                    : "Pick",
            exact: true,
          });
    await action.click();
    await page.getByRole("button", { name: "End session" }).click();
    await expect(page.getByText("Session complete")).toBeVisible();
  }
  await page.goto("./#library");
  await expect(page.locator(".game-library img")).toHaveCount(20);
  await expect
    .poll(() =>
      page
        .locator(".game-library img")
        .evaluateAll((images) =>
          images.every((image) => (image as HTMLImageElement).naturalWidth > 0),
        ),
    )
    .toBe(true);
  const zip = await page.request.get(
    new URL("game-controller-extension.zip", page.url()).href,
  );
  expect(zip.ok()).toBe(true);
  expect((await zip.body()).subarray(0, 2).toString()).toBe("PK");
  await page.goto("./");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("website-phone.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("public staff and EEG entry explain the companion without contacting private APIs", async ({
  page,
}, testInfo) => {
  const apis: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      apis.push(request.url());
  });
  page.on("websocket", (socket) => apis.push(socket.url()));
  await page.goto("./#staff");
  await expect(
    page.getByRole("link", { name: "Open local staff workspace" }),
  ).toHaveAttribute("href", "http://127.0.0.1:8766/#staff");
  await page.screenshot({
    path: testInfo.outputPath("website-staff.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Back to games" }).click();
  await page.getByRole("button", { name: /Garden Grow/ }).click();
  await page.getByLabel("EEG headset", { exact: true }).check();
  await page.getByRole("button", { name: "Start game" }).click();
  await expect(
    page.getByRole("link", { name: "Open local player", exact: true }),
  ).toBeVisible();
  expect(apis).toEqual([]);
});

test("public camera worker calibrates and catches a star with recorded movement", async ({
  page,
}) => {
  const fixture = process.env.NEUROREACH_POSE_FIXTURE;
  test.skip(
    !fixture,
    "A recorded pose fixture is required, not a physical camera",
  );
  await attachPoseFixture(page, fixture!);
  await page.goto("./");
  await page.getByRole("button", { name: /Star Catcher/ }).click();
  await page.getByLabel("Camera", { exact: true }).check();
  await page.getByRole("button", { name: "Start game" }).click();
  await expect(page.getByText("Arm in view")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Set resting position" }).click();
  await expect(
    page.getByRole("button", { name: "Save direction 1" }),
  ).toBeVisible();
  await page.evaluate(() => Object.assign(window, { armAngle: 0.45 }));
  const video = page.locator("video.practice-preview");
  const start = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(start + 0.7);
  await page.getByRole("button", { name: "Save direction 1" }).click();
  await page.getByRole("button", { name: "Play with 1 direction" }).click();
  await expect(page.getByText("1 star", { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "End session" }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).cameraTrack?.readyState))
    .toBe("ended");
});

test("project-scoped offline cache retains play and report downloads", async ({
  page,
  context,
}) => {
  await page.goto("./");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  const paths = await page.evaluate(async () => {
    const cache = await caches.open(
      (await caches.keys()).find((name) => name.startsWith("neuroreach-web-"))!,
    );
    return (await cache.keys()).map((request) => new URL(request.url).pathname);
  });
  expect(paths.length).toBeGreaterThan(20);
  expect(paths.every((path) => path.startsWith("/thalis-rehab-game/"))).toBe(
    true,
  );
  expect(paths.some((path) => path.includes("/api/"))).toBe(false);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("button", { name: /Garden Grow/ }).click();
  await page.getByRole("button", { name: "Start game" }).click();
  await page.getByRole("button", { name: "Water" }).click();
  await page.getByRole("button", { name: "End session" }).click();
  await page
    .getByRole("button", { name: "Session report", exact: true })
    .click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
});

test("the published website controls an external game through the actual extension", async ({
  baseURL,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Desktop Chromium extension");
  const website = "https://blizzard-labs.github.io/thalis-rehab-game";
  const run = await controllerHarness(
    website,
    async (context) => {
      if (!process.env.NEUROREACH_WEBSITE_URL)
        await context.route(website + "/**", async (route) => {
          const url = new URL(route.request().url());
          const response = await route.fetch({
            url: new URL(url.pathname + url.search, new URL(baseURL!).origin)
              .href,
          });
          await route.fulfill({ response });
        });
    },
    false,
    process.env.NEUROREACH_WEBSITE_URL ? "allow" : "block",
  );
  try {
    // An extension-created window can navigate before test routing attaches.
    // Reload only for the local mock; the live run checks its first navigation.
    if (!process.env.NEUROREACH_WEBSITE_URL) await run.controller.reload();
    await expect(run.controller.getByText(/^Game connected\./)).toBeVisible();
    await run.controller.getByRole("button", { name: "Set up input" }).click();
    await enable(run.controller);
    await run.controller
      .getByRole("button", { name: "→ Right", exact: true })
      .click();
    await expect
      .poll(async () =>
        (await run.events()).some(
          (event) => event.trusted && event.key === "ArrowRight",
        ),
      )
      .toBe(true);
  } finally {
    await run.close();
  }
});
