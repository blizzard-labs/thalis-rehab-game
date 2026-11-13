import {
  chromium,
  expect,
  type Page,
  type BrowserContext,
} from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

declare const chrome: any;
declare function beginSelection(tabId: number): Promise<void>;
declare function enqueue(task: () => Promise<void>): Promise<void>;
export async function controllerHarness(
  origin = "http://127.0.0.1:5173",
  prepare?: (context: BrowserContext) => Promise<void>,
  nativeWindow = false,
) {
  const root = await mkdtemp(path.join(os.tmpdir(), "nr-game-controller-"));
  const extension = path.join(root, "extension");
  await cp("../game-controller-extension", extension, { recursive: true });
  const manifest = JSON.parse(
    await readFile(path.join(extension, "manifest.json"), "utf8"),
  );
  // Tests emulate the activeTab grant normally supplied by clicking the toolbar.
  // Only the intercepted fixture host is granted; the distributed manifest has no such permission.
  manifest.host_permissions = ["https://poki.com/*"];
  await writeFile(
    path.join(extension, "manifest.json"),
    JSON.stringify(manifest),
  );
  const context = await chromium.launchPersistentContext(
    path.join(root, "profile"),
    {
      channel: "chromium",
      headless: true,
      ...(nativeWindow ? { viewport: null } : {}),
      args: [
        ...(nativeWindow
          ? ["--screen-info={1920x1080}", "--window-size=1280,900"]
          : []),
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`,
      ],
    },
  );
  try {
    if (prepare) await prepare(context);
    await context.route("https://poki.com/neuroreach-test", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<title>External game fixture</title><iframe src="https://game-cdn.invalid/game" style="position:absolute;left:120px;top:60px;width:600px;height:500px;border:0"></iframe>',
      }),
    );
    await context.route("https://game-cdn.invalid/game", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<body style="margin:0;background:#e1efda"><h1>External game</h1><script>window.events=[]; for(const type of ["keydown","keyup","mousedown","mouseup","mousemove"])document.addEventListener(type,event=>events.push({type:event.type,key:event.key,x:event.clientX,y:event.clientY,trusted:event.isTrusted}));</script></body>',
      }),
    );
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker", { timeout: 10000 }));
    const library = await context.newPage();
    await library.goto(origin + "/#library");
    await expect(
      library.getByText("Game Controller extension connected"),
    ).toBeVisible();
    const game = await context.newPage();
    await game.goto("https://poki.com/neuroreach-test");
    await game.bringToFront();
    await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({
        url: "https://poki.com/neuroreach-test",
      });
      await enqueue(() => beginSelection(tab.id));
    });
    const opened = context.waitForEvent("page", { timeout: 10000 });
    const overlay = game.locator("[data-neuroreach-area]");
    await overlay.dragTo(overlay, {
      sourcePosition: { x: 120, y: 60 },
      targetPosition: { x: 720, y: 560 },
    });
    const controller = await opened;
    await controller.waitForURL("**/#game-controller", { timeout: 10000 });
    return {
      context,
      library,
      game,
      controller,
      worker,
      events: () =>
        game.frames()[1].evaluate(
          () =>
            (window as any).events as {
              type: string;
              key?: string;
              x: number;
              y: number;
              trusted: boolean;
            }[],
        ),
      close: async () => {
        await context.close();
        await rm(root, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await context.close();
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}
export async function enable(controller: Page) {
  await controller
    .getByRole("button", { name: "Enable controls", exact: true })
    .click();
  await expect(
    controller.getByText("● Controls enabled · Alt+Shift+S to stop", {
      exact: true,
    }),
  ).toBeVisible();
}
