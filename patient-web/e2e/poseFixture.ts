import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

export async function attachPoseFixture(
  page: Page,
  fixture: string,
  timestamp = false,
) {
  const image =
    "data:image/jpeg;base64," + (await readFile(fixture)).toString("base64");
  await page.addInitScript(
    ({ src, timestamp }) => {
      const runtime = window as Window & {
        armAngle?: number;
        cameraTrack?: MediaStreamTrack;
      };
      // WebKit can replace the initial mediaDevices wrapper after HTTPS navigation.
      Object.defineProperty(MediaDevices.prototype, "getUserMedia", {
        configurable: true,
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
            if (timestamp) {
              // Sixteen high-contrast cells survive downscaling and JPEG encoding.
              ctx.resetTransform();
              const time = Date.now();
              for (let bit = 0; bit < 16; bit++) {
                ctx.fillStyle = (time >> bit) & 1 ? "white" : "black";
                ctx.fillRect(32 + bit * 36, 16, 36, 32);
              }
            }
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
    },
    { src: image, timestamp },
  );
}
