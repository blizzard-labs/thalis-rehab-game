import { attachPoseFixture } from "./poseFixture";
import {
  test,
  expect,
  type Page,
  type Browser,
  type BrowserContext,
} from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const host = "http://127.0.0.1:18773";
let service: ChildProcess, directory: string;
const patients: BrowserContext[] = [];
test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  const python = process.env.NEUROREACH_TEST_PYTHON;
  test.skip(!python, "Requires the local companion");
  directory = await mkdtemp(path.join(os.tmpdir(), "nr-staff-launch-"));
  const packaged = process.env.NEUROREACH_COMPANION_EXE;
  service = spawn(
    packaged ?? python!,
    [
      ...(packaged ? [] : ["../signal-engine/local_companion.py"]),
      "--port",
      "18773",
      "--display-host",
      "127.0.0.1",
      "--display-port",
      "18774",
    ],
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
test.afterEach(async () => {
  await Promise.all(patients.splice(0).map((context) => context.close()));
});
test.afterAll(async () => {
  if (!service) return;
  const stopped = new Promise((resolve) => service.once("exit", resolve));
  service.kill();
  if (service.exitCode === null && service.signalCode === null) await stopped;
  await rm(directory, { recursive: true, force: true });
});

async function openStaff(page: Page) {
  await page.goto(host + "/#staff");
  await page.getByLabel("Staff password").fill("disposable-staff-station");
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Patient roster" }),
  ).toBeVisible();
}

async function join(
  page: Page,
  browser: Browser,
  prepare?: (patient: Page) => Promise<void>,
) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  patients.push(context);
  const player = await context.newPage();
  if (prepare) await prepare(player);
  const url = await page.getByLabel("Patient session link").inputValue();
  expect(url).toMatch(/^https:\/\/127\.0\.0\.1:18774\/#display=/);
  await expect(page.getByAltText("Patient pairing QR code")).toBeVisible();
  await player.goto(url);
  await player.getByRole("button", { name: "Pair this display" }).click();
  await expect(
    page.getByRole("button", { name: "Start patient game" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Start patient game" }).click();
  return player;
}

async function current(page: Page) {
  return (await page.request.get(host + "/api/staff/display")).json();
}
async function finish(page: Page) {
  await page.getByRole("button", { name: "End supervised run" }).click();
  await page.getByRole("button", { name: "Return to roster" }).click();
  await expect(
    page.getByRole("heading", { name: "Session history" }),
  ).toBeVisible();
}
const preview = (page: Page) =>
  page.frameLocator('iframe[title="Live patient screen"]');

test("patient plays through HTTPS while the clinician receives the actual screen and reloads safely", async ({
  page,
  browser,
}) => {
  await openStaff(page);
  await page.getByRole("button", { name: "Start supervised session" }).click();
  expect(await page.locator(".station-player").count()).toBe(0);
  const player = await join(page, browser);
  const water = player.getByRole("button", { name: "Water", exact: true });
  for (let i = 0; i < 4; i++) await water.click();
  await expect(preview(page).locator(".game-score")).toHaveText("1 bloom");
  await expect.poll(async () => (await current(page)).record.actions).toBe(4);
  const id = (await current(page)).session;
  await page.reload();
  await expect(preview(page).locator(".game-score")).toHaveText("1 bloom");
  await expect(water).toBeEnabled();
  await page.getByRole("button", { name: "Pause patient game" }).click();
  await expect(water).toBeDisabled();
  await expect(preview(page).locator(".live-game")).toHaveAttribute(
    "data-paused",
    "true",
  );
  await page.getByRole("button", { name: "Resume patient game" }).click();
  await water.click();
  await expect.poll(async () => (await current(page)).record.actions).toBe(5);
  expect((await current(page)).session).toBe(id);
  await finish(page);
  await expect(
    player.getByRole("heading", { name: "Session complete" }),
  ).toBeVisible();
  expect((await current(page)).record.actions).toBe(5);
  expect(
    (
      await player.request.get("https://127.0.0.1:18774/api/staff/participants")
    ).status(),
  ).toBe(403);
});

test("moving patient screen updates in place at interactive speed", async ({
  page,
  browser,
}) => {
  await openStaff(page);
  await page.getByLabel("Game", { exact: true }).selectOption("stars");
  await page.getByRole("button", { name: "Start supervised session" }).click();
  const player = await join(page, browser);
  await expect(preview(page).locator("h1")).toHaveText("Star Catcher");

  // A timestamp beside the score lets us measure what a clinician actually sees,
  // including the wait for the next frame, with no dependency on an EEG stream.
  await player.locator(".game-score").evaluate((score) => {
    const stamp = document.createElement("span");
    stamp.id = "mirror-timing";
    score.after(stamp);
    window.setInterval(() => {
      stamp.textContent = String(Date.now());
    }, 50);
  });
  const stamp = preview(page).locator("#mirror-timing");
  await expect(stamp).toHaveText(/^\d+$/);
  const result = await page
    .locator('iframe[title="Live patient screen"]')
    .evaluate(
      (el) =>
        new Promise<{
          changes: number;
          sameHeading: boolean;
          p95Age: number;
        }>((resolve) => {
          const doc = (el as HTMLIFrameElement).contentDocument!;
          const heading = doc.querySelector("h1");
          const start = performance.now(),
            ages: number[] = [];
          const values = new Set<string>();
          function sample() {
            const value = doc.querySelector("#mirror-timing")?.textContent;
            if (value) {
              values.add(value);
              ages.push(Date.now() - Number(value));
            }
            if (performance.now() - start < 2000) requestAnimationFrame(sample);
            else
              resolve({
                changes: values.size,
                sameHeading: heading === doc.querySelector("h1"),
                p95Age: ages.sort((a, b) => a - b)[
                  Math.floor(ages.length * 0.95)
                ],
              });
          }
          requestAnimationFrame(sample);
        }),
    );
  expect(result.sameHeading).toBe(true);
  expect(result.changes).toBeGreaterThan(14);
  expect(result.p95Age).toBeLessThan(220);
  await finish(page);
});

test("each game opens only on the paired patient screen and appears in the clinician mirror", async ({
  page,
  browser,
}) => {
  await openStaff(page);
  for (const [game, title] of [
    ["garden", "Garden Grow"],
    ["stars", "Star Catcher"],
    ["river", "River Rowing"],
    ["fruit", "Fruit Picking"],
    ["keeper", "Lighthouse Keeper"],
  ]) {
    await page.getByLabel("Game", { exact: true }).selectOption(game);
    await page
      .getByRole("button", { name: "Start supervised session" })
      .click();
    const player = await join(page, browser);
    await expect(
      player.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await expect(
      preview(page).locator("h1").filter({ hasText: title }),
    ).toBeVisible();
    expect((await current(page)).game).toBe(game);
    await finish(page);
    await player.context().close();
  }
});

test("staff can switch remote camera, EEG and blended setup to one button in the same visit", async ({
  page,
  browser,
}) => {
  await openStaff(page);
  await page.getByLabel("Game", { exact: true }).selectOption("garden");
  for (const input of ["camera", "eeg", "blended"]) {
    await page.getByLabel("Input", { exact: true }).selectOption(input);
    await page
      .getByRole("button", { name: "Start supervised session" })
      .click();
    const player = await join(page, browser, async (patient) =>
      patient.addInitScript(() => {
        Object.defineProperty(navigator, "mediaDevices", {
          configurable: true,
          value: {
            getUserMedia: () =>
              Promise.reject(new DOMException("Declined", "NotAllowedError")),
          },
        });
      }),
    );
    const id = (await current(page)).session;
    await expect(
      player.getByRole("button", { name: "End session", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Switch patient to one button" })
      .click();
    await player.getByRole("button", { name: "Water", exact: true }).click();
    await expect.poll(async () => (await current(page)).record.actions).toBe(1);
    await finish(page);
    const run = await current(page);
    expect(run.record.sources).toEqual([input, "button"]);
    expect(run.session).toBe(id);
    await player.context().close();
  }
});

test("live remote monitor receives synthetic EEG, mirrors the stroke and saves its measurements", async ({
  page,
  browser,
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
    const player = await join(page, browser);
    await player
      .getByRole("combobox", { name: "Headset", exact: true })
      .selectOption({ label: stream }, { timeout: 20000 });
    await player
      .getByRole("button", { name: "Begin resting calibration" })
      .click();
    await player
      .getByRole("button", { name: "Begin play" })
      .click({ timeout: 95000 });
    fixture.stdin.write("begin\n");
    await expect(player.getByText("1 stroke", { exact: true })).toBeVisible({
      timeout: 20000,
    });
    await expect(preview(page).locator(".game-score")).toHaveText("1 stroke");
    await expect
      .poll(async () => {
        const d = await current(page);
        return (
          typeof d.telemetry?.eegLevel === "number" &&
          d.trace.some((p: { eeg: number | null }) => p.eeg !== null) &&
          d.record?.measurements.eeg?.validSeconds > 0 &&
          d.record.usedSyntheticEeg
        );
      })
      .toBeTruthy();
    await finish(page);
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

test("patient camera setup and video preview are mirrored and fallback releases the camera", async ({
  page,
  browser,
}) => {
  const image = process.env.NEUROREACH_POSE_FIXTURE;
  test.skip(!image, "Requires local MediaPipe pose fixture");
  await openStaff(page);
  await page.getByLabel("Game", { exact: true }).selectOption("garden");
  await page.getByLabel("Input", { exact: true }).selectOption("camera");
  await page.getByRole("button", { name: "Start supervised session" }).click();
  const player = await join(page, browser, (patient) =>
    attachPoseFixture(patient, image!),
  );
  await expect(player.getByText("Arm in view")).toBeVisible({ timeout: 12000 });
  await expect(
    preview(page).locator("img[alt='Patient camera preview']").first(),
  ).toHaveAttribute("src", /^data:image/);
  await player.getByRole("button", { name: "Set resting position" }).click();
  await player.evaluate(() => Object.assign(window, { armAngle: 0.5 }));
  await expect(async () => {
    await player
      .getByRole("button", { name: "Set comfortable reach" })
      .click({ timeout: 1200 });
    await expect(player.getByTestId("camera-feed")).toBeVisible({
      timeout: 700,
    });
  }).toPass({ timeout: 9000 });
  await page
    .getByRole("button", { name: "Switch patient to one button" })
    .click();
  await player.getByRole("button", { name: "Water", exact: true }).click();
  await expect
    .poll(() =>
      player.evaluate(
        () =>
          (window as Window & { cameraTrack?: MediaStreamTrack }).cameraTrack
            ?.readyState,
      ),
    )
    .toBe("ended");
  await finish(page);
});

test("locking the clinician console pauses the remote patient and restores the same mirror after unlock", async ({
  page,
  browser,
}) => {
  await openStaff(page);
  await page.getByLabel("Game", { exact: true }).selectOption("fruit");
  await page.getByLabel("Input", { exact: true }).selectOption("button");
  await page.getByRole("button", { name: "Start supervised session" }).click();
  const player = await join(page, browser);
  await player.getByRole("button", { name: "Pick", exact: true }).click();
  await expect.poll(async () => (await current(page)).record.actions).toBe(1);
  const id = (await current(page)).session;
  await page.getByRole("button", { name: "Lock workstation" }).click();
  await expect(page.getByRole("button", { name: "Unlock" })).toBeVisible();
  await expect(
    player.getByRole("button", { name: "Place in basket", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Staff password").fill("disposable-staff-station");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(preview(page).locator("h1")).toHaveText("Fruit Picking");
  expect((await current(page)).session).toBe(id);
  await page.getByRole("button", { name: "Resume patient game" }).click();
  await player
    .getByRole("button", { name: "Place in basket", exact: true })
    .click();
  await finish(page);
  expect((await current(page)).record.rewards).toBe(1);
});

test("a replacement patient link recovers a disconnected device without creating another visit", async ({
  page,
  browser,
}) => {
  await openStaff(page);
  await page.getByLabel("Game", { exact: true }).selectOption("garden");
  await page.getByRole("button", { name: "Start supervised session" }).click();
  const player = await join(page, browser);
  await player.getByRole("button", { name: "Water", exact: true }).click();
  await expect.poll(async () => (await current(page)).record.actions).toBe(1);
  const id = (await current(page)).session;
  await player.context().close();
  await page
    .getByRole("button", { name: "Reconnect patient device" })
    .click({ timeout: 12000 });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  patients.push(context);
  const replacement = await context.newPage();
  await replacement.goto(
    await page.getByLabel("Patient session link").inputValue(),
  );
  await replacement.getByRole("button", { name: "Pair this display" }).click();
  await expect(
    replacement.getByRole("button", { name: "Water", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Resume patient game" }).click();
  await replacement.getByRole("button", { name: "Water", exact: true }).click();
  await expect.poll(async () => (await current(page)).record.actions).toBe(2);
  await finish(page);
  expect((await current(page)).session).toBe(id);
});

test("untrusted patient markup stays inside a noninteractive mirror with scripts disabled", async ({
  page,
  browser,
}) => {
  await openStaff(page);
  await page.getByRole("button", { name: "Start supervised session" }).click();
  const url = await page.getByLabel("Patient session link").inputValue();
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  patients.push(context);
  const player = await context.newPage();
  await player.goto(url);
  const response = await context.request.post(
    "https://127.0.0.1:18774/api/display/claim",
    { data: { code: url.split("#display=")[1] } },
  );
  const token = (await response.json()).token;
  await player.evaluate(
    (token) =>
      new Promise<void>((resolve, reject) => {
        const ws = new WebSocket("wss://127.0.0.1:18774/api/display/mirror");
        ws.onopen = () => ws.send(JSON.stringify({ token }));
        ws.onerror = () => reject(Error("Mirror test failed to connect"));
        ws.onmessage = () => {
          ws.send(
            JSON.stringify({
              type: "frame",
              width: 800,
              height: 600,
              css: "",
              html: '<p id="mirror-content">Recorded scene</p><script>window.mirrorInjected=true</script><meta http-equiv="refresh" content="0;url=/"><img src="bad" onerror="window.mirrorInjected=true">',
            }),
          );
          resolve();
        };
      }),
    token,
  );
  await expect(preview(page).locator("#mirror-content")).toHaveText(
    "Recorded scene",
  );
  await expect(
    preview(page).locator("#patient-screen script, #patient-screen meta"),
  ).toHaveCount(0);
  expect(
    await page
      .locator('iframe[title="Live patient screen"]')
      .evaluate(
        (node) =>
          (node as HTMLIFrameElement).contentWindow &&
          (node as HTMLIFrameElement).contentWindow![
            "mirrorInjected" as keyof Window
          ],
      ),
  ).toBeUndefined();
  await page.getByRole("button", { name: "Cancel invitation" }).click();
  await page.getByRole("button", { name: "Return to roster" }).click();
});
