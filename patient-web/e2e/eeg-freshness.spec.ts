import { expect, test } from "@playwright/test";
import type { WebSocketRoute } from "@playwright/test";

test("delayed EEG cannot earn strokes and fresh samples resume the same round", async ({
  page,
}) => {
  const stationOffset = 4000;
  await page.route("**/api/health", (route) =>
    route.fulfill({
      json: { app: "NeuroReach", clockMs: Date.now() + stationOffset },
    }),
  );
  let headset: WebSocketRoute;
  await page.routeWebSocket("**/api/eeg", (socket) => {
    headset = socket;
    socket.send(
      JSON.stringify({
        type: "devices",
        devices: [{ id: "test", name: "Test stream" }],
      }),
    );
    socket.onMessage(() =>
      socket.send(
        JSON.stringify({
          type: "ready",
          method: "rest-calibrated band power",
          synthetic: true,
          message: "EEG ready",
          accuracy: null,
        }),
      ),
    );
  });
  await page.goto("/");
  await page.getByRole("button", { name: /River Rowing/ }).click();
  await page.getByLabel("EEG headset", { exact: true }).check();
  await page.getByRole("button", { name: "Start game" }).click();
  await page.getByRole("button", { name: "Begin resting calibration" }).click();
  await page.getByRole("button", { name: "Begin play" }).click();

  async function signal(level: number, age: number, duration: number) {
    const end = Date.now() + duration;
    do {
      headset.send(
        JSON.stringify({
          type: "score",
          level,
          sampleMs: Date.now() + stationOffset - age,
          message: "Test signal",
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
    } while (Date.now() < end);
  }

  await signal(0, 5, 200);
  await signal(1, 3500, 800);
  await expect(page.getByText("0 strokes", { exact: true })).toBeVisible();
  await signal(1, -3000, 600);
  await expect(page.getByText("0 strokes", { exact: true })).toBeVisible();
  // A single almost-expired sample cannot power a full 400 ms stroke.
  await signal(1, 440, 50);
  await new Promise((resolve) => setTimeout(resolve, 500));
  await expect(page.getByText("0 strokes", { exact: true })).toBeVisible();
  await signal(0, 5, 200);
  await signal(1, 5, 800);
  await expect(page.getByText("1 stroke", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "End session" }).click();
  await expect(
    page.getByRole("heading", { name: "Session complete" }),
  ).toBeVisible();
});
