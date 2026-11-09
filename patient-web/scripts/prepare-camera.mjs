import { cp, mkdir } from "node:fs/promises";
const dest = new URL("../public/vision-wasm/", import.meta.url);
await mkdir(dest, { recursive: true });
await cp(new URL("../node_modules/@mediapipe/tasks-vision/wasm/", import.meta.url), dest, { recursive: true });
