import { spawn } from "node:child_process";
import { expect, test } from "@playwright/test";

test("an EEG-only game uses the selected LSL stream and a complete resting baseline", async ({page}) => {
  const python = process.env.NEUROREACH_TEST_PYTHON;
  test.skip(!python, "Requires a running companion and the signal-engine environment");
  test.setTimeout(145000);
  const fixture = spawn(python!, ["../signal-engine/tests/practice_stream.py"], {stdio:"ignore"});
  try {
    await page.goto("/");
    await page.getByRole("button", {name:/Star Catcher/}).click();
    await page.getByLabel("EEG headset", {exact:true}).check();
    await page.getByRole("button", {name:"Start game"}).click();
    const select = page.getByRole("combobox", {name:"Headset",exact:true});
    await expect(select).toBeVisible({timeout:8000});
    await select.selectOption({label:"UN-validation-fixture"});
    await page.getByRole("button", {name:"Begin resting calibration"}).click();
    await expect(page.getByText(/60 clean seconds/)).toBeVisible({timeout:12000});
    await page.getByRole("button", {name:"Begin play"}).click({timeout:90000});
    await expect(page.getByText(/1 star/)).toBeVisible({timeout:25000});
    fixture.kill();
    await expect(page.getByText(/EEG signal lost|EEG disconnected/)).toBeVisible({timeout:10000});
    await page.getByRole("button", {name:"Continue with one button"}).click();
    await page.getByRole("button", {name:"End session"}).click();
    await expect(page.getByText("EEG headset → One button")).toBeVisible();
  } finally { fixture.kill(); }
});
