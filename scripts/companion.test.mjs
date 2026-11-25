import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { superviseCompanion } from "./companion.mjs";

const silent = { info() {}, warn() {} };
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
async function until(fn) {
  for (let i = 0; i < 100; i++) {
    try {
      if (await fn()) return;
    } catch {
      /* starting or stopping */
    }
    await wait(30);
  }
  throw new Error("Companion did not reach the expected state");
}
const alive = async (url) => {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
};

test("starts a missing service, restarts an owned crash, and stops its child on close", async () => {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}/api/health`;
  // A disposable process stands in for Python; no real patient records or ports.
  const code = `require('node:http').createServer((req,res)=>{
    if(req.url==='/test-crash') { res.end('bye'); setImmediate(()=>process.exit(2)); return; }
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({app:'NeuroReach',pid:process.pid}));
  }).listen(${port},'127.0.0.1');`;
  const manager = superviseCompanion({
    url,
    command: process.execPath,
    args: ["-e", code],
    interval: 40,
    retryDelay: 80,
    startupTimeout: 2000,
    stdio: "ignore",
    log: silent,
  });
  try {
    await manager.ready;
    const first = (await (await fetch(url)).json()).pid;
    await fetch(`http://127.0.0.1:${port}/test-crash`);
    await until(async () => (await (await fetch(url)).json()).pid !== first);
  } finally {
    manager.stop();
  }
  await until(async () => !(await alive(url)));
});

test("reuses an existing companion without stopping a service it did not launch", async () => {
  const server = createServer((_, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ app: "NeuroReach" }));
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}/api/health`;
  const manager = superviseCompanion({
    url,
    command: "/not-a-python",
    interval: 40,
    log: silent,
  });
  try {
    await manager.ready;
    manager.stop();
    assert.equal(await alive(url), true);
  } finally {
    manager.stop();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("an unrelated service on the port is left alone and reported", async () => {
  const server = createServer((_, response) =>
    response.end("another app"),
  ).listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}/api/health`;
  const messages = [];
  const manager = superviseCompanion({
    url,
    command: "/not-a-python",
    interval: 40,
    log: {
      info: (message) => messages.push(message),
      warn: (message) => messages.push(message),
    },
  });
  try {
    await manager.ready;
    assert.equal(messages.length, 1);
    assert.match(messages[0], /occupied/);
    manager.stop();
    assert.equal(await (await fetch(url)).text(), "another app");
  } finally {
    manager.stop();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("missing Python fails gracefully and does not create a rapid spawn loop", async () => {
  const port = await freePort();
  const messages = [];
  const manager = superviseCompanion({
    url: `http://127.0.0.1:${port}/api/health`,
    command: "/not-a-python",
    interval: 30,
    retryDelay: 5000,
    startupTimeout: 1000,
    log: {
      info: (message) => messages.push(message),
      warn: (message) => messages.push(message),
    },
  });
  try {
    await manager.ready;
    await wait(120);
    assert.equal(messages.filter((m) => m.startsWith("Starting")).length, 1);
    assert.equal(
      messages.filter((m) => m.includes("Python environment")).length,
      1,
    );
  } finally {
    manager.stop();
  }
});
