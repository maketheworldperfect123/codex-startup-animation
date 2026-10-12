const vm = require('node:vm');
const fs = require('node:fs');
const assert = require('node:assert/strict');

// Media events and presented frames are controlled by the caller. This models
// lifecycle transitions only: it neither decodes video nor measures GPU/FPS.
function fixture({ reduced = false, sourcePath = __dirname + '/../src/video-startup.js',
  videoFrameCallback = true, rejectedPlay = [], deferredPlay = [], prepaint = false } = {}) {
  let clock = 0, nextId = 0, nextNodeId = 0;
  const timers = new Map(), frames = new Map(), ids = new Map(), nodes = [];
  const events = [], mediaLog = [], writes = [];
  const decode = value => value.replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"');
  function matches(n, selector) {
    if (selector.startsWith('#')) return n.id === selector.slice(1);
    if (selector.startsWith('.')) return (n.getAttribute('class') || '').split(/\s+/).includes(selector.slice(1));
    return n.tagName === selector.toLowerCase();
  }
  function descendants(n) { return n.children.flatMap(child => [child, ...descendants(child)]); }
  function eventTarget(target) {
    target.events = new Map();
    target.addEventListener = function(type, fn, options) {
      const list = this.events.get(type) || [];
      list.push({fn, once: !!(options && typeof options === 'object' && options.once)});
      this.events.set(type, list);
    };
    target.removeEventListener = function(type, fn) {
      const list = (this.events.get(type) || []).filter(item => item.fn !== fn);
      if (list.length) this.events.set(type, list); else this.events.delete(type);
    };
    target.dispatchEvent = function(event) {
      if (typeof event === 'string') event = {type: event};
      event.target ||= this;
      event.preventDefault ||= () => { event.defaultPrevented = true; };
      event.stopPropagation ||= () => {};
      for (const item of [...(this.events.get(event.type) || [])]) {
        if (item.once) this.removeEventListener(event.type, item.fn);
        item.fn.call(this, event);
      }
      return !event.defaultPrevented;
    };
    return target;
  }
  function node(tag) {
    const n = eventTarget({tagName: tag.toLowerCase(), sourceTagName: tag,
      nodeId: ++nextNodeId, attributes: {}, children: [], parent: null, text: '',
      setAttribute(key, value) {
        writes.push({time: clock, id: this.id || this.nodeId, key, value: String(value)});
        this.attributes[key] = String(value);
        if (key === 'id') ids.set(String(value), this);
      },
      getAttribute(key) { return this.attributes[key] ?? null; },
      removeAttribute(key) { delete this.attributes[key]; },
      append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } },
      remove() {
        for (const child of [this, ...descendants(this)]) if (child.id) ids.delete(child.id);
        if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
        this.parent = null;
      },
      querySelector(selector) { return descendants(this).find(child => matches(child, selector)) || null; },
      querySelectorAll(selector) { return descendants(this).filter(child => matches(child, selector)); }
    });
    n.style = {setProperty(key, value) { this[key] = String(value); }, removeProperty(key) { delete this[key]; }};
    n.dataset = {};
    n.classList = {contains(name) { return (n.attributes.class || '').split(/\s+/).includes(name); },
      add(...names) { n.attributes.class = [...new Set([...(n.attributes.class || '').split(/\s+/), ...names])].filter(Boolean).join(' '); },
      remove(...names) { n.attributes.class = (n.attributes.class || '').split(/\s+/).filter(name => !names.includes(name)).join(' '); }};
    Object.defineProperty(n, 'id', {get() { return this.attributes.id || ''; }, set(value) { this.setAttribute('id', value); }});
    Object.defineProperty(n, 'src', {get() { return this.attributes.src || ''; }, set(value) { this.setAttribute('src', value); }});
    Object.defineProperty(n, 'isConnected', {get() { let top = this; while (top.parent) top = top.parent; return top === document.body || top === document.head; }});
    Object.defineProperty(n, 'textContent', {get() { return this.text || this.children.map(child => child.textContent).join(''); }, set(value) { this.text = String(value); this.children = []; }});
    Object.defineProperty(n, 'innerHTML', {set(value) {
      for (const child of descendants(this)) if (child.id) ids.delete(child.id);
      this.children = [];
      const stack = [this];
      for (const token of String(value).match(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g) || []) {
        if (token.startsWith('<!--')) continue;
        if (token.startsWith('</')) { stack.pop(); continue; }
        if (token.startsWith('<')) {
          const match = token.match(/^<([\w:-]+)/); if (!match) continue;
          const child = node(match[1]);
          for (const attr of token.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)) child.setAttribute(attr[1], decode(attr[3]));
          stack.at(-1).append(child);
          if (!token.endsWith('/>') && !['br','hr','img','input','meta','link','source'].includes(child.tagName)) stack.push(child);
        } else if (token.trim()) { const child = node('#text'); child.text = decode(token); stack.at(-1).append(child); }
      }
    }});
    if (n.tagName === 'video') {
      Object.assign(n, {readyState: 0, currentTime: 0, duration: NaN, paused: true, ended: false,
        playCalls: 0, pauseCalls: 0, loadCalls: 0, totalVideoFrames: 0, droppedVideoFrames: 0,
        presentedCallbacks: new Map(), pendingPlay: [], muted: false, loop: false});
      n.play = function() {
        this.playCalls++; mediaLog.push({time: clock, id: this.id, action: 'play'});
        if (rejectedPlay.includes(this.id)) return Promise.reject(new Error('Mock play rejection'));
        this.paused = false; this.ended = false;
        if (deferredPlay.includes(this.id)) return new Promise((resolve, reject) => this.pendingPlay.push({resolve, reject}));
        return Promise.resolve();
      };
      n.pause = function() { this.pauseCalls++; this.paused = true; mediaLog.push({time: clock, id: this.id, action: 'pause'}); };
      n.load = function() { this.loadCalls++; mediaLog.push({time: clock, id: this.id, action: 'load'}); };
      n.getVideoPlaybackQuality = function() { return {totalVideoFrames: this.totalVideoFrames, droppedVideoFrames: this.droppedVideoFrames}; };
      if (videoFrameCallback) {
        n.requestVideoFrameCallback = function(fn) { const id = ++nextId; this.presentedCallbacks.set(id, fn); return id; };
        n.cancelVideoFrameCallback = function(id) { this.presentedCallbacks.delete(id); };
      }
    }
    nodes.push(n); return n;
  }
  const document = eventTarget({hidden: false, createElement: node, getElementById: id => ids.get(id) || null});
  document.body = node('body'); document.head = node('head');
  Object.defineProperty(document, 'visibilityState', {get() { return this.hidden ? 'hidden' : 'visible'; }});
  const sandbox = eventTarget({document, navigator: {hardwareConcurrency: 8}, innerWidth: 1400, innerHeight: 850,
    devicePixelRatio: 1, performance: {now: () => clock}, matchMedia: () => ({matches: reduced}),
    setTimeout(fn, ms) { const id = ++nextId; timers.set(id, {fn, at: clock + ms}); return id; },
    clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame(fn) { const id = ++nextId; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    CustomEvent: function(type, options) { this.type = type; this.detail = options?.detail; }});
  const globalDispatch = sandbox.dispatchEvent;
  sandbox.dispatchEvent = event => { events.push(event); return globalDispatch.call(sandbox, event); };
  sandbox.window = sandbox;
  const source = fs.readFileSync(sourcePath, 'utf8');
  let prepaintMedia;
  if (prepaint) {
    const overlay = node('div'); overlay.id = 'codex-startup-visual';
    overlay.innerHTML = source.match(/overlay\.innerHTML\s*=\s*`([\s\S]*?)`;/)[1];
    document.body.append(overlay);
    prepaintMedia = {story: ids.get('cs-story-video'), burst: ids.get('cs-burst-video'), poster: ids.get('cs-poster')};
  }
  vm.runInNewContext(source, sandbox);
  function tick(target) {
    assert.ok(target >= clock, 'Simulated time never moves backwards');
    while (true) {
      const next = [...timers].filter(([, task]) => task.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      clock = next[1].at; timers.delete(next[0]); next[1].fn();
    }
    clock = target;
  }
  function frame(target = clock + 1000 / 60) {
    tick(target); const pending = [...frames]; frames.clear();
    for (const [, fn] of pending) fn(target);
  }
  function loaded(videoId) { const video = ids.get(videoId); video.readyState = 2; video.dispatchEvent('loadeddata'); return video; }
  function present(videoId, mediaTime = 0) {
    const video = ids.get(videoId); video.readyState = 2; video.currentTime = mediaTime; video.totalVideoFrames++;
    const pending = [...video.presentedCallbacks]; video.presentedCallbacks.clear();
    for (const [, fn] of pending) fn(clock, {mediaTime, presentedFrames: video.totalVideoFrames, expectedDisplayTime: clock});
    return video;
  }
  function end(videoId, mediaTime) {
    const video = ids.get(videoId); video.currentTime = mediaTime; video.duration = mediaTime;
    video.paused = true; video.ended = true; video.dispatchEvent('ended'); return video;
  }
  function visibility(hidden) { document.hidden = hidden; document.dispatchEvent('visibilitychange'); }
  function clean() {
    assert.equal(ids.size, 0, 'Scoped overlay/style IDs removed');
    assert.equal(document.body.children.length, 0); assert.equal(document.head.children.length, 0);
    assert.equal(timers.size, 0, 'Timers cancelled'); assert.equal(frames.size, 0, 'RAF callbacks cancelled');
    assert.equal(document.events.size, 0, 'Document listeners removed');
    assert.equal(sandbox.events.size, 0, 'Global listeners removed');
    for (const n of nodes.filter(n => n.tagName === 'video')) {
      assert.equal(n.paused, true, 'Media paused on cleanup');
      assert.equal(n.presentedCallbacks.size, 0, 'Video frame callbacks cancelled');
      assert.equal(n.events.size, 0, 'Media listeners removed');
    }
    assert.equal(sandbox.__codexStartupVisual, undefined, 'API releases closure');
  }
  const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
  return {document, sandbox, nodes, events, ids, timers, frames, mediaLog, writes, frame, tick, loaded, present,
    end, visibility, clean, flush, prepaintMedia, api: sandbox.__codexStartupVisual, get clock() { return clock; }};
}
module.exports = {fixture};
