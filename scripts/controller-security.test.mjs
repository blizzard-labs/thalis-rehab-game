import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = name => readFileSync(new URL(`../game-controller-extension/${name}`, import.meta.url), 'utf8');
const event = () => ({ listeners: [], addListener(fn) { this.listeners.push(fn); } });
function runtime() {
  const sent = [], timers = [];
  const chrome = {
    runtime: { id: 'extension', getURL: path => `chrome-extension://extension/${path}`, onMessage: event(), onConnect: event() },
    storage: { session: { get: async () => ({}), set: async () => {} } },
    tabs: { get: async id => ({ id, active: true, url: 'https://poki.com/example', windowId: 1 }), onUpdated: event(), onActivated: event(), sendMessage: async () => {} },
    windows: { onFocusChanged: event(), update: async () => {} },
    commands: { onCommand: event() },
    debugger: { onDetach: event(), detach: async () => {}, sendCommand: async (tab, method, params) => { sent.push({ tab, method, params }); return { result: { value: false } }; } },
    scripting: { executeScript: async () => {} },
  };
  const context = vm.createContext({ chrome, URL, crypto: { randomUUID: () => 'test-token' }, setTimeout, clearTimeout, setInterval: callback => timers.push(callback), console });
  context.importScripts = (...names) => names.forEach(name => vm.runInContext(source(name), context));
  vm.runInContext(source('background.js'), context);
  const evaluate = text => vm.runInContext(text, context);
  function port(url = 'http://127.0.0.1:5173/#game-controller', name = 'neuroreach-controls') {
    const p = { name, sender: { url, tab: { id: 2, windowId: 2 }, frameId: 0 }, replies: [], postMessage(message) { this.replies.push(message); }, onMessage: event(), onDisconnect: event() };
    chrome.runtime.onConnect.listeners[0](p);
    return p;
  }
  evaluate(`layout = 'popup'; station = 'http://127.0.0.1:5173'; target = {tabId:1,url:'https://poki.com/example',windowId:1,rect:{x:10,y:20,width:600,height:400}};`);
  const controller = port();
  const send = (message, p = controller) => p.onMessage.listeners.forEach(fn => fn(message));
  const flush = () => evaluate('queue');
  const arm = async () => { send({ type: 'arm' }); await flush(); assert.equal(evaluate('armed'), true); sent.length = 0; };
  return { chrome, context, evaluate, port, controller, send, sent, timers, flush, arm };
}

test('only known controller entry pages are trusted', () => {
  const r = runtime();
  for (const url of ['https://evil.example/#game-controller', 'https://blizzard-labs.github.io/other/#game-controller', 'http://127.0.0.1:5173/other/#game-controller', 'http://user@localhost:5173/#game-controller', 'https://blizzard-labs.github.io.evil.example/thalis-rehab-game/']) {
    assert.equal(r.evaluate(`controllerSite(${JSON.stringify(url)})`), null, url);
    assert.equal(r.port(url).onMessage.listeners.length, 0, url);
  }
  assert.equal(r.evaluate("controllerSite('https://blizzard-labs.github.io/thalis-rehab-game/#game-controller')"), 'https://blizzard-labs.github.io/thalis-rehab-game');
});

test('malformed messages, arbitrary methods, keys and coordinates cannot become input', async () => {
  const r = runtime(); await r.arm();
  for (const message of [null, false, [], 'click', {type:'Runtime.evaluate', expression:'alert(1)'}, {type:'key',key:'Enter'}, {type:'steer',key:'Space'}, {type:'move',x:Infinity,y:.5}, {type:'move',x:-1,y:1}, {type:'move',x:'0.5',y:0}, {type:'move',x:1.01,y:0}]) r.send(message);
  await r.flush(); assert.equal(r.sent.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(r.evaluate("controlCommand({type:'move',x:0,y:1,video:'private',expression:'bad'})"))), {type:'move',x:0,y:1});
  r.send({type:'move',x:0,y:1}); await r.flush();
  assert.equal(r.sent[0].params.x, 10); assert.equal(r.sent[0].params.y, 420);
});

test('library and duplicate controllers cannot arm or inject events', async () => {
  const r = runtime(); await r.arm();
  for (const p of [r.port('http://127.0.0.1:5173/#library'), r.port()]) {
    r.send({type:'move',x:1,y:0}, p); r.send({type:'key',key:'Space'}, p); r.send({type:'arm'}, p);
  }
  await r.flush(); assert.equal(r.sent.length, 0);
});

test('queued commands are discarded after stop and cannot replay after rearming', async () => {
  const r = runtime(); await r.arm();
  r.evaluate('queue = new Promise(resolve => globalThis.unblock = resolve)');
  r.send({type:'key',key:'ArrowRight'}); r.send({type:'move',x:.9,y:.5}); r.send({type:'stop'});
  r.evaluate('unblock()'); await r.flush();
  assert.equal(r.sent.length, 0); assert.equal(r.evaluate('pendingMotion'), false);
  await r.arm(); r.send({type:'move',x:.2,y:.4}); await r.flush();
  assert.equal(r.sent.filter(e => e.method === 'Input.dispatchMouseEvent').length, 1);
});

test('stop invalidates a pending arm before browser focus work finishes', async () => {
  const r = runtime();
  let unblock;
  r.chrome.tabs.get = () => new Promise(resolve => { unblock = () => resolve({id:1, active:true, url:'https://poki.com/example', windowId:1}); });
  r.send({type:'arm'}); await new Promise(resolve => setTimeout(resolve, 0));
  r.send({type:'stop'}); unblock(); await r.flush();
  assert.equal(r.evaluate('armed'), false);
});

test('command floods are bounded and fail closed', async () => {
  const r = runtime(); await r.arm();
  r.evaluate('queue = new Promise(resolve => globalThis.unblock = resolve)');
  for (let i=0; i<1000; i++) r.send({type:'key',key:'Space'});
  assert.equal(r.evaluate('armed'), false); assert(r.evaluate('queuedInputs') <= 8);
  r.evaluate('unblock()'); await r.flush();
  assert.equal(r.sent.length, 0); assert.equal(r.evaluate('queuedInputs'), 0);
});

test('lost heartbeat releases both a held key and mouse button', async () => {
  const r = runtime(); await r.arm();
  r.send({type:'hold'}); r.send({type:'steer',key:'ArrowRight'}); await r.flush();
  r.sent.length=0; r.evaluate('lastBeat = 0'); r.timers[0](); await r.flush();
  assert.equal(r.evaluate('armed'), false);
  assert(r.sent.some(e => e.params.type === 'mouseReleased'));
  assert(r.sent.some(e => e.params.type === 'keyUp'));
});

test('navigation, focus loss, emergency shortcut and controller close stop queued actions', async () => {
  for (const interrupt of [
    r => r.chrome.tabs.onUpdated.listeners[0](1, {status:'loading'}),
    r => r.chrome.tabs.onActivated.listeners[0]({tabId:9,windowId:1}),
    r => r.chrome.windows.onFocusChanged.listeners[0](9),
    r => r.chrome.commands.onCommand.listeners[0]('stop-controls'),
    r => r.controller.onDisconnect.listeners[0](),
  ]) {
    const r=runtime(); await r.arm();
    r.evaluate('queue = new Promise(resolve => globalThis.unblock = resolve)');
    r.send({type:'click'}); interrupt(r); r.evaluate('unblock()'); await r.flush();
    assert.equal(r.evaluate('armed'), false); assert.equal(r.sent.length, 0);
  }
});
