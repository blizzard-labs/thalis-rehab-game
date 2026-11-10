import { expect, test } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("isolated staff station records actions, exports reports and locks the roster", async ({
  page,
}) => {
  const python = process.env.NEUROREACH_TEST_PYTHON;
  test.skip(!python, "Requires the local Python companion and built web app");
  const root = await mkdtemp(path.join(os.tmpdir(), "neuroreach-staff-test-"));
  const service = spawn(
    python!,
    ["../signal-engine/local_companion.py", "--port", "18766"],
    { env: { ...process.env, NEUROREACH_DATA_DIR: root }, stdio: "ignore" },
  );
  try {
    await expect
      .poll(
        async () => {
          try {
            return (await fetch("http://127.0.0.1:18766/api/staff/state")).ok;
          } catch {
            return false;
          }
        },
        { timeout: 15000 },
      )
      .toBe(true);
    await page.goto("http://127.0.0.1:18766");
    await page.getByRole("button", { name: "Staff workspace" }).click();
    await page.getByLabel("Staff password").fill("test-station-passphrase");
    await page.getByRole("button", { name: "Set password" }).click();
    await page.getByLabel("Participant label").fill("Station test user");
    await page.getByLabel(/Participant agreed/).check();
    await page.getByRole("button", { name: "Add participant" }).click();
    await page
      .getByRole("button", { name: "Start supervised session" })
      .click();
    for (let i = 0; i < 4; i++)
      await page.getByRole("button", { name: "Water" }).click();
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await page.getByRole("button", { name: "End session" }).click();
    await expect(page.getByText(/4 actions/)).toBeVisible();
    await page
      .getByRole("button", { name: "Session report", exact: true })
      .click();
    const reader = page.getByRole("dialog", { name: "Session report" });
    await expect(
      reader.getByRole("table", { name: "Practice timeline" }),
    ).toBeVisible();
    await expect(
      reader.getByText(/4 logged actions produced 1 bloom/),
    ).toBeVisible();
    await reader.getByRole("button", { name: "Close report" }).click();
    await page.getByRole("button", { name: "Progress report" }).click();
    const trends = page.getByRole("dialog", { name: "Longitudinal report" });
    await expect(trends.getByText(/1 completed visit/)).toBeVisible();
    await trends.getByLabel("Game", { exact: true }).selectOption("stars");
    await expect(trends.getByText(/0 completed visits/)).toBeVisible();
    await trends.getByRole("button", { name: "Close report" }).click();
    const csv = await page
      .getByRole("link", { name: "Event CSV" })
      .getAttribute("href");
    const report = await page.request.get("http://127.0.0.1:18766" + csv);
    expect(await report.text()).toContain("Rewards,1");
    await page.getByRole("button", { name: "Lock workstation" }).click();
    await expect(page.getByRole("button", { name: "Unlock" })).toBeVisible();
    expect(
      (await page.request.get("http://127.0.0.1:18766" + csv)).status(),
    ).toBe(401);
  } finally {
    const finished = new Promise((resolve) => service.once("exit", resolve));
    service.kill();
    if (service.exitCode === null && service.signalCode === null)
      await finished;
    await rm(root, { recursive: true, force: true });
  }
});

test("staff controls a separate patient screen and receives its final trial count", async ({
  browser,
  page,
}) => {
  const python = process.env.NEUROREACH_TEST_PYTHON;
  test.skip(!python, "Requires the local Python companion and built web app");
  const root = await mkdtemp(path.join(os.tmpdir(), "neuroreach-pair-test-"));
  const service = spawn(
    python!,
    ["../signal-engine/local_companion.py", "--port", "18767"],
    { env: { ...process.env, NEUROREACH_DATA_DIR: root }, stdio: "ignore" },
  );
  const patient = await browser.newContext();
  try {
    const host = "http://127.0.0.1:18767";
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
    await page.goto(host);
    await page.getByRole("button", { name: "Staff workspace" }).click();
    await page.getByLabel("Staff password").fill("test-display-passphrase");
    await page.getByRole("button", { name: "Set password" }).click();
    await page.getByLabel("Participant label").fill("Local fixture");
    await page.getByLabel(/Participant agreed/).check();
    await page.getByRole("button", { name: "Add participant" }).click();
    await page.getByRole("button", { name: "Pair a patient display" }).click();
    const url = await page
      .getByRole("link", { name: "Open patient display" })
      .getAttribute("href");
    const player = await patient.newPage();
    await player.goto(url!);
    await player.getByRole("button", { name: "Pair this display" }).click();
    await page.getByRole("button", { name: "Start patient game" }).click();
    const water = player.getByRole("button", { name: "Water" });
    for (let i = 0; i < 4; i++) await water.click();
    await player.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Resume patient game" }),
    ).toBeVisible();
    await player.reload();
    await expect(water).toBeDisabled();
    await page.getByRole("button", { name: "Resume patient game" }).click();
    await expect(water).toBeEnabled();
    await page.getByRole("button", { name: "Pause patient game" }).click();
    await expect(water).toBeDisabled();
    await page.getByRole("button", { name: "Resume patient game" }).click();
    await expect(water).toBeEnabled();
    await patient.setOffline(true);
    await expect(player.getByRole("alert")).toContainText(
      "Display disconnected",
      { timeout: 12000 },
    );
    await expect(water).toBeDisabled();
    await patient.setOffline(false);
    await expect(
      page.getByRole("button", { name: "Resume patient game" }),
    ).toBeVisible();
    await expect(water).toBeDisabled();
    await page.getByRole("button", { name: "Resume patient game" }).click();
    await expect(water).toBeEnabled();
    await expect(page.getByText(/4 actions · 1 rewards/)).toBeVisible();
    await page.getByRole("button", { name: "End display session" }).click();
    await expect(
      player.getByRole("heading", { name: "Session complete" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Return to roster" }).click();
    await expect(page.getByText(/complete · .*4 actions/)).toBeVisible();
    expect(
      (await player.request.get(host + "/api/staff/participants")).status(),
    ).toBe(401);
  } finally {
    await patient.close();
    const finished = new Promise((resolve) => service.once("exit", resolve));
    service.kill();
    if (service.exitCode === null && service.signalCode === null)
      await finished;
    await rm(root, { recursive: true, force: true });
  }
});
