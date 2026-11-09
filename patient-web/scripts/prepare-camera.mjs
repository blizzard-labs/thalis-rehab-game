import { cp, mkdir } from "node:fs/promises";
const dest = new URL("../public/vision-wasm/", import.meta.url);
await mkdir(dest, { recursive: true });
await cp(new URL("../node_modules/@mediapipe/tasks-vision/wasm/", import.meta.url), dest, { recursive: true });
// Classic worker output allows MediaPipe to load its local WASM glue via importScripts.
const { build } = await import("esbuild");
await build({ entryPoints: [new URL("../src/practice/pose-worker.ts", import.meta.url).pathname],
  bundle: true, minify: true, format: "iife", target: "es2020",
  outfile: new URL("pose-worker.js", dest).pathname });
