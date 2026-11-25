import { defineConfig } from "@playwright/test";
const remote = process.env.NEUROREACH_WEBSITE_URL;
const browser = process.env.NEUROREACH_BROWSER || "chromium";
export default defineConfig({
  testDir: "./release-tests",
  timeout: 45_000,
  workers: 2,
  use: {
    baseURL: remote || "http://127.0.0.1:4177/thalis-rehab-game/",
    browserName:
      browser === "webkit" || browser === "firefox" ? browser : "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: remote
    ? undefined
    : {
        command:
          "npx vite preview --outDir dist-site --base /thalis-rehab-game/ --host 127.0.0.1 --port 4177 --strictPort",
        url: "http://127.0.0.1:4177/thalis-rehab-game/",
        reuseExistingServer: !process.env.CI,
      },
});
