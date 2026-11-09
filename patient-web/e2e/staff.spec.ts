import { expect, test } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("isolated staff station records actions, exports reports and locks the roster", async ({page}) => {
  const python = process.env.NEUROREACH_TEST_PYTHON;
  test.skip(!python, "Requires the local Python companion and built web app");
  const root = await mkdtemp(path.join(os.tmpdir(),"neuroreach-staff-test-"));
  const service = spawn(python!,["../signal-engine/local_companion.py","--port","18766"],
    {env:{...process.env,NEUROREACH_DATA_DIR:root},stdio:"ignore"});
  try {
    await expect.poll(async () => { try { return (await fetch("http://127.0.0.1:18766/api/staff/state")).ok; } catch { return false; } }, {timeout:15000}).toBe(true);
    await page.goto("http://127.0.0.1:18766");
    await page.getByRole("button",{name:"Staff workspace"}).click();
    await page.getByLabel("Staff password").fill("test-station-passphrase");
    await page.getByRole("button",{name:"Set password"}).click();
    await page.getByLabel("Participant label").fill("Station test user");
    await page.getByLabel(/Participant agreed/).check();
    await page.getByRole("button",{name:"Add participant"}).click();
    await page.getByRole("button",{name:"Start supervised session"}).click();
    for (let i=0;i<4;i++) await page.getByRole("button",{name:"Water"}).click();
    await page.getByRole("button",{name:"Pause"}).click();
    await page.getByRole("button",{name:"End session"}).click();
    await expect(page.getByText(/4 actions/)).toBeVisible();
    const csv = await page.getByRole("link",{name:"CSV"}).getAttribute("href");
    const report = await page.request.get("http://127.0.0.1:18766"+csv);
    expect(await report.text()).toContain("Rewards,1");
    await page.getByRole("button",{name:"Lock workstation"}).click();
    await expect(page.getByRole("button",{name:"Unlock"})).toBeVisible();
    expect((await page.request.get("http://127.0.0.1:18766"+csv)).status()).toBe(401);
  } finally {
    const finished = new Promise(resolve=>service.once("exit",resolve));
    service.kill();
    if(service.exitCode===null && service.signalCode===null) await finished;
    await rm(root,{recursive:true,force:true});
  }
});
