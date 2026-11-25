import { expect, test, type CDPSession } from "./noticesHarness";
import { openGameFixture, enable } from "./extensionHarness";

// Native toolbar and side-panel documents are browser UI. Playwright's page
// list omits them, so use their actual Chromium targets for these clicks.
async function evaluateView(
  client: CDPSession,
  suffix: string,
  expression: string,
) {
  const targets = await client.send("Target.getTargets");
  const target = targets.targetInfos.find((item) => item.url.endsWith(suffix));
  if (!target) throw new Error("Controller view is closed: " + suffix);
  const { sessionId } = await client.send("Target.attachToTarget", {
    targetId: target.targetId,
    flatten: false,
  });
  const result = new Promise<any>((resolve) => {
    const receive = (event: { sessionId: string; message: string }) => {
      if (event.sessionId !== sessionId) return;
      const reply = JSON.parse(event.message);
      if (reply.id !== 1) return;
      client.off("Target.receivedMessageFromTarget", receive);
      resolve(reply);
    };
    client.on("Target.receivedMessageFromTarget", receive);
  });
  try {
    await client.send("Target.sendMessageToTarget", {
      sessionId,
      message: JSON.stringify({
        id: 1,
        method: "Runtime.evaluate",
        params: { expression, returnByValue: true, userGesture: true },
      }),
    });
    const reply = await result;
    if (reply.result?.exceptionDetails || reply.error)
      throw new Error(JSON.stringify(reply));
    return reply.result.result.value;
  } finally {
    await client.send("Target.detachFromTarget", { sessionId }).catch(() => {});
  }
}

test("toolbar defaults to sidebar and switches an active game between both remembered views", async ({
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "The extension uses Chromium's native side panel",
  );
  const run = await openGameFixture(undefined, undefined, true);
  try {
    const { worker, game, context } = run;
    const client = await context.browser()!.newBrowserCDPSession();
    const toolbar = (js: string) => evaluateView(client, "/popup.html", js);
    const panel = (js: string) => evaluateView(client, "/#game-controller", js);
    async function openToolbar(expected: string) {
      await game.bringToFront();
      await worker.evaluate(async () => {
        const browser = (globalThis as any).chrome;
        const [game] = await browser.tabs.query({
          url: "https://poki.com/neuroreach-test",
        });
        await browser.windows.update(game.windowId, { focused: true });
        await browser.action.openPopup({ windowId: game.windowId });
      });
      await expect
        .poll(() =>
          toolbar("!connect.disabled && view.value").catch(() => false),
        )
        .toBe(expected);
    }
    async function choose(view?: string) {
      if (view)
        await toolbar(
          `view.value = "${view}"; view.dispatchEvent(new Event("change"))`,
        );
      await toolbar("connect.click()");
      const area = game.locator("[data-neuroreach-area]");
      await area.dragTo(area, {
        sourcePosition: { x: 120, y: 60 },
        targetPosition: { x: 720, y: 560 },
      });
    }
    const click = (name: string) =>
      panel(
        `Array.from(document.querySelectorAll("button")).find(b => b.textContent.trim() === ${JSON.stringify(name)} && !b.disabled)?.click()`,
      );
    const panelHas = (text: string) =>
      expect
        .poll(() =>
          panel(
            `document.body.innerText.includes(${JSON.stringify(text)})`,
          ).catch(() => false),
        )
        .toBe(true);

    await openToolbar("sidebar");
    await choose();
    await panelHas("Game connected");
    expect(await panel("document.featurePolicy.allowsFeature('camera')")).toBe(
      true,
    );
    expect(
      await panel("document.documentElement.scrollWidth <= innerWidth"),
    ).toBe(true);
    await click("Set up input");
    await click("Enable controls");
    await panelHas("● Controls enabled");
    await click("→ Right");
    await expect
      .poll(async () =>
        (await run.events()).some((e) => e.trusted && e.key === "ArrowRight"),
      )
      .toBe(true);

    await openToolbar("sidebar");
    const opened = context.waitForEvent("page");
    await choose("popup");
    const popup = await opened;
    await expect(
      popup.getByRole("button", { name: "Change controls" }),
    ).toBeVisible();
    await expect(popup.getByText("○ Controls stopped")).toBeVisible();
    await enable(popup);
    await popup.getByRole("button", { name: "← Left", exact: true }).click();
    await expect
      .poll(async () =>
        (await run.events()).some((e) => e.trusted && e.key === "ArrowLeft"),
      )
      .toBe(true);

    await openToolbar("popup");
    await choose("sidebar");
    await expect.poll(() => popup.isClosed()).toBe(true);
    await panelHas("Change controls");
    await panelHas("○ Controls stopped");
    await click("Enable controls");
    await panelHas("● Controls enabled");
    await click("↓ Down");
    await expect
      .poll(async () =>
        (await run.events()).some((e) => e.trusted && e.key === "ArrowDown"),
      )
      .toBe(true);
    await openToolbar("sidebar");
  } finally {
    await run.close();
  }
});
