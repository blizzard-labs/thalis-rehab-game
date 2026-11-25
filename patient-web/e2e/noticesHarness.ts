import { test as base, type BrowserContext } from "@playwright/test";
import { NOTICE_KEY, NOTICE_VERSION } from "../src/legal/notices";
export * from "@playwright/test";

// Gameplay regressions use a returning reader. legal-notices.spec.ts exercises
// the real first-use dialogs, cancellation, storage failure and guest reset.
export async function returningReader(context: BrowserContext) {
  await context.addInitScript(
    ({ key, version }) => {
      const receipt = JSON.stringify({
        version,
        read: [
          "play:button",
          "play:camera",
          "play:eeg",
          "play:blended",
          "external",
          "controller",
          "staff",
          "supervised",
        ],
      });
      try {
        localStorage.setItem(key, receipt);
        sessionStorage.setItem(key + ":browser", receipt);
        sessionStorage.setItem(
          key + ":" + (location.hash || location.search),
          receipt,
        );
      } catch {
        /* Storage-failure tests exercise their existing fallback. */
      }
    },
    { key: NOTICE_KEY, version: NOTICE_VERSION },
  );
}
export const test = base.extend({
  context: async ({ context }, use) => {
    await returningReader(context);
    await use(context);
  },
});
