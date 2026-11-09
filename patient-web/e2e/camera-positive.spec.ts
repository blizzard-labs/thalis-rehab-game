import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

// Set NEUROREACH_POSE_FIXTURE to the MediaPipe pose.jpg test image to exercise
// the full video pipeline without granting a physical camera permission.
test("real landmark inference calibrates a reach, catches a star and stops the track", async ({ page }) => {
  const fixture = process.env.NEUROREACH_POSE_FIXTURE;
  test.skip(!fixture, "Provide a local MediaPipe pose.jpg test fixture");
  const image = "data:image/jpeg;base64," + (await readFile(fixture!)).toString("base64");
  await page.addInitScript((src) => {
    const runtime = window as Window & { armAngle?: number; cameraTrack?: MediaStreamTrack };
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: async () => {
      const subject = new Image();
      subject.src = src;
      await subject.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 640; canvas.height = 480;
      const ctx = canvas.getContext("2d")!;
      const draw = () => {
        ctx.setTransform(1,0,0,1,0,0); ctx.fillStyle = "#555"; ctx.fillRect(0,0,640,480);
        ctx.translate(320,240); ctx.rotate(runtime.armAngle ?? 0);
        ctx.drawImage(subject,-290,-195,580,390);
      };
      draw();
      const stream = canvas.captureStream(15);
      runtime.cameraTrack = stream.getVideoTracks()[0];
      const id = setInterval(() => {
        if (runtime.cameraTrack?.readyState === "ended") clearInterval(id); else draw();
      }, 65);
      return stream;
    } });
  }, image);
  await page.goto("/");
  await page.getByRole("button", { name: /Star Catcher/ }).click();
  await page.getByLabel("Camera", {exact:true}).check();
  await page.getByRole("button", { name: "Start game" }).click();
  await expect(page.getByText("Arm in view")).toBeVisible({timeout:12000});
  await page.getByRole("button", { name:"Set resting position" }).click();
  await page.evaluate(() => { Object.assign(window, {armAngle: 0.45}); });
  await expect(async () => {
    await page.getByRole("button", {name:"Set comfortable reach"}).click({timeout:1000});
    await expect(page.getByRole("button", {name:"Pause"})).toBeVisible({timeout:700});
  }).toPass({timeout:8000});
  await page.evaluate(() => Object.assign(window, {armAngle:0}) && undefined);
  await expect(page.getByText("Reach to your comfortable position, then return to rest.")).toBeVisible();
  await page.evaluate(() => Object.assign(window, {armAngle:0.45}) && undefined);
  await expect(page.getByText(/1 star/)).toBeVisible({timeout:8000});
  await page.getByRole("button", {name:"End session"}).click();
  await expect.poll(() => page.evaluate(() => (window as Window & {cameraTrack?:MediaStreamTrack}).cameraTrack?.readyState)).toBe("ended");
});
