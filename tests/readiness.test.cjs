const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/readiness.js'), 'utf8');

function fixture({ hasRoot = true, notBefore = 0 } = {}) {
  let now = 0;
  let nextId = 1;
  let finishCount = 0;
  let resolveDone;
  let observer;
  const pending = new Map();
  const listeners = new Map();
  const statuses = [];
  const root = {
    childElementCount: 1,
    startup: true,
    editors: [],
    contains(editor) { return editor.insideRoot; },
    querySelector(selector) { return selector === '.startup-loader' && this.startup ? {} : null; },
    querySelectorAll() { return this.editors; }
  };
  const schedule = (fn, delay) => {
    const id = nextId++;
    pending.set(id, { fn, at: now + delay });
    return id;
  };
  const api = {
    notBefore,
    done: new Promise(resolve => { resolveDone = resolve; }),
    finish() { finishCount++; },
    setStatus(message) { statuses.push(message); }
  };
  const document = {
    visibilityState: 'visible',
    getElementById(id) { return id === 'root' && hasRoot ? root : null; },
    addEventListener(name, fn) { listeners.set(name, fn); },
    removeEventListener(name, fn) { if (listeners.get(name) === fn) listeners.delete(name); }
  };
  const window = {
    __codexStartupVisual: api,
    setTimeout: (fn, delay) => schedule(fn, delay),
    clearTimeout: id => pending.delete(id),
    requestAnimationFrame: fn => schedule(fn, 16),
    cancelAnimationFrame: id => pending.delete(id),
    addEventListener(name, fn) { listeners.set('window:' + name, fn); },
    removeEventListener(name, fn) { if (listeners.get('window:' + name) === fn) listeners.delete('window:' + name); },
    getComputedStyle(editor) { return { display: editor.display, visibility: editor.visibility }; }
  };
  class Observer {
    constructor(fn) { this.callback = fn; observer = this; this.disconnected = false; }
    observe(target, options) { this.target = target; this.options = options; }
    disconnect() { this.disconnected = true; }
  }
  vm.runInNewContext(source, {
    window, document, MutationObserver: Observer, Array, performance: { now: () => now }
  });
  return {
    root, document, api, statuses, pending, listeners,
    fallback() { listeners.get('window:codex:startup-visual-fallback')?.(); listeners.get('codex:startup-visual-fallback')?.(); },
    get observer() { return observer; },
    get finishCount() { return finishCount; },
    mutate() { observer.callback(); },
    visibility(value) { document.visibilityState = value; listeners.get('visibilitychange')?.(); },
    done: resolveDone,
    advance(ms) {
      const target = now + ms;
      while (true) {
        const next = [...pending.entries()].filter(([, task]) => task.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        pending.delete(next[0]);
        now = next[1].at;
        next[1].fn();
      }
      now = target;
    }
  };
}

function editor(overrides = {}) {
  return {
    isConnected: true,
    insideRoot: true,
    codex: true,
    editable: true,
    blocked: false,
    display: 'block',
    visibility: 'visible',
    matches() { return this.codex && this.editable; },
    closest() { return this.blocked ? this : null; },
    getBoundingClientRect() { return { width: 280, height: 30 }; },
    getClientRects() { return [{}]; },
    ...overrides
  };
}

(async () => {
  const ready = fixture();
  ready.root.startup = false;
  ready.root.editors = [editor()];
  ready.mutate();
  ready.advance(319);
  assert.equal(ready.finishCount, 0, 'Do not exit until the editor remains ready for 320 ms');
  ready.advance(17);
  assert.equal(ready.finishCount, 0, 'Do not exit after only one rendered frame');
  ready.advance(16);
  assert.equal(ready.finishCount, 1, 'Exit after stable editor readiness and two rendered frames');
  assert.deepEqual(ready.statuses, ['正在准备对话界面']);
  assert.equal(ready.observer.disconnected, true);
  assert.equal(ready.pending.size, 0);
  assert.equal(ready.listeners.size, 0);
  ready.mutate();
  assert.equal(ready.finishCount, 1, 'Only finish once');

  const busy = fixture();
  const busyEditor = editor({ blocked: true });
  busy.root.editors = [busyEditor];
  busy.mutate();
  busy.advance(1000);
  assert.equal(busy.finishCount, 0, 'Busy, inert, or hidden composer must not finish');
  busyEditor.blocked = false;
  busy.mutate();
  busy.advance(200);
  busyEditor.blocked = true;
  busy.mutate();
  busy.advance(1000);
  assert.equal(busy.finishCount, 0, 'A later busy state cancels readiness');
  busyEditor.blocked = false;
  busy.mutate();
  busy.advance(352);
  assert.equal(busy.finishCount, 1);

  const minimum = fixture({ notBefore: 2200 });
  const minimumEditor = editor();
  minimum.root.editors = [minimumEditor];
  minimum.mutate();
  minimum.advance(1000);
  assert.equal(minimum.finishCount, 0, 'Composer readiness waits for the minimum visual duration');
  minimumEditor.isConnected = false;
  minimum.root.editors = [];
  minimum.mutate();
  minimum.advance(1400);
  assert.equal(minimum.finishCount, 0, 'Removing the composer cancels readiness across the minimum deadline');
  minimumEditor.isConnected = true;
  minimum.root.editors = [minimumEditor];
  minimum.mutate();
  minimum.advance(319);
  assert.equal(minimum.finishCount, 0, 'A restored composer still needs its complete stability duration');
  minimum.advance(17);
  assert.equal(minimum.finishCount, 0, 'The restored composer still needs its second painted frame');
  minimum.advance(16);
  assert.equal(minimum.finishCount, 1);
  assert.equal(minimum.observer.disconnected, true);

  const unrelated = fixture();
  unrelated.root.startup = false;
  unrelated.root.editors = [editor({ codex: false }), editor({ insideRoot: false })];
  unrelated.mutate();
  unrelated.advance(10000);
  assert.equal(unrelated.finishCount, 0, 'Non-Codex or outside-root editors cannot finish');
  assert.equal(unrelated.pending.size, 0, 'No indefinite readiness polling');
  unrelated.done();
  await Promise.resolve();
  assert.equal(unrelated.observer.disconnected, true);
  assert.equal(unrelated.listeners.size, 0);

  const closing = fixture();
  closing.root.editors = [editor()];
  closing.mutate();
  closing.advance(100);
  assert.equal(closing.pending.size, 1);
  closing.done();
  await Promise.resolve();
  assert.equal(closing.pending.size, 0, 'Visual fallback or cancel clears the pending stable timer');
  assert.equal(closing.observer.disconnected, true);
  assert.equal(closing.listeners.size, 0);
  closing.advance(10000);
  assert.equal(closing.finishCount, 0);

  const invisible = fixture();
  invisible.root.editors = [editor()];
  invisible.mutate();
  invisible.advance(100);
  invisible.visibility('hidden');
  invisible.advance(1000);
  assert.equal(invisible.finishCount, 0, 'Hidden windows cannot finish before painting');
  invisible.visibility('visible');
  invisible.advance(352);
  assert.equal(invisible.finishCount, 1);

  const mediaFailure = fixture({ notBefore: 7600 });
  mediaFailure.root.startup = false;
  mediaFailure.root.editors = [editor()];
  mediaFailure.mutate();
  mediaFailure.advance(100);
  assert.equal(mediaFailure.finishCount, 0);
  mediaFailure.api.notBefore = 120;
  mediaFailure.fallback();
  mediaFailure.advance(319);
  assert.equal(mediaFailure.finishCount, 0, 'Media fallback preserves the complete composer stability requirement');
  mediaFailure.advance(17);
  assert.equal(mediaFailure.finishCount, 0, 'Media fallback preserves both rendered frames');
  mediaFailure.advance(16);
  assert.equal(mediaFailure.finishCount, 1, 'Media failure replaces the old 7600 ms deadline');
  assert.equal(mediaFailure.observer.disconnected, true);
  assert.equal(mediaFailure.listeners.size, 0, 'Fallback event listener cleans up');
  mediaFailure.fallback();
  mediaFailure.advance(8000);
  assert.equal(mediaFailure.finishCount, 1, 'Fallback cannot finish more than once');

  const failedButBusy = fixture({ notBefore: 7600 });
  failedButBusy.root.editors = [editor({blocked: true})];
  failedButBusy.mutate();
  failedButBusy.api.notBefore = 120;
  failedButBusy.fallback();
  failedButBusy.advance(1000);
  assert.equal(failedButBusy.finishCount, 0, 'Media failure does not treat a busy composer as ready');
  failedButBusy.done();
  await Promise.resolve();
  assert.equal(failedButBusy.listeners.size, 0);

  const noRoot = fixture({ hasRoot: false });
  noRoot.advance(10000);
  assert.equal(noRoot.finishCount, 0);
  assert.equal(noRoot.observer, undefined);
  console.log('PASS: stable composer readiness, minimum-duration removal/restoration, two frames, busy interruption, strict root scope, visibility, fallback cleanup, missing-root handling, and immediate media-failure deadline reset without bypassing composer readiness.');
})().catch(error => { console.error(error); process.exitCode = 1; });
