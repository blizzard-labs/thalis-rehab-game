import { expect, test, type Page } from "@playwright/test";
import { attachPoseFixture } from "./poseFixture";

function pose(page: Page, angle: number) {
  return page.evaluate((value) => {
    Object.assign(window, { armAngle: value });
  }, angle);
}

// Let the calibration camera display several frames of the requested pose before sampling it.
async function settlePreview(page: Page) {
  const preview = page.locator("video.practice-preview");
  const start = await preview.evaluate(
    (video: HTMLVideoElement) => video.currentTime,
  );
  await expect
    .poll(() =>
      preview.evaluate((video: HTMLVideoElement) => video.currentTime),
    )
    .toBeGreaterThan(start + 0.5);
}

for (const secondDirection of [false, true]) {
  const mode = secondDirection ? "two directions" : "one direction";
  test(`camera stars move and can be caught with ${mode} of calibrated reach`, async ({
    page,
  }) => {
    const fixture = process.env.NEUROREACH_POSE_FIXTURE;
    test.skip(!fixture, "Provide a local MediaPipe pose.jpg test fixture");
    await attachPoseFixture(page, fixture!);
    await page.goto("/");
    await page.getByRole("button", { name: /Star Catcher/ }).click();
    await page.getByLabel("Camera", { exact: true }).check();
    await page.getByRole("button", { name: "Start game" }).click();
    await expect(page.getByText("Arm in view")).toBeVisible({ timeout: 12000 });
    await page.getByRole("button", { name: "Set resting position" }).click();
    await pose(page, 0.45);
    await settlePreview(page);
    if (secondDirection) {
      await page
        .getByRole("button", { name: "Save reach and add a second direction" })
        .click();
      await page.getByRole("button", { name: "Set second direction" }).click();
      await expect(page.getByRole("alert")).toHaveText(/different direction/);
      await pose(page, -0.45);
      await settlePreview(page);
      await page.getByRole("button", { name: "Set second direction" }).click();
    } else {
      await page.getByRole("button", { name: "Set comfortable reach" }).click();
    }
    const ready = page.getByText(
      "Guide the net to the star and hold, then return to rest.",
    );
    const goal = page.getByTestId("reach-goal");
    await pose(page, 0);
    await expect(ready).toBeVisible();
    const first = (await goal.getAttribute("transform"))!;
    await pose(page, 0.45);
    await expect(page.getByText("1 star", { exact: true })).toBeVisible({
      timeout: 8000,
    });
    await expect(goal).not.toHaveAttribute("transform", first);
    await pose(page, 0);
    await expect(ready).toBeVisible();
    await pose(page, secondDirection ? -0.23 : 0.2);
    await expect(page.getByText("2 stars", { exact: true })).toBeVisible({
      timeout: 8000,
    });
    await page.getByRole("button", { name: "End session" }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as Window & { cameraTrack?: MediaStreamTrack }).cameraTrack
              ?.readyState,
        ),
      )
      .toBe("ended");
  });
}
