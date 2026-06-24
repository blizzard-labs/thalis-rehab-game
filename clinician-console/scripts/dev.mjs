import { spawn } from "node:child_process";
import { createServer } from "vite";
import electronPath from "electron";

const PORT = 5273;
const vite = await createServer({ server: { port: PORT } });
await vite.listen();
const url = `http://localhost:${PORT}`;
console.log(`[dev] vite on ${url}`);

// build the main process bundle once
await new Promise((resolve, reject) => {
  const tsc = spawn("npx", ["tsc", "-p", "tsconfig.main.json"], { stdio: "inherit", shell: true });
  tsc.on("exit", (c) => (c === 0 ? resolve() : reject(new Error("tsc failed"))));
});

const electron = spawn(electronPath, ["dist-main/main.js"], {
  stdio: "inherit",
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
});
electron.on("exit", async () => {
  await vite.close();
  process.exit(0);
});
