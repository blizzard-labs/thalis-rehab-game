import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://127.0.0.1:5173", channel: "chrome" },
  webServer: { command: "npm run dev -- --host 127.0.0.1 --strictPort", url: "http://127.0.0.1:5173", reuseExistingServer: !process.env.CI }
});
