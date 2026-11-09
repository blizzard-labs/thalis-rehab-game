import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

export async function attachPoseFixture(page: Page, fixture: string) {
  const image =
    "data:image/jpeg;base64," + (await readFile(fixture)).toString("base64");
  await page.addInitScript((src) => {
    const runtime = window as Window & {
      armAngle?: number;
      cameraTrack?: MediaStreamTrack;
    };
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        const subject = new Image();
        subject.src = src;
        await subject.decode();
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext("2d")!;
        const draw = () => {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.fillStyle = "#555";
          ctx.fillRect(0, 0, 640, 480);
          ctx.translate(320, 240);
          ctx.rotate(runtime.armAngle ?? 0);
          ctx.drawImage(subject, -290, -195, 580, 390);
        };
        draw();
        const stream = canvas.captureStream(15);
        runtime.cameraTrack = stream.getVideoTracks()[0];
        const id = setInterval(() => {
          if (runtime.cameraTrack?.readyState === "ended") clearInterval(id);
          else draw();
        }, 65);
        return stream;
      },
    });
  }, image);
}
