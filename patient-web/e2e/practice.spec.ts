import { expect, test } from "@playwright/test";

test("guest grows a flower, rests, saves locally and clears the shared browser", async ({
  page,
}) => {
  const sockets: string[] = [];
  page.on("websocket", (ws) => sockets.push(ws.url()));
  await page.goto("/");
  await page.getByRole("button", { name: /Garden Grow/ }).click();
  await page.getByRole("button", { name: "Start game" }).click();
  for (let i = 0; i < 4; i++) await page.keyboard.press("Space");
  await expect(page.getByText(/1 bloom/)).toBeVisible();
  await expect(page.getByTestId("flower")).toHaveClass(/flower--bloom/);
  await page.getByRole("button", { name: "Sunflower" }).click();
  for (let i = 0; i < 4; i++)
    await page.getByRole("button", { name: "Pour onto the plant" }).click();
  await expect(
    page.getByRole("img", { name: "Sunflower", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("2 blooms")).toBeVisible();
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("button", { name: "Water" })).toBeDisabled();
  await page.getByRole("button", { name: "End session" }).click();
  await page.getByRole("button", { name: "Save on this device" }).click();
  await expect(
    page.getByRole("button", { name: "Saved on this device" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Saved sessions" }).click();
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await page.getByRole("button", { name: "Delete saved sessions" }).click();
  await page
    .getByRole("button", { name: "Confirm delete all sessions" })
    .click();
  await expect(page.getByRole("listitem")).toHaveCount(0);
  expect(
    sockets.filter((url) => url.includes("8765") || url.includes("/api/eeg")),
  ).toEqual([]);
});

test.describe("touch play", () => {
  test.use({ hasTouch: true });
  test("a phone player selects and catches a star by touch", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: /Star Catcher/ }).click();
    await page.getByRole("button", { name: "Start game" }).click();
    const goal = page.getByTestId("reach-goal");
    const positions = new Set<string>();
    for (let caught = 0; caught < 7; caught++) {
      const position = (await goal.getAttribute("transform"))!;
      positions.add(position);
      await goal.tap();
      await expect(
        page.getByRole("img", {
          name:
            caught < 6
              ? `The Kite, ${caught + 1} of 6 stars`
              : "The Sailboat, 1 of 6 stars",
        }),
      ).toBeVisible();
      await expect(goal).not.toHaveAttribute("transform", position);
    }
    await expect(
      page.getByRole("img", { name: "The Kite, completed constellation 1" }),
    ).toBeVisible();
    expect(positions.size).toBe(7);
    await expect(page.getByText("7 stars", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "End session" }).click();
    await expect(
      page.getByRole("heading", { name: "Session complete" }),
    ).toBeVisible();
  });
});

test("a switch player aims the net, misses, then catches the same star", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Star Catcher/ }).click();
  await page.getByRole("button", { name: "Start game" }).click();
  await page.keyboard.press("Space");
  await expect(page.getByText(/Just missed/)).toBeVisible();
  await expect(page.getByText("0 stars")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("net")).toHaveAttribute("data-reach", "1.00");
  await page.keyboard.press("Space");
  await expect(page.getByText("1 star", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByTestId("reach-goal").click();
  await expect(page.getByText("1 star", { exact: true })).toBeVisible();
});

test("dragging moves the wrist into the hoop before releasing a catch", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Star Catcher/ }).click();
  await page.getByRole("button", { name: "Start game" }).click();
  const star = await page.getByTestId("reach-goal").boundingBox();
  if (!star) throw new Error("Golden star is missing");
  const x = star.x + star.width / 2,
    y = star.y + star.height / 2;
  const stage = (await page.getByTestId("reach-scene").boundingBox())!;
  await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 6 });
  await expect
    .poll(async () =>
      Number(await page.getByTestId("net").getAttribute("data-reach")),
    )
    .toBeGreaterThan(0.9);
  await expect(page.getByText("0 stars")).toBeVisible();
  await page.mouse.up();
  await expect(page.getByText("1 star", { exact: true })).toBeVisible();
});

test("camera denial can continue the same session using a switch", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: () =>
        Promise.reject(new DOMException("Denied", "NotAllowedError")),
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Garden Grow/ }).click();
  await page.getByLabel("Camera", { exact: true }).check();
  await page.getByRole("button", { name: "Start game" }).click();
  await expect(page.getByText(/permission was declined/)).toBeVisible();
  await page.getByRole("button", { name: "Use one button" }).click();
  await page.getByRole("button", { name: "Water" }).click();
  await page.getByRole("button", { name: "End session" }).click();
  await expect(page.getByText("Camera → One button")).toBeVisible();
});

test("bundled pose worker processes a real image frame with no person", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const worker = new Worker("/vision-wasm/pose-worker.js");
        worker.onerror = (error) => reject(error.message);
        worker.onmessage = async ({ data }) => {
          if (data.kind === "ready") {
            const canvas = document.createElement("canvas");
            canvas.width = 320;
            canvas.height = 240;
            const frame = await createImageBitmap(canvas);
            worker.postMessage(
              { kind: "frame", frame, side: "left", time: performance.now() },
              [frame],
            );
          } else {
            worker.terminate();
            if (data.kind === "error") reject(data.message);
            else resolve(data);
          }
        };
        worker.postMessage({ kind: "open" });
      }),
  );
  expect(result).toMatchObject({ kind: "sample", point: null });
});

test("a player fills the meadow past six flowers, meets a personal goal and calls the bees", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: /Garden Grow/ }).click();
  await page.getByRole("button", { name: "Start game" }).click();
  await page.getByText("Set bloom goal", { exact: true }).click();
  await page.getByLabel("My bloom goal").fill("8");
  await page.getByRole("button", { name: "Set goal", exact: true }).click();
  const water = page.getByRole("button", { name: "Water", exact: true });
  await water.focus();
  for (let i = 0; i < 40; i++) await page.keyboard.press("Space");
  await expect(page.getByText("10 blooms", { exact: true })).toBeVisible();
  await expect(page.getByText("Goal reached · 8")).toBeVisible();
  await expect(
    page
      .getByRole("group", { name: "Flower meadow with 10 blooms" })
      .getByRole("img"),
  ).toHaveCount(10);
  await expect(
    page.getByRole("img", { name: "3 bees visiting your flowers" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Call bees" }).click();
  await expect(
    page.getByRole("button", { name: "Bees visiting" }),
  ).toBeDisabled();
  await expect(page.getByText("10 blooms", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "End session" }).click();
  await expect(page.getByText("Bloom goal · 10 of 8 · Reached")).toBeVisible();
});

test("completed constellations stay in the sky through a second Kite and pause", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  await page.getByRole("button", { name: /Star Catcher/ }).click();
  await page.getByRole("button", { name: "Start game" }).click();
  const target = page.getByTestId("reach-goal");
  for (let i = 0; i < 25; i++) {
    await target.click();
    await page.clock.runFor(1050);
  }
  const sky = page.getByRole("group", { name: "4 completed constellations" });
  for (const [i, name] of [
    "The Kite",
    "The Sailboat",
    "The Crown",
    "The Kite",
  ].entries())
    await expect(
      sky.getByRole("img", {
        name: `${name}, completed constellation ${i + 1}`,
      }),
    ).toBeVisible();
  await page.getByRole("button", { name: "Pause" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(sky.getByRole("img")).toHaveCount(4);
  await page.getByRole("button", { name: "Resume" }).click();
  await target.click();
  await expect(page.getByText("26 stars", { exact: true })).toBeVisible();
});

test("a rower can pull a stroke, switch channels, reach a landing and save a correctly labeled summary", async ({page}) => {
  await page.goto("/");
  await page.getByRole("button",{name:/River Rowing/}).click();
  await page.getByRole("button",{name:"Start game"}).click();
  await page.getByRole("button",{name:"Stone narrows"}).click();
  const boat=page.getByRole("img",{name:/Rowboat at/});
  const box=(await boat.boundingBox())!;
  await page.mouse.move(box.x+box.width*.5,box.y+box.height*.45);
  await page.mouse.down(); await page.mouse.move(box.x+box.width*.5,box.y+box.height*.8); await page.mouse.up();
  await expect(page.getByText("1 stroke",{exact:true})).toBeVisible();
  for(let i=0;i<3;i++) await page.getByRole("button",{name:"Row",exact:true}).click();
  await expect(page.getByRole("img",{name:"Rowboat at The Old Bridge"})).toBeVisible();
  await page.getByRole("button",{name:"Pause",exact:true}).click();
  await expect(page.getByRole("button",{name:"Row",exact:true})).toBeDisabled();
  await page.getByRole("button",{name:"End session"}).click();
  await expect(page.getByText("Strokes",{exact:true})).toBeVisible();
});
