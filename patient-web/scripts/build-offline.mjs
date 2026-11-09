import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist/",import.meta.url));
const hash = createHash("sha256");
const assets = [];
async function inventory(dir) {
  for (const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
    const absolute = path.join(dir,entry.name);
    if (entry.isDirectory()) await inventory(absolute);
    else if (entry.name !== "sw.js") {
      const pathname = "/" + path.relative(dist,absolute).split(path.sep).join("/");
      assets.push(pathname);
      hash.update(pathname).update(await readFile(absolute));
    }
  }
}
await inventory(dist);
const cache = "neuroreach-web-" + hash.digest("hex").slice(0,16);
// Only known build assets are cached. API requests and pairing links stay network-only.
const worker = `
const name = ${JSON.stringify(cache)};
const assets = ${JSON.stringify(assets)};
self.addEventListener("install", event => {
  event.waitUntil(caches.open(name).then(cache => cache.addAll(assets)));
});
self.addEventListener("activate", event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("neuroreach-web-") && k !== name).map(k=>caches.delete(k)))),
    self.clients.claim()
  ]));
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || url.search || url.pathname.startsWith("/api/")) return;
  const asset = url.pathname === "/" ? "/index.html" : url.pathname;
  if (assets.includes(asset)) event.respondWith(caches.open(name).then(async cache => (await cache.match(asset)) || fetch(event.request)));
});
`;
await writeFile(path.join(dist,"sw.js"),worker);
