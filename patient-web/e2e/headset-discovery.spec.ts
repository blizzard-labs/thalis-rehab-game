import { expect, test } from "@playwright/test";

// Discovery uses stream instance IDs: a restarted vendor bridge has a new ID
// even when the headset's visible serial/name is unchanged.
test("rescanning a restarted headset calibrates the device currently shown", async ({
  page,
}) => {
  let restarted = false;
  const starts: string[] = [];
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { clockMs: Date.now() } }),
  );
  await page.routeWebSocket("**/api/eeg", (socket) => {
    const devices = !restarted
      ? [
          { id: "unicorn-a", name: "UN-A" },
          { id: "unicorn-b-old", name: "UN-B" },
        ]
      : [{ id: "unicorn-b-restarted", name: "UN-B" }];
    socket.send(JSON.stringify({ type: "devices", devices }));
    socket.onMessage((raw) => {
      const command = JSON.parse(String(raw));
      starts.push(command.device);
      socket.send(
        JSON.stringify(
          devices.some((d) => d.id === command.device)
            ? {
                type: "ready",
                method: "discovery fixture",
                message: "Selected device connected",
                synthetic: true,
              }
            : {
                type: "error",
                message: "Select an available Unicorn and arm.",
              },
        ),
      );
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Garden Grow/ }).click();
  await page.getByLabel("EEG headset", { exact: true }).check();
  await page.getByRole("button", { name: "Start game" }).click();
  await page
    .getByRole("combobox", { name: "Headset", exact: true })
    .selectOption("unicorn-b-old");
  restarted = true;
  await page.getByRole("button", { name: "Scan again" }).click();
  await expect(
    page.getByRole("combobox", { name: "Headset", exact: true }),
  ).toHaveValue("unicorn-b-restarted");
  await page.getByRole("button", { name: "Begin resting calibration" }).click();
  await expect(
    page.getByRole("button", { name: "Begin play", exact: true }),
  ).toBeVisible();
  expect(starts).toEqual(["unicorn-b-restarted"]);
  await page.getByRole("button", { name: "End session", exact: true }).click();
});

test("multiple headsets require a current choice and preserve it only while available", async ({
  page,
}) => {
  let generation = 0;
  const starts: string[] = [];
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { clockMs: Date.now() } }),
  );
  await page.routeWebSocket("**/api/eeg", (socket) => {
    const lists = [
      [
        { id: "a", name: "UN-A" },
        { id: "b", name: "UN-B" },
      ],
      [
        { id: "b", name: "UN-B" },
        { id: "a", name: "UN-A" },
      ],
      [
        { id: "a-new", name: "UN-A" },
        { id: "b-new", name: "UN-B" },
      ],
    ];
    socket.send(
      JSON.stringify({ type: "devices", devices: lists[generation] }),
    );
    socket.onMessage((raw) => {
      starts.push(JSON.parse(String(raw)).device);
      socket.send(
        JSON.stringify({
          type: "ready",
          method: "discovery fixture",
          message: "Selected device connected",
          synthetic: true,
        }),
      );
    });
  });
  await page.goto("/#game-controller");
  await page.getByLabel("EEG headset", { exact: true }).check();
  await page.getByRole("button", { name: "Set up input" }).click();
  const choice = page.getByRole("combobox", { name: "Headset", exact: true });
  const begin = page.getByRole("button", { name: "Begin resting calibration" });
  await expect(choice).toHaveValue("");
  await expect(begin).toBeDisabled();
  await choice.selectOption("b");
  generation = 1;
  await page.getByRole("button", { name: "Scan again" }).click();
  await expect(choice.locator("option").nth(1)).toHaveAttribute("value", "b");
  await expect(choice).toHaveValue("b");
  await expect(begin).toBeEnabled();
  generation = 2;
  await page.getByRole("button", { name: "Scan again" }).click();
  await expect(choice.locator("option").nth(1)).toHaveAttribute(
    "value",
    "a-new",
  );
  await expect(choice).toHaveValue("");
  await expect(begin).toBeDisabled();
  await choice.selectOption("b-new");
  await begin.click();
  await expect(
    page.getByRole("button", { name: "Begin play", exact: true }),
  ).toBeVisible();
  expect(starts).toEqual(["b-new"]);
  await page
    .getByRole("button", { name: "Use on-screen controls", exact: true })
    .click();
});
