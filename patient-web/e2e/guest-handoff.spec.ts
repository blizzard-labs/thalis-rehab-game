import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function openHeadsetSetup(page: Page) {
  let profile: string | null = null;
  await page.routeWebSocket("**/api/eeg", (socket) => {
    socket.send(
      JSON.stringify({
        type: "devices",
        devices: [{ id: "test", name: "Test headset" }],
      }),
    );
    socket.onMessage((data) => {
      profile = JSON.parse(String(data)).profile;
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Garden Grow/ }).click();
  await page.getByLabel("EEG headset", { exact: true }).check();
  await page.getByRole("button", { name: "Start game" }).click();
  await page.getByLabel("Save or reuse my model on this computer").check();
  return () => profile;
}

async function savedModelRequest(page: Page) {
  const sentProfile = await openHeadsetSetup(page);
  await page.getByRole("button", { name: "Begin resting calibration" }).click();
  await expect.poll(sentProfile).toBeTruthy();
  return sentProfile();
}

test("the next guest starts a fresh harbor and calibration across open tabs", async ({
  page,
  context,
}) => {
  // Upgrade a browser that saved an EEG profile and a round with the previous app.
  await page.route("**/old-player", (route) =>
    route.fulfill({ contentType: "text/html", body: "<html></html>" }),
  );
  await page.goto("/old-player");
  const oldProfile = await page.evaluate(async () => {
    const id = crypto.randomUUID();
    localStorage.setItem("neuroreach-eeg-profile", id);
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("neuroreach-practice", 1);
      open.onupgradeneeded = () =>
        open.result.createObjectStore("rounds", { keyPath: "id" });
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction("rounds", "readwrite");
        tx.objectStore("rounds").put({
          id: "saved-outing",
          started: new Date().toISOString(),
          game: "garden",
          sources: ["button"],
          elapsed: 60,
          rewards: 3,
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    });
    return id;
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Lighthouse Keeper/ }).click();
  await expect(page.getByText(/3 saved tasks and supplies/)).toBeVisible();
  await page.getByRole("button", { name: "← Games" }).click();

  const original = await context.newPage();
  expect(await savedModelRequest(original)).toBe(oldProfile);
  await page.getByRole("button", { name: "Next guest" }).click();
  await page.getByRole("button", { name: "Keep this guest" }).click();
  await page.getByRole("button", { name: "Saved sessions" }).click();
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await page.getByRole("button", { name: "← Games" }).click();
  await page.getByRole("button", { name: "Next guest" }).click();
  await page
    .getByRole("button", { name: "Clear and start next guest" })
    .click();
  await expect(page.getByText("Ready for the next guest.")).toBeVisible();
  await expect(
    original.getByRole("heading", { name: "Choose a game" }),
  ).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Saved sessions" }).click();
  await expect(
    page.getByText("You haven’t saved a session yet."),
  ).toBeVisible();
  await page.getByRole("button", { name: "← Games" }).click();
  await page.getByRole("button", { name: /Lighthouse Keeper/ }).click();
  await expect(page.getByText(/0 saved tasks and supplies/)).toBeVisible();
  await page.getByRole("button", { name: "← Games" }).click();
  expect(await savedModelRequest(page)).not.toBe(oldProfile);
});

test("a guest tab that missed the handoff cannot write its old round into the new history", async ({
  page,
  context,
}) => {
  await context.addInitScript(() => {
    Object.defineProperty(window, "BroadcastChannel", { value: undefined });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Garden Grow/ }).click();
  await page.getByRole("button", { name: "Start game" }).click();
  await page.getByRole("button", { name: "Water" }).click();
  await page.getByRole("button", { name: "End session" }).click();

  const previousSetup = await context.newPage();
  const previousRequest = await openHeadsetSetup(previousSetup);
  const handoff = await context.newPage();
  await handoff.goto("/");
  await handoff.getByRole("button", { name: "Next guest" }).click();
  await handoff
    .getByRole("button", { name: "Clear and start next guest" })
    .click();
  await expect(handoff.getByText("Ready for the next guest.")).toBeVisible();
  // Trigger a pending save without focusing (and thus refreshing) this suspended tab.
  await page
    .getByRole("button", { name: "Save on this device" })
    .dispatchEvent("click");
  await expect(page.getByRole("alert")).toContainText("turn has ended");
  await previousSetup
    .getByRole("button", { name: "Begin resting calibration" })
    .dispatchEvent("click");
  await expect(
    previousSetup.getByText(/Could not open this player’s saved calibration/),
  ).toBeVisible();
  expect(previousRequest()).toBeNull();
  await handoff.getByRole("button", { name: "Saved sessions" }).click();
  await expect(
    handoff.getByText("You haven’t saved a session yet."),
  ).toBeVisible();
});
