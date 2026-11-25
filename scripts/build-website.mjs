import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

// Keep the companion's root build separate from the public project-site build.
const result = spawnSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["--prefix", "patient-web", "run", "build", "--", "--outDir", "dist-site"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      NEUROREACH_BASE_PATH: "/thalis-rehab-game/",
      NEUROREACH_OUTPUT_DIR: "dist-site",
      VITE_WEBSITE_BUILD: "1",
    },
  },
);
if (result.status !== 0) process.exit(result.status || 1);
const directory = new URL("../patient-web/dist-site/", import.meta.url);
const html = await readFile(new URL("index.html", directory), "utf8");
// Pages cannot set arbitrary response headers. A meta policy still restricts
// scripts and data destinations; no unsupported frame-ancestors claim is made.
const policy =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'";
await writeFile(
  new URL("index.html", directory),
  html.replace(
    "<head>",
    `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />\n    <meta name="referrer" content="no-referrer" />\n    <meta name="description" content="Play five welcoming practice games with touch, keyboard or camera. Explore familiar favorites with optional accessible controls." />`,
  ),
);
await writeFile(new URL(".nojekyll", directory), "");
const revision = spawnSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).stdout?.trim();
await writeFile(
  new URL("release.json", directory),
  JSON.stringify({
    revision,
    built: new Date().toISOString(),
    scope: "independent-website",
  }) + "\n",
);
// Recompute offline revision after adding the final HTML policy and metadata.
const offline = spawnSync(
  process.execPath,
  ["patient-web/scripts/build-offline.mjs"],
  {
    stdio: "inherit",
    env: { ...process.env, NEUROREACH_OUTPUT_DIR: "dist-site" },
  },
);
if (offline.status !== 0) process.exit(offline.status || 1);
