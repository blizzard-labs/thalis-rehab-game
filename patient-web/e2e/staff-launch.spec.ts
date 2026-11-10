import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const host = "http://127.0.0.1:18773";
let service: ChildProcess, directory: string;
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const python = process.env.NEUROREACH_TEST_PYTHON;
  test.skip(!python, "Requires the local companion");
  directory = await mkdtemp(path.join(os.tmpdir(), "nr-staff-launch-"));
  service = spawn(
    python!,
    ["../signal-engine/local_companion.py", "--port", "18773"],
    {
      env: { ...process.env, NEUROREACH_DATA_DIR: directory },
      stdio: "ignore",
    },
  );
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
});
test.afterAll(async () => {
  if (!service) return;
  const stopped = new Promise((resolve) => service.once("exit", resolve));
  service.kill();
  if (service.exitCode === null && service.signalCode === null) await stopped;
  await rm(directory, { recursive: true, force: true });
});

async function openStaff(page: Page) {
  await page.goto(host);
  await page.getByRole("button", { name: "Staff workspace" }).click();
  await page.getByLabel("Staff password").fill("disposable-staff-station");
  await page.getByRole("button", { name: /^(Set password|Unlock)$/ }).click();
}

test("staff reload recovers the local patient, score and controls in the same visit", async ({
  page,
}) => {
  await openStaff(page);
  await page.getByLabel("Participant label").fill("Launch fixture");
  await page.getByLabel(/Participant agreed/).check();
  await page.getByRole("button", { name: "Add participant" }).click();
  await page.getByRole("button", { name: "Start supervised session" }).click();
  for (let i = 0; i < 4; i++)
    await page.getByRole("button", { name: "Water", exact: true }).click();
  await expect(
    page.getByText("1 bloom", { exact: true }).first(),
  ).toBeVisible();
  const id = (
    await (await page.request.get(host + "/api/staff/participants")).json()
  )[0].id;
  const visits = async () =>
    await (
      await page.request.get(host + "/api/staff/participants/" + id)
    ).json();
  await expect.poll(async () => (await visits())[0]?.record.actions).toBe(4);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Water", exact: true }),
  ).toBeDisabled({ timeout: 6000 });
  await page.getByRole("button", { name: "Resume patient game" }).click();
  await page.getByRole("button", { name: "Water", exact: true }).click();
  await page.getByRole("button", { name: "End session", exact: true }).click();
  await expect.poll(async () => (await visits())[0]?.status).toBe("complete");
  const saved = await visits();
  expect(saved).toHaveLength(1);
  expect(saved[0].record.actions).toBe(5);
});
