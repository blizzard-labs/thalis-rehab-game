import { expect, test, type Page } from "@playwright/test";

// Feed repeatable wrist coordinates through video frames. The camera-positive
// suite separately exercises the production landmark detector on real footage.
async function attachWristReplay(page: Page) {
  await page.route("**/vision-wasm/pose-worker.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `
    const context = new OffscreenCanvas(1, 1).getContext("2d", { willReadFrequently: true });
    self.onmessage = ({data}) => {
      if (data.kind === "open") return self.postMessage({kind:"ready"});
      context.drawImage(data.frame,0,0,1,1);
      data.frame.close();
      const [r,g,b] = context.getImageData(0,0,1,1).data;
      self.postMessage({kind:"sample",time:data.time,point:{x:(r-128)/90,y:(g-128)/90},otherPoint:{x:(b-128)/90,y:0}});
    };
  `,
    }),
  );
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 64;
        const ctx = canvas.getContext("2d")!;
        const draw = () => {
          const { x, y } = (
            window as Window & { wrist?: { x: number; y: number } }
          ).wrist ?? { x: 0, y: 0 };
          const other = (window as Window & { other?: number }).other ?? 0;
          ctx.fillStyle = `rgb(${128 + 90 * x},${128 + 90 * y},${128 + 90 * other})`;
          ctx.fillRect(0, 0, 64, 64);
        };
        draw();
        const stream = canvas.captureStream(20);
        const timer = setInterval(() => {
          if (stream.active) draw();
          else clearInterval(timer);
        }, 50);
        return stream;
      },
    });
  });
}
async function wrist(page: Page, x: number, y: number) {
  await page.evaluate(
    (value) => {
      Object.assign(window, { wrist: value });
    },
    { x, y },
  );
}

test("saves four chosen directions, retries duplicates, and plays every saved reach", async ({
  page,
}) => {
  test.setTimeout(85000);
  await attachWristReplay(page);
  await page.goto("/");
  await page.getByRole("button", { name: /Star Catcher/ }).click();
  await page.getByLabel("Camera", { exact: true }).check();
  await page.getByRole("button", { name: "Start game" }).click();
  await expect(page.getByText("Arm in view")).toBeVisible();
  await page.getByRole("button", { name: "Set resting position" }).click();
  const points = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];
  async function save(i: number, point: number[]) {
    await page.getByRole("button", { name: `Save direction ${i}` }).click();
    await wrist(page, point[0], point[1]); // reach after pressing the control
    await expect(
      page.getByRole("button", { name: "Cancel capture" }),
    ).toHaveCount(0);
  }
  for (let i = 0; i < 4; i++) {
    if (i === 2) {
      await save(3, points[0]);
      await expect(page.getByRole("alert")).toContainText(
        "matches direction 1",
      );
      await expect(
        page.getByRole("button", { name: "Play with 2 directions" }),
      ).toBeVisible();
    }
    await save(i + 1, points[i]);
    await expect(
      page.getByRole("button", {
        name: `Play with ${i + 1} direction${i ? "s" : ""}`,
      }),
    ).toBeVisible();
  }
  await expect(
    page.getByRole("button", { name: /Save direction/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Undo last direction" }).click();
  await expect(
    page.getByRole("button", { name: "Play with 3 directions" }),
  ).toBeVisible();
  await save(4, points[3]);
  await page.getByRole("button", { name: "Play with 4 directions" }).click();
  for (const [i, depth] of [1, 0.41, 0.94, 0.37].entries()) {
    await wrist(page, points[i][0] * depth, points[i][1] * depth);
    await expect(
      page.getByText(`${i + 1} star${i ? "s" : ""}`, { exact: true }),
    ).toBeVisible();
  }
});

test("a paired-oar stroke requires both independently calibrated arms", async ({
  page,
}) => {
  await attachWristReplay(page);
  await page.goto("/");
  await page.getByRole("button", { name: /River Rowing/ }).click();
  await page.getByLabel("Camera", { exact: true }).check();
  await page.getByRole("button", { name: "Start game" }).click();
  await page.getByRole("button", { name: "Both arms" }).click();
  await expect(page.getByText("Both arms in view")).toBeVisible();
  await page.getByRole("button", { name: "Set resting position" }).click();
  await wrist(page, 1, 0);
  await expect(async () => {
    await page
      .getByRole("button", { name: "Set comfortable reach" })
      .click({ timeout: 500 });
    await expect(
      page.getByRole("button", { name: "Set resting position" }),
    ).toBeVisible({ timeout: 500 });
  }).toPass();
  await page.getByRole("button", { name: "Set resting position" }).click();
  await page.evaluate(() => {
    Object.assign(window, { other: 1 });
  });
  await expect(async () => {
    await page
      .getByRole("button", { name: "Set comfortable reach" })
      .click({ timeout: 500 });
    await expect(page.getByText("0 strokes", { exact: true })).toBeVisible({
      timeout: 500,
    });
  }).toPass();
  await wrist(page, 0, 0);
  await page.evaluate(() => {
    Object.assign(window, { other: 0 });
  });
  await expect(
    page.getByText("Pull toward your calibrated position, then ease back."),
  ).toBeVisible();
  await wrist(page, 1, 0);
  await page.waitForTimeout(650);
  await expect(page.getByText("0 strokes", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    Object.assign(window, { other: 1 });
  });
  await expect(page.getByText("1 stroke", { exact: true })).toBeVisible();
});
