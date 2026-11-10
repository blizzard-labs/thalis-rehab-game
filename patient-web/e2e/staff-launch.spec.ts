import { attachPoseFixture } from "./poseFixture";
import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const host = "http://127.0.0.1:18773";
let service: ChildProcess, directory: string;
test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  const python = process.env.NEUROREACH_TEST_PYTHON;
  test.skip(!python, "Requires the local companion");
  directory = await mkdtemp(path.join(os.tmpdir(), "nr-staff-launch-"));
  const packaged = process.env.NEUROREACH_COMPANION_EXE;
  service = spawn(
    packaged ?? python!,
    [...(packaged ? [] : ["../signal-engine/local_companion.py"]), "--port", "18773"],
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
      { timeout: 25000 },
    )
    .toBe(true);
  await request.post(host + "/api/staff/setup", {
    data: { password: "disposable-staff-station" },
  });
  await request.post(host + "/api/staff/participants", {
    data: { name: "Launch fixture", side: "left", consent: true },
  });
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
  await expect(
    page.getByRole("heading", { name: "Patient roster" }),
  ).toBeVisible();
}

test("staff reload recovers the local patient, score and controls in the same visit", async ({
  page,
}) => {
  await openStaff(page);
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

test("each game launches on this computer with the selected protocol and patient", async ({
  page,
}) => {
  await openStaff(page);
  const roster = await (
    await page.request.get(host + "/api/staff/participants")
  ).json();
  const pid = roster[0].id;
  const visits = async () =>
    await (
      await page.request.get(host + "/api/staff/participants/" + pid)
    ).json();
  const start = (await visits()).length;
  for (const [index, [game, title]] of (
    [
      ["garden", "Garden Grow"],
      ["stars", "Star Catcher"],
      ["river", "River Rowing"],
      ["fruit", "Fruit Picking"],
      ["keeper", "Lighthouse Keeper"],
    ] as const
  ).entries()) {
    await page.getByLabel("Game", { exact: true }).selectOption(game);
    await page
      .getByRole("button", { name: "Start supervised session" })
      .click();
    await expect(
      page
        .locator(".station-player")
        .getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    const station = await (
      await page.request.get(host + "/api/staff/display")
    ).json();
    expect(station.participant).toBe(pid);
    expect(station.game).toBe(game);
    await page
      .getByRole("button", { name: "End session", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Session setup" }),
    ).toBeVisible();
    const saved = await visits();
    expect(saved.length).toBe(start + index + 1);
    expect(saved[0].record.id).toBe(station.session);
    expect(saved[0].status).toBe("complete");
  }
});

test("staff can recover a sensor setup on the workstation and finish the same run with one button", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: () =>
          Promise.reject(new DOMException("Declined", "NotAllowedError")),
      },
    }),
  );
  await openStaff(page);
  for (const input of ["camera", "eeg", "blended"]) {
    await page.getByLabel("Input", { exact: true }).selectOption(input);
    await page
      .getByRole("button", { name: "Start supervised session" })
      .click();
    const setup = page.locator(".station-player");
    await expect(
      setup.getByRole("button", { name: "End session", exact: true }),
    ).toBeVisible();
    const started = await (
      await page.request.get(host + "/api/staff/display")
    ).json();
    expect(started.source).toBe(input);
    await page
      .getByRole("button", { name: "Switch patient to one button" })
      .click();
    await setup.getByRole("button", { name: "Water", exact: true }).click();
    await setup
      .getByRole("button", { name: "End session", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Session setup" }),
    ).toBeVisible();
    const runs = await (
      await page.request.get(
        host + "/api/staff/participants/" + started.participant,
      )
    ).json();
    expect(runs[0].record.sources).toEqual([input, "button"]);
    expect(runs[0].record.actions).toBe(1);
    expect(runs[0].record.id).toBe(started.session);
  }
});

test("live workstation monitor receives fresh synthetic EEG and saves its measurements", async ({
  page,
}) => {
  test.setTimeout(150000);
  const stream = "UN-supervised-dashboard";
  const fixture = spawn(
    process.env.NEUROREACH_TEST_PYTHON!,
    ["../signal-engine/tests/practice_stream.py", stream],
    { stdio: ["pipe", "ignore", "ignore"] },
  );
  try {
    await openStaff(page);
    await page.getByLabel("Game", { exact: true }).selectOption("river");
    await page.getByLabel("Input", { exact: true }).selectOption("eeg");
    await page
      .getByRole("button", { name: "Start supervised session" })
      .click();
    const game = page.locator(".station-player");
    try {
      await game
        .getByRole("combobox", { name: "Headset", exact: true })
        .selectOption({ label: stream }, { timeout: 20000 });
    } catch (err) {
      throw new Error("Headset setup: " + (await game.innerText()), {
        cause: err,
      });
    }
    await game
      .getByRole("button", { name: "Begin resting calibration" })
      .click();
    await game
      .getByRole("button", { name: "Begin play" })
      .click({ timeout: 95000 });
    fixture.stdin.write("begin\n");
    await expect(game.getByText("1 stroke", { exact: true })).toBeVisible({
      timeout: 20000,
    });
    await expect
      .poll(async () => {
        const d = await (
          await page.request.get(host + "/api/staff/display")
        ).json();
        return (
          typeof d.telemetry?.eegLevel === "number" &&
          d.trace.some((p: { eeg: number | null }) => p.eeg !== null) &&
          d.record?.measurements.eeg?.validSeconds > 0 &&
          d.record.usedSyntheticEeg
        );
      })
      .toBeTruthy();
    await expect(page.locator(".cl-sensors")).toContainText(
      "rest-calibrated band power",
    );
    await page.getByRole("button", { name: "End supervised run" }).click();
    await expect(
      page.getByRole("heading", { name: "Session history" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("row")
        .filter({ hasText: "River Rowing" })
        .filter({ hasText: "Synthetic EEG" }),
    ).toContainText("complete");
  } finally {
    fixture.kill();
  }
});

test("camera calibration supplies live movement data and staff fallback releases the camera", async ({
  page,
}) => {
  const image = process.env.NEUROREACH_POSE_FIXTURE;
  test.skip(!image, "Requires local MediaPipe pose fixture");
  await attachPoseFixture(page, image!);
  await openStaff(page);
  await page.getByLabel("Game", { exact: true }).selectOption("garden");
  await page.getByLabel("Input", { exact: true }).selectOption("camera");
  await page.getByRole("button", { name: "Start supervised session" }).click();
  const game = page.locator(".station-player");
  await expect(game.getByText("Arm in view")).toBeVisible({ timeout: 12000 });
  await game.getByRole("button", { name: "Set resting position" }).click();
  await page.evaluate(() => Object.assign(window, { armAngle: 0.5 }));
  await expect(async () => {
    await game
      .getByRole("button", { name: "Set comfortable reach" })
      .click({ timeout: 1200 });
    await expect(game.getByTestId("camera-feed")).toBeVisible({ timeout: 700 });
  }).toPass({ timeout: 9000 });
  await expect
    .poll(async () => {
      const d = await (
        await page.request.get(host + "/api/staff/display")
      ).json();
      return (
        d.trace.some((p: { camera: number | null }) => p.camera !== null) &&
        d.record.intervals.some(
          (r: { metrics: { elbow?: unknown } }) => r.metrics.elbow,
        )
      );
    })
    .toBeTruthy();
  await page
    .getByRole("button", { name: "Switch patient to one button" })
    .click();
  await game.getByRole("button", { name: "Water", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { cameraTrack?: MediaStreamTrack }).cameraTrack
            ?.readyState,
      ),
    )
    .toBe("ended");
  await game.getByRole("button", { name: "End session", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Session history" }),
  ).toBeVisible();
});

test("locking a running workstation hides the roster and unlock restores the same paused visit", async ({
  page,
}) => {
  await openStaff(page);
  await page.getByLabel("Game", { exact: true }).selectOption("fruit");
  await page.getByLabel("Input", { exact: true }).selectOption("button");
  await page.getByRole("button", { name: "Start supervised session" }).click();
  const player = page.locator(".station-player");
  await player.getByRole("button", { name: "Pick", exact: true }).click();
  const current = async () =>
    await (await page.request.get(host + "/api/staff/display")).json();
  await expect.poll(async () => (await current()).record.actions).toBe(1);
  const sid = (await current()).session;
  await page.getByRole("button", { name: "Lock workstation" }).click();
  await expect(page.getByRole("button", { name: "Unlock" })).toBeVisible();
  expect((await page.request.get(host + "/api/staff/display")).status()).toBe(
    401,
  );
  await page.getByLabel("Staff password").fill("disposable-staff-station");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(
    player.getByRole("button", { name: "Place in basket", exact: true }),
  ).toBeDisabled();
  expect((await current()).session).toBe(sid);
  await page.getByRole("button", { name: "Resume patient game" }).click();
  await player
    .getByRole("button", { name: "Place in basket", exact: true })
    .click();
  await player
    .getByRole("button", { name: "End session", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Session setup" }),
  ).toBeVisible();
  expect((await current()).record.rewards).toBe(1);
});
