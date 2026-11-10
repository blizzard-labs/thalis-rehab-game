import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { expect, test } from "@playwright/test";

for (const [title, reward] of [
  ["Star Catcher", "1 star"],
  ["Fruit Picking", "1 fruit"],
]) {
  test(`EEG-only ${title} uses the selected LSL stream and a complete resting baseline`, async ({
    page,
  }) => {
    const python = process.env.NEUROREACH_TEST_PYTHON;
    test.skip(
      !python,
      "Requires a running companion and the signal-engine environment",
    );
    test.setTimeout(180000);
    const executable = process.env.NEUROREACH_COMPANION_EXE;
    const service = executable
      ? spawn(executable, ["--port", "18768"], { stdio: "inherit" })
      : spawn(
          python!,
          ["../signal-engine/local_companion.py", "--port", "18768"],
          { stdio: "ignore" },
        );
    const host = "http://127.0.0.1:18768";
    const fixture = spawn(
      python!,
      ["../signal-engine/tests/practice_stream.py"],
      { stdio: ["pipe", "ignore", "ignore"] },
    );
    try {
      await expect
        .poll(
          async () => {
            try {
              return (await fetch(host + "/api/health")).ok;
            } catch {
              return false;
            }
          },
          { timeout: 20000 },
        )
        .toBe(true);
      await page.goto(host);
      await page.getByRole("button", { name: new RegExp(title) }).click();
      await page.getByLabel("EEG headset", { exact: true }).check();
      await page.getByRole("button", { name: "Start game" }).click();
      const select = page.getByRole("combobox", {
        name: "Headset",
        exact: true,
      });
      await expect(select).toBeVisible({ timeout: 25000 });
      await select.selectOption({ label: "UN-validation-fixture" });
      await page
        .getByRole("button", { name: "Begin resting calibration" })
        .click();
      await expect(page.getByText(/60 clean seconds/)).toBeVisible({
        timeout: 12000,
      });
      await page
        .getByRole("button", { name: "Begin play" })
        .click({ timeout: 90000 });
      fixture.stdin.write("begin\n");
      await expect(page.getByText(reward, { exact: true })).toBeVisible({
        timeout: 25000,
      });
      fixture.kill();
      await expect(
        page.getByText(/EEG signal lost|EEG disconnected/),
      ).toBeVisible({ timeout: 10000 });
      await page
        .getByRole("button", { name: "Continue with one button" })
        .click();
      await page.getByRole("button", { name: "End session" }).click();
      await expect(page.getByText("EEG headset → One button")).toBeVisible();
      const downloaded = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download", exact: true }).click();
      const record = JSON.parse(
        await readFile((await (await downloaded).path())!, "utf8"),
      );
      expect(record.feedback.count).toBeGreaterThan(5);
      expect(record.feedback.p95Ms).toBeLessThan(250);
      console.log(
        "Synthetic EEG sample to browser render callback:",
        record.feedback,
      );
    } finally {
      fixture.kill();
      service.kill();
    }
  });
}
