import { expect, test } from "@playwright/test";
import { attachPoseFixture } from "./poseFixture";

// Set NEUROREACH_POSE_FIXTURE to the MediaPipe pose.jpg test image to exercise
// the full video pipeline without granting a physical camera permission.
test("real landmark inference calibrates a reach, catches a star and stops the track", async ({
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
  await page.evaluate(() => {
    Object.assign(window, { armAngle: 0.45 });
  });
  await expect(async () => {
    await page
      .getByRole("button", { name: "Set comfortable reach" })
      .click({ timeout: 1000 });
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible({
      timeout: 700,
    });
  }).toPass({ timeout: 8000 });
  await page.evaluate(
    () => Object.assign(window, { armAngle: 0 }) && undefined,
  );
  await expect(
    page.getByText("Reach to your comfortable position, then return to rest."),
  ).toBeVisible();
  await page.evaluate(
    () => Object.assign(window, { armAngle: 0.45 }) && undefined,
  );
  await expect(page.getByText(/1 star/)).toBeVisible({ timeout: 8000 });
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
