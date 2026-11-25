import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const scope = vm.createContext({ URL });
vm.runInContext(
  readFileSync(
    new URL("../game-controller-extension/sites.js", import.meta.url),
    "utf8",
  ),
  scope,
);
test("extension accepts only the published project path and local companions", () => {
  const identify = scope.controllerSite;
  assert.equal(
    identify("https://blizzard-labs.github.io/thalis-rehab-game/#library"),
    "https://blizzard-labs.github.io/thalis-rehab-game",
  );
  assert.equal(
    identify("http://127.0.0.1:8766/#library"),
    "http://127.0.0.1:8766",
  );
  for (const url of [
    "https://blizzard-labs.github.io/another-project/#game-controller",
    "https://blizzard-labs.github.io/thalis-rehab-game-evil/#library",
    "https://blizzard-labs.github.io.evil.test/thalis-rehab-game/#library",
    "http://blizzard-labs.github.io/thalis-rehab-game/#library",
    "https://blizzard-labs.github.io/thalis-rehab-game/nested/#library",
    "https://user:pass@blizzard-labs.github.io/thalis-rehab-game/#library",
    "http://192.168.1.2/#library",
    "javascript:alert(1)",
  ])
    assert.equal(identify(url), null, url);
});
