import { spawn } from "node:child_process";
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { attachPoseFixture } from "./poseFixture";

test("blended Garden Grow records both inputs and recovers from signal loss", async ({
  page,
}) => {
  const python = process.env.NEUROREACH_TEST_PYTHON,
    photo = process.env.NEUROREACH_POSE_FIXTURE;
  test.skip(!python || !photo, "Requires local LSL and MediaPipe pose fixture");
  test.setTimeout(170000);
  const service = spawn(
    python!,
    ["../signal-engine/local_companion.py", "--port", "18769"],
    { stdio: "ignore" },
  );
  const fixture = spawn(
    python!,
    ["../signal-engine/tests/practice_stream.py", "UN-validation-blended"],
    { stdio: ["pipe", "ignore", "ignore"] },
  );
  try {
    const host = "http://127.0.0.1:18769";
    await expect
      .poll(
        async () => {
          try {
            return (await fetch(host + "/api/health")).ok;
          } catch {
            return false;
          }
        },
        { timeout: 15000 },
      )
      .toBe(true);
    await attachPoseFixture(page, photo!);
    await page.goto(host);
    await page.getByRole("button", { name: /Garden Grow/ }).click();
    await page.getByLabel("Camera + EEG", { exact: true }).check();
    await page.getByRole("button", { name: "Start game" }).click();
    await expect(page.getByText("Arm in view")).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Set resting position" }).click();
    await page.evaluate(() => {
      Object.assign(window, { armAngle: 0.5 });
    });
    await expect(async () => {
      await page
        .getByRole("button", { name: "Set comfortable reach" })
        .click({ timeout: 1000 });
      await expect(
        page.getByRole("heading", { name: "Connect your EEG" }),
      ).toBeVisible({ timeout: 700 });
    }).toPass({ timeout: 8000 });
    await page.evaluate(() => {
      Object.assign(window, { armAngle: 0 });
    });
    await page
      .getByRole("combobox", { name: "Headset" })
      .selectOption({ label: "UN-validation-blended" });
    await page
      .getByRole("button", { name: "Begin resting calibration" })
      .click();
    await page
      .getByRole("button", { name: "Begin play" })
      .click({ timeout: 95000 });
    await expect(
      page.getByText("Imagine moving your hand as you reach, then relax."),
    ).toBeVisible({ timeout: 5000 });
    fixture.stdin.write("begin\n");
    await page.evaluate(() => {
      Object.assign(window, { armAngle: 0.5 });
    });
    await expect(page.locator("[data-testid=flower]")).toHaveAttribute(
      "data-growth",
      "0.40",
      { timeout: 12000 },
    );
    fixture.kill();
    await expect(
      page.getByText(/EEG signal lost|EEG disconnected/),
    ).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", {name:"Continue with camera",exact:true}).click();
    await page
      .getByRole("button", { name: "Continue with one button" })
      .click();
    for (let i = 0; i < 3; i++)
      await page.getByRole("button", { name: "Water" }).click();
    await page.getByRole("button", { name: "End session" }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download", exact: true }).click();
    const r = JSON.parse(
      await readFile((await (await download).path())!, "utf8"),
    );
    expect(r.sources).toEqual(["blended", "camera", "button"]);
    expect(r.measurements.blended.validSeconds).toBeGreaterThan(0);
    expect(r.rewards).toBe(1);
  } finally {
    fixture.kill();
    service.kill();
  }
});
