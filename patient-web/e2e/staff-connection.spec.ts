import { expect, test } from "./noticesHarness";
import AxeBuilder from "@axe-core/playwright";

test("a cold staff service recovers automatically without a reload", async ({
  page,
}) => {
  let ready = false;
  let requests = 0;
  await page.route("**/api/staff/state", (route) => {
    requests++;
    return ready
      ? route.fulfill({ json: { configured: true, authenticated: false } })
      : route.fulfill({ status: 500, body: "" });
  });
  await page.goto("/#staff");
  await expect(page.getByText(/will reconnect automatically/)).toBeVisible();
  await expect(
    page.getByText("Local workstation", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Try again" })).toBeEnabled();
  ready = true;
  await expect(page.getByLabel("Staff password")).toBeVisible({
    timeout: 7000,
  });
  expect(requests).toBeGreaterThan(1);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Unlock", exact: true }),
  ).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: test.info().outputPath("staff-ready.png"),
    fullPage: true,
  });
});

test("manual reconnect works and leaving cancels pending requests and retries", async ({
  page,
}) => {
  let ready = false;
  let requests = 0;
  await page.route("**/api/staff/state", (route) => {
    requests++;
    return ready
      ? route.fulfill({ json: { configured: false, authenticated: false } })
      : route.abort();
  });
  await page.goto("/#staff");
  await expect(page.getByRole("button", { name: "Try again" })).toBeEnabled();
  ready = true;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByRole("button", { name: "Set password" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to games" }).click();
  ready = false;
  await page.getByRole("button", { name: "Staff workspace" }).click();
  await expect(page.getByRole("button", { name: "Try again" })).toBeEnabled();
  await page.getByRole("button", { name: "Back to games" }).click();
  const ended = requests;
  await page.waitForTimeout(3300); // Beyond the retry deadline: no request may escape after leaving.
  expect(requests).toBe(ended);
  await expect(page.getByRole("button", { name: /Garden Grow/ })).toBeVisible();
});

test("permission errors are not treated as a stopped service or retried", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/staff/state", (route) => {
    requests++;
    return route.fulfill({
      status: 403,
      body: "Station access is not allowed.",
    });
  });
  await page.goto("/#staff");
  await expect(page.getByRole("alert")).toHaveText(
    "Station access is not allowed.",
  );
  const before = requests;
  await page.waitForTimeout(3300);
  expect(requests).toBe(before);
});
