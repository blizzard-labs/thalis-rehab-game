import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { controllerHarness, enable } from "./extensionHarness";
import { attachPoseFixture } from "./poseFixture";

test.beforeEach(({ browserName }) => {
  test.skip(
    browserName !== "chromium",
    "The extension targets desktop Chromium browsers",
  );
});

test("extension sends trusted keys and pointer events into a cross-origin game and stops on tab switches", async () => {
  const run = await controllerHarness();
  try {
    const { controller, library } = run;
    await controller.setViewportSize({ width: 490, height: 840 });
    await controller.getByRole("button", { name: "Set up input" }).click();
    expect(
      (
        await new AxeBuilder({ page: controller })
          .withTags(["wcag2a", "wcag2aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await controller.screenshot({
      path: test.info().outputPath("controller.png"),
      fullPage: true,
    });
    const duplicate = await run.context.newPage();
    await duplicate.goto("http://127.0.0.1:5173/#game-controller");
    await expect(
      duplicate.getByText(/Another controller window is open/),
    ).toBeVisible();
    await duplicate.getByRole("button", { name: "Set up input" }).click();
    await expect(
      duplicate.getByRole("button", { name: "Enable controls", exact: true }),
    ).toBeDisabled();
    await duplicate.close();
    await run.game.bringToFront();
    await controller.bringToFront();
    await enable(controller);
    await controller
      .getByRole("button", { name: "→ Right", exact: true })
      .click();
    await expect
      .poll(async () =>
        (await run.events()).some(
          (e) => e.type === "keyup" && e.key === "ArrowRight" && e.trusted,
        ),
      )
      .toBe(true);
    const before = (await run.events()).length;
    await library.evaluate(() =>
      window.postMessage(
        {
          channel: "neuroreach-library",
          from: "app",
          type: "key",
          key: "ArrowLeft",
        },
        location.origin,
      ),
    );
    await controller.waitForTimeout(180);
    expect((await run.events()).length).toBe(before);
    await controller.getByRole("button", { name: "Change controls" }).click();
    await controller.getByLabel("Control preset").selectOption("drag");
    await controller.getByRole("button", { name: "Set up input" }).click();
    await enable(controller);
    await controller
      .getByRole("button", { name: "→ Right", exact: true })
      .click();
    await controller
      .getByRole("button", { name: "Hold / release", exact: true })
      .click();
    await expect
      .poll(async () =>
        (await run.events()).some(
          (e) => e.type === "mousedown" && e.trusted && e.x > 300 && e.x < 600,
        ),
      )
      .toBe(true);
    await controller
      .getByRole("button", { name: "Stop controls", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await run.events()).filter((e) => e.type === "mouseup").length,
      )
      .toBe(1);
    await enable(controller);
    const otherWindow = await run.worker.evaluate(async () => {
      const browser = (globalThis as any).chrome;
      return (
        await browser.windows.create({ url: "about:blank", focused: true })
      ).id;
    });
    await expect(
      controller.getByText("○ Controls stopped", { exact: true }),
    ).toBeVisible();
    await run.worker.evaluate(
      (id) => (globalThis as any).chrome.windows.remove(id),
      otherWindow,
    );
    await controller.bringToFront();
    await enable(controller);
    await library.bringToFront();
    await expect(
      controller.getByText("○ Controls stopped", { exact: true }),
    ).toBeVisible();
    await run.game.bringToFront();
    await controller.bringToFront();
    await enable(controller);
    await controller
      .getByRole("button", { name: "Hold / release", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await run.events()).filter((e) => e.type === "mousedown").length,
      )
      .toBe(2);
    await controller.close();
    await expect
      .poll(
        async () =>
          (await run.events()).filter((e) => e.type === "mouseup").length,
      )
      .toBe(2);
    expect(
      (await run.events()).every(
        (e) =>
          e.type.startsWith("key") ||
          (e.x >= 0 && e.x <= 600 && e.y >= 0 && e.y <= 500),
      ),
    ).toBe(true);
    await run.game.evaluate(() =>
      history.pushState(null, "", "/neuroreach-new-page"),
    );
    await expect
      .poll(() =>
        run.worker.evaluate(() => (globalThis as any).status().connected),
      )
      .toBe(false);
  } finally {
    await run.close();
  }
});

test("held steering changes direction and releases on stop", async () => {
  const run = await controllerHarness();
  try {
    await run.controller.getByRole("button", { name: "Set up input" }).click();
    await enable(run.controller);
    const steer = (key: string | null) =>
      run.controller.evaluate(
        (key) =>
          window.postMessage(
            { channel: "neuroreach-library", from: "app", type: "steer", key },
            location.origin,
          ),
        key,
      );
    await steer("ArrowRight");
    await steer("ArrowRight");
    await steer("ArrowLeft");
    await expect
      .poll(async () =>
        (await run.events())
          .filter((e) => e.type.startsWith("key"))
          .map((e) => [e.type, e.key]),
      )
      .toEqual([
        ["keydown", "ArrowRight"],
        ["keyup", "ArrowRight"],
        ["keydown", "ArrowLeft"],
      ]);
    await run.controller
      .getByRole("button", { name: "Stop controls", exact: true })
      .click();
    await expect
      .poll(async () => (await run.events()).at(-1))
      .toMatchObject({
        type: "keyup",
        key: "ArrowLeft",
        trusted: true,
      });
  } finally {
    await run.close();
  }
});

test("fresh EEG bursts select a game control and signal loss disarms it", async () => {
  let level: number | null = 0.1;
  let timer: ReturnType<typeof setInterval> | undefined;
  const run = await controllerHarness(undefined, async (context) => {
    await context.route("**/api/health", (route) =>
      route.fulfill({ json: { clockMs: Date.now() } }),
    );
    await context.routeWebSocket("**/api/eeg", (socket) => {
      socket.send(
        JSON.stringify({
          type: "devices",
          devices: [{ id: "fixture", name: "EEG protocol fixture" }],
        }),
      );
      socket.onMessage(() => {
        socket.send(
          JSON.stringify({
            type: "ready",
            method: "protocol fixture",
            synthetic: true,
            message: "Test signal ready",
          }),
        );
        timer = setInterval(
          () =>
            socket.send(
              JSON.stringify({
                type: "score",
                level,
                sampleMs: Date.now(),
                message: level === null ? "EEG signal lost" : "Test input",
              }),
            ),
          50,
        );
      });
      socket.onClose(() => clearInterval(timer));
    });
  });
  try {
    const { controller } = run;
    await controller.getByLabel("EEG headset", { exact: true }).check();
    await controller.getByRole("button", { name: "Set up input" }).click();
    await controller
      .getByRole("button", { name: "Begin resting calibration" })
      .click();
    await controller.getByRole("button", { name: "Begin play" }).click();
    await enable(controller);
    await controller.waitForTimeout(400);
    level = 0.95;
    await expect
      .poll(
        async () =>
          (await run.events()).filter((e) => e.type === "keyup").length,
      )
      .toBe(1);
    await controller.waitForTimeout(400);
    expect((await run.events()).filter((e) => e.type === "keyup").length).toBe(
      1,
    );
    level = null;
    await expect(
      controller.getByText("○ Controls stopped", { exact: true }),
    ).toBeVisible();
    await expect(
      controller.getByRole("button", { name: "Enable controls", exact: true }),
    ).toBeDisabled();
    await controller
      .getByRole("button", { name: "Use on-screen controls", exact: true })
      .click();
    await enable(controller);
    await controller
      .getByRole("button", { name: "→ Right", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await run.events()).filter((e) => e.type === "keyup").length,
      )
      .toBe(2);
  } finally {
    clearInterval(timer);
    await run.close();
  }
});

test("camera reaches control a foreground game while its controller is hidden and camera loss releases a held slice", async () => {
  const fixture = process.env.NEUROREACH_POSE_FIXTURE;
  test.skip(!fixture, "Requires the recorded pose fixture");
  test.setTimeout(60000);
  const run = await controllerHarness();
  try {
    const { controller } = run;
    await attachPoseFixture(controller, fixture!);
    // Headless windows don't occlude each other. Model a covered popup whose
    // preview and control timers stop, but whose camera track is still live.
    await controller.addInitScript(() => {
      const interval = window.setInterval.bind(window);
      window.setInterval = (callback, delay, ...args) =>
        interval(() => {
          if (delay !== 80 || !document.hidden) callback(...args);
        }, delay);
    });
    await controller.reload();
    await controller.getByLabel("Camera", { exact: true }).check();
    await controller.getByLabel("Control preset").selectOption("slice");
    await controller.getByRole("button", { name: "Set up input" }).click();
    await expect(controller.getByText("Arm in view")).toBeVisible({
      timeout: 15000,
    });
    await controller
      .getByRole("button", { name: "Set resting position" })
      .click();
    await expect(
      controller.getByRole("button", { name: "Save top-left reach" }),
    ).toBeEnabled();
    await controller.evaluate(() => Object.assign(window, { armAngle: 0.7 }));
    await controller
      .getByRole("button", { name: "Save top-left reach" })
      .click();
    await expect(
      controller.getByRole("button", { name: "Save bottom-right reach" }),
    ).toBeEnabled();
    await controller.evaluate(() => Object.assign(window, { armAngle: -0.2 }));
    await controller
      .getByRole("button", { name: "Save bottom-right reach" })
      .click();
    await expect(
      controller.getByRole("button", { name: "Change controls" }),
    ).toBeVisible();
    await controller.bringToFront();
    await enable(controller);
    await expect
      .poll(() =>
        run.worker.evaluate(async () => {
          const browser = (globalThis as any).chrome;
          const [game] = await browser.tabs.query({
            url: "https://poki.com/neuroreach-test",
          });
          return (await browser.windows.get(game.windowId)).focused;
        }),
      )
      .toBe(true);
    await expect
      .poll(async () =>
        (await run.events()).some((e) => e.type === "mousedown" && e.trusted),
      )
      .toBe(true);
    const before = (await run.events()).length;
    await controller.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
      document.querySelectorAll("video").forEach((video) => video.pause());
      Object.assign(window, { armAngle: 0.7 });
    });
    const pointerReached = async (offset: number, left: boolean) =>
      (await run.events())
        .slice(offset)
        .some(
          (event) =>
            event.type === "mousemove" &&
            event.trusted &&
            (left ? event.x < 150 : event.x > 450),
        );
    await expect.poll(() => pointerReached(before, true)).toBe(true);
    // Move back after the extension's heartbeat deadline with timers suspended.
    await controller.waitForTimeout(1500);
    const atLeft = (await run.events()).length;
    await controller.evaluate(() => Object.assign(window, { armAngle: -0.2 }));
    await expect.poll(() => pointerReached(atLeft, false)).toBe(true);
    // A frozen last pose must not keep a held button alive.
    await controller.evaluate(() => (window as any).cameraTrack.stop());
    await expect
      .poll(async () =>
        (await run.events()).some((e) => e.type === "mouseup" && e.trusted),
      )
      .toBe(true);
    await controller
      .getByRole("button", { name: "Use on-screen controls", exact: true })
      .click();
    await expect
      .poll(() =>
        controller.evaluate(() => (window as any).cameraTrack.readyState),
      )
      .toBe("ended");
  } finally {
    await run.close();
  }
});

test("synthetic LSL EEG drives an external game after a full resting baseline", async () => {
  const python = process.env.NEUROREACH_TEST_PYTHON;
  test.skip(!python, "Requires the EEG environment and built web app");
  test.setTimeout(180000);
  const { spawn } = await import("node:child_process");
  const { mkdtemp, rm } = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const root = await mkdtemp(path.join(os.tmpdir(), "nr-library-eeg-"));
  const host = "http://127.0.0.1:18780";
  const streamName = "UN-library-validation";
  const occupied = await fetch(host + "/api/health").then(
    () => true,
    () => false,
  );
  expect(occupied, "The isolated EEG test port must be free").toBe(false);
  const service = spawn(
    python!,
    ["../signal-engine/local_companion.py", "--local-only", "--port", "18780"],
    { env: { ...process.env, NEUROREACH_DATA_DIR: root }, stdio: "ignore" },
  );
  const fixture = spawn(
    python!,
    ["../signal-engine/tests/practice_stream.py", streamName],
    { stdio: ["pipe", "ignore", "ignore"] },
  );
  let run: Awaited<ReturnType<typeof controllerHarness>> | undefined;
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
    run = await controllerHarness(host);
    const { controller } = run;
    await controller.getByLabel("EEG headset", { exact: true }).check();
    await controller.getByRole("button", { name: "Set up input" }).click();
    await controller
      .getByRole("combobox", { name: "Headset", exact: true })
      .selectOption({ label: streamName }, { timeout: 25000 });
    await controller
      .getByRole("button", { name: "Begin resting calibration" })
      .click();
    await expect(controller.getByText(/60 clean seconds/)).toBeVisible({
      timeout: 12000,
    });
    await controller
      .getByRole("button", { name: "Begin play" })
      .click({ timeout: 90000 });
    await expect(
      controller.getByText("Synthetic EEG test stream"),
    ).toBeVisible();
    await enable(controller);
    await controller.waitForTimeout(700);
    fixture.stdin.write("begin\n");
    await expect
      .poll(
        async () =>
          (await run!.events()).filter((e) => e.type === "keyup" && e.trusted)
            .length,
        { timeout: 25000 },
      )
      .toBeGreaterThan(0);
    fixture.kill();
    await expect(
      controller.getByText("○ Controls stopped", { exact: true }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      controller.getByRole("button", { name: "Enable controls", exact: true }),
    ).toBeDisabled();
  } finally {
    fixture.kill();
    const exited = new Promise((resolve) => service.once("exit", resolve));
    service.kill();
    await run?.close();
    if (service.exitCode === null && service.signalCode === null) await exited;
    await rm(root, { recursive: true, force: true });
  }
});

test("blended control uses camera aim with EEG selection and clears sensors for the next guest", async () => {
  const fixture = process.env.NEUROREACH_POSE_FIXTURE;
  test.skip(!fixture, "Requires the recorded pose fixture");
  test.setTimeout(60000);
  let level: number | null = 0.1;
  let timer: ReturnType<typeof setInterval> | undefined;
  const run = await controllerHarness(undefined, async (context) => {
    await context.route("**/api/health", (route) =>
      route.fulfill({ json: { clockMs: Date.now() } }),
    );
    await context.routeWebSocket("**/api/eeg", (socket) => {
      socket.send(
        JSON.stringify({
          type: "devices",
          devices: [{ id: "fixture", name: "EEG protocol fixture" }],
        }),
      );
      socket.onMessage(() => {
        socket.send(
          JSON.stringify({
            type: "ready",
            method: "protocol fixture",
            synthetic: true,
            message: "Test signal ready",
          }),
        );
        timer = setInterval(
          () =>
            socket.send(
              JSON.stringify({
                type: "score",
                level,
                sampleMs: Date.now(),
                message: "Test input",
              }),
            ),
          50,
        );
      });
      socket.onClose(() => clearInterval(timer));
    });
  });
  try {
    const { controller } = run;
    await attachPoseFixture(controller, fixture!);
    await controller.reload();
    await controller.getByLabel("Camera + EEG", { exact: true }).check();
    await controller.getByLabel("Control preset").selectOption("pointer");
    await controller.getByRole("button", { name: "Set up input" }).click();
    await expect(controller.getByText("Arm in view")).toBeVisible({
      timeout: 15000,
    });
    await controller
      .getByRole("button", { name: "Set resting position" })
      .click();
    await expect(
      controller.getByRole("button", { name: "Save top-left reach" }),
    ).toBeEnabled();
    await controller.evaluate(() => Object.assign(window, { armAngle: 0.7 }));
    await controller
      .getByRole("button", { name: "Save top-left reach" })
      .click();
    await expect(
      controller.getByRole("button", { name: "Save bottom-right reach" }),
    ).toBeEnabled();
    await controller.evaluate(() => Object.assign(window, { armAngle: -0.2 }));
    await controller
      .getByRole("button", { name: "Save bottom-right reach" })
      .click();
    await controller
      .getByRole("button", { name: "Begin resting calibration" })
      .click();
    await controller.getByRole("button", { name: "Begin play" }).click();
    await enable(controller);
    await controller.waitForTimeout(500);
    expect((await run.events()).some((e) => e.type === "mousedown")).toBe(
      false,
    );
    level = 0.95;
    await expect
      .poll(
        async () =>
          (await run.events()).filter((e) => e.type === "mouseup" && e.trusted)
            .length,
      )
      .toBe(1);
    const click = (await run.events()).find((e) => e.type === "mouseup")!;
    expect(click.x).toBeGreaterThan(300);
    level = null;
    await expect(
      controller.getByText("○ Controls stopped", { exact: true }),
    ).toBeVisible();
    await run.library.evaluate(() => {
      const channel = new BroadcastChannel("neuroreach-guest-handoff");
      channel.postMessage("next");
      channel.close();
    });
    await expect(
      controller.getByRole("heading", { name: "Choose your controls" }),
    ).toBeVisible();
    await expect
      .poll(() =>
        controller.evaluate(() => (window as any).cameraTrack.readyState),
      )
      .toBe("ended");
  } finally {
    clearInterval(timer);
    await run.close();
  }
});
