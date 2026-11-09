import { defineConfig } from "@playwright/test";
const browser = process.env.NEUROREACH_BROWSER;
export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://127.0.0.1:5173",
    browserName: browser === "webkit" || browser === "firefox" ? browser : "chromium",
    channel: browser ? undefined : "chrome" },
  webServer: { command: "npm run dev -- --host 127.0.0.1 --strictPort", url: "http://127.0.0.1:5173", reuseExistingServer: !process.env.CI }
});
