/* Local 60 fps cartoon video; no per-frame SVG or DOM animation work. */
(() => {
  'use strict';
  window.__codexStartupVisual?.cancel();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const STORY = 7600, started = performance.now(), timers = new Set();
  const listeners = [], firstFrames = new Set(), frameCallbacks = new Map(), frameChecks = new Map();
  let disposed = false, requested = false, fading = false, failed = false;
  let storyEnded = false, burstStarted = false, paused = 0;
  let hiddenAt = document.hidden ? started : null, resolveDone;
  const done = new Promise(resolve => { resolveDone = resolve; });
  function later(fn, delay) {
    const id = setTimeout(() => { timers.delete(id); fn(); }, delay);
    timers.add(id); return id;
  }
  function listen(target, type, fn, options) {
    target.addEventListener(type, fn, options);
    listeners.push([target, type, fn, options]);
  }
  const style = document.createElement('style');
  style.id = 'codex-startup-visual-style';
  style.textContent = `
    #codex-startup-visual { position:fixed; inset:0; z-index:2147483647; overflow:hidden;
      background:#f6f5e9; color:#152723; isolation:isolate; opacity:1; contain:layout paint;
      font-family:"Arial Rounded MT Bold","Microsoft YaHei","Segoe UI",sans-serif;
      transition:opacity 220ms ease; }
    #codex-startup-visual::before { content:""; position:absolute; inset:0;
      background:radial-gradient(circle,#6ca98b30 1.4px,transparent 1.8px) 0 0/18px 18px;
      pointer-events:none; }
    #codex-startup-visual .cs-media { position:absolute; inset:0; width:100%; height:100%;
      display:block; object-fit:contain; pointer-events:none; }
    #codex-startup-visual video.cs-media { opacity:0; }
    #codex-startup-visual[data-video="story"] #cs-story-video,
    #codex-startup-visual[data-video="burst"] #cs-burst-video { opacity:1; }
    #codex-startup-visual[data-video="story"] #cs-poster,
    #codex-startup-visual[data-video="burst"] #cs-poster { opacity:0; }
    #codex-startup-visual .cs-ui { position:absolute; top:22px; left:28px; right:28px;
      display:flex; align-items:center; justify-content:space-between; gap:12px; pointer-events:none; }
    #codex-startup-visual .cs-brand { font-size:13px; font-weight:900; letter-spacing:2px; }
    #codex-startup-visual .cs-chapter { background:#fffaf0; border:2px solid #18322a;
      border-radius:999px; padding:7px 14px; font-size:12px; font-weight:800;
      box-shadow:3px 3px 0 #18322a; }
    #codex-startup-visual .cs-footer { position:absolute; bottom:20px; left:28px; right:28px;
      display:flex; gap:12px; align-items:center; justify-content:space-between; }
    #codex-startup-visual .cs-status { font-size:12px; font-weight:700; color:#486158; }
    #codex-startup-visual .cs-skip { appearance:none; background:#fffaf0; color:#18322a;
      border:2px solid #18322a; border-radius:999px; padding:8px 14px;
      font:700 12px/1.2 "Microsoft YaHei","Segoe UI",sans-serif; cursor:pointer; }
    #codex-startup-visual .cs-skip:focus-visible { outline:3px solid #00a66c; outline-offset:3px; }
    #codex-startup-visual[data-leaving] { pointer-events:none; }
    #codex-startup-visual[data-leaving="ready"] { will-change:opacity; }
    #codex-startup-visual[data-exit-mode="fade"] { opacity:0; }
    #codex-startup-visual[data-exit-mode="comic"] .cs-ui,
    #codex-startup-visual[data-exit-mode="comic"] .cs-footer { opacity:0; }
    @media (max-width:600px) { #codex-startup-visual .cs-ui { top:16px; left:16px; right:16px; }
      #codex-startup-visual .cs-brand { font-size:10px; letter-spacing:1px; }
      #codex-startup-visual .cs-chapter { font-size:10px; padding:6px 9px; }
      #codex-startup-visual .cs-footer { bottom:16px; left:16px; right:16px; }
      #codex-startup-visual .cs-status { font-size:10px; max-width:55%; }
      #codex-startup-visual .cs-skip { font-size:10px; padding:7px 10px; } }
    @media (max-height:440px) { #codex-startup-visual .cs-ui { top:10px; }
      #codex-startup-visual .cs-footer { bottom:10px; } }
    @media (prefers-reduced-motion:reduce) { #codex-startup-visual { transition-duration:120ms; } }
  `;
  const overlay = document.getElementById('codex-startup-visual') || document.createElement('div');
  overlay.id = 'codex-startup-visual';
  overlay.setAttribute('aria-label', 'Codex 卡通喝水启动动画，点击或按 Escape 跳过');
  if (!overlay.querySelector('#cs-story-video')) {
    overlay.innerHTML = `
    <img id="cs-poster" class="cs-media" src="./assets/codex-poster-v8.png" alt="" aria-hidden="true" draggable="false">
    <video id="cs-story-video" class="cs-media" src="./assets/codex-story-v8.webm" preload="auto" muted playsinline disablepictureinpicture aria-hidden="true"></video>
    <video id="cs-burst-video" class="cs-media" src="./assets/codex-burst-v8.webm" preload="auto" muted playsinline disablepictureinpicture aria-hidden="true"></video>
    <div class="cs-ui"><span class="cs-brand">CODEX / 灵感补给站</span><span class="cs-chapter">01 · 超大瓶登场</span></div>
    <div class="cs-footer"><span class="cs-status" role="status" aria-live="polite">正在开启对话界面</span><button type="button" class="cs-skip">点击 / Esc 跳过</button></div>
    `;
  }
  document.head.append(style);
  if (!overlay.isConnected) document.body.append(overlay);
  const story = overlay.querySelector('#cs-story-video'), burst = overlay.querySelector('#cs-burst-video');
  const status = overlay.querySelector('.cs-status'), chapter = overlay.querySelector('.cs-chapter');
  const videos = [story, burst];
  let currentStage = 'bottle';
  overlay.dataset.stage = currentStage;

  function stage(value, text) {
    if (value === currentStage) return;
    currentStage = value; overlay.dataset.stage = value;
    if (text && chapter.textContent !== text) chapter.textContent = text;
  }
  function clearFirstFrame(video) {
    const callback = frameCallbacks.get(video), check = frameChecks.get(video);
    if (callback !== undefined) video.cancelVideoFrameCallback?.(callback);
    if (check !== undefined) cancelAnimationFrame(check);
    frameCallbacks.delete(video); frameChecks.delete(video);
  }
  function showFirstFrame(video) {
    if (disposed || fading || failed || document.hidden || video.readyState < 2) return;
    if (video === story && burstStarted) return;
    if (video === burst && !burstStarted) return;
    firstFrames.add(video); clearFirstFrame(video);
    overlay.dataset.video = video === story ? 'story' : 'burst';
  }
  function confirmFirstFrame(video) {
    if (disposed || fading || failed || reduced || document.hidden || firstFrames.has(video)) return;
    if (video === burst && !burstStarted) return;
    if (typeof video.requestVideoFrameCallback === 'function' && !frameCallbacks.has(video)) {
      const id = video.requestVideoFrameCallback(() => {
        frameCallbacks.delete(video); showFirstFrame(video);
      });
      frameCallbacks.set(video, id);
    }
    // HAVE_CURRENT_DATA means a decoded frame is already available. Keep the poster
    // until the next paint; this also covers Chromium builds without video callbacks.
    if (video.readyState >= 2 && !frameChecks.has(video)) {
      const id = requestAnimationFrame(() => {
        frameChecks.delete(video); showFirstFrame(video);
      });
      frameChecks.set(video, id);
    }
  }
  function cleanup(reason) {
    if (disposed) return;
    disposed = true;
    timers.forEach(clearTimeout); timers.clear();
    for (const [target, type, fn, options] of listeners) target.removeEventListener(type, fn, options);
    for (const video of videos) {
      clearFirstFrame(video);
      try { video.pause(); video.removeAttribute('src'); video.load(); } catch {}
    }
    overlay.remove(); style.remove();
    if (window.__codexStartupVisual === api) delete window.__codexStartupVisual;
    resolveDone({reason});
    dispatchEvent(new CustomEvent('codex:startup-visual-removed', {detail:{reason}}));
  }
  function fade(reason, duration) {
    if (disposed || fading) return;
    fading = true;
    for (const video of videos) { clearFirstFrame(video); video.pause(); }
    overlay.dataset.leaving = reason; stage('leaving');
    overlay.dataset.exitMode = 'fade'; overlay.style.transitionDuration = duration + 'ms';
    later(() => cleanup(reason), duration + 50);
  }
  function mediaFailure() {
    if (disposed || fading || failed) return;
    failed = true;
    for (const video of videos) { clearFirstFrame(video); video.pause(); }
    delete overlay.dataset.video;
    stage('fallback', '正在准备对话');
    if (requested) fade('ready', 850);
    else dispatchEvent(new CustomEvent('codex:startup-visual-fallback'));
  }
  function play(video) {
    if (disposed || fading || failed || reduced || document.hidden) return;
    confirmFirstFrame(video);
    try {
      const pending = video.play();
      pending?.catch?.(error => {
        if (error?.name !== 'AbortError' && !disposed && !fading && !document.hidden) mediaFailure();
      });
    } catch { mediaFailure(); }
  }
  function startBurst() {
    if (disposed || fading || failed || burstStarted || document.hidden) return;
    burstStarted = true; overlay.dataset.leaving = 'ready'; overlay.dataset.exitMode = 'comic';
    stage('burst', '06 · 嘭！灵感溢出');
    status.textContent = '正在进入对话…';
    play(burst);
    // Media stalls must also release the overlay without relying on ended events.
    later(() => fade('ready', 500), 2000);
  }
  function finish() {
    if (disposed || requested || fading) return done;
    requested = true;
    if (reduced) later(() => fade('ready', 120), Math.max(0, 120 - (performance.now() - started)));
    else if (failed) fade('ready', 850);
    else if (storyEnded) startBurst();
    return done;
  }
  function storyProgress() {
    if (disposed || fading || burstStarted || storyEnded || failed) return;
    const t = story.currentTime * 1000;
    if (t < 1850) stage('bottle', '01 · 超大瓶登场');
    else if (t < 2900) stage('enter', '02 · Codex 来了');
    else if (t < 4700) stage('uncap', '03 · 拧开灵感');
    else stage('drink', '04 · 咕嘟 × 无限');
  }
  function visibility() {
    if (disposed) return;
    const now = performance.now();
    if (document.hidden) {
      if (hiddenAt === null) hiddenAt = now;
      for (const video of videos) { clearFirstFrame(video); video.pause(); }
    } else {
      if (hiddenAt !== null) { paused += now - hiddenAt; hiddenAt = null; }
      if (fading || failed || reduced) return;
      if (burstStarted) play(burst);
      else if (storyEnded) { if (requested) startBurst(); }
      else play(story);
    }
  }
  function skip(event) {
    event?.preventDefault?.(); event?.stopPropagation?.();
    fade('skipped', reduced ? 120 : 220);
  }
  const api = {finish, cancel:() => cleanup('cancelled'), done,
    get notBefore() {
      return started + (reduced || failed ? 120 : STORY) + paused +
        (hiddenAt === null ? 0 : performance.now() - hiddenAt);
    },
    setStatus(text) {
      if (!disposed && !fading && !burstStarted && typeof text === 'string') {
        const next = text.slice(0, 80);
        if (status.textContent !== next) status.textContent = next;
      }
    }};
  window.__codexStartupVisual = api;
  listen(overlay, 'pointerdown', skip);
  listen(overlay, 'transitionend', event => {
    if (fading && event.target === overlay && event.propertyName === 'opacity') cleanup(overlay.dataset.leaving);
  });
  listen(window, 'keydown', event => { if (event.key === 'Escape') skip(event); }, true);
  listen(document, 'visibilitychange', visibility);
  for (const video of videos) {
    video.muted = true;
    listen(video, 'loadeddata', () => confirmFirstFrame(video));
    listen(video, 'error', mediaFailure);
  }
  listen(story, 'timeupdate', storyProgress);
  listen(story, 'ended', () => {
    if (disposed || fading || failed || storyEnded) return;
    storyEnded = true; stage('full', '05 · 灵感满格');
    if (requested) startBurst();
  });
  listen(burst, 'ended', () => { if (burstStarted && !disposed && !failed) fade('ready', 500); });
  later(() => fade('timeout', reduced ? 120 : 850), 15000);
  later(() => cleanup('timeout'), 17000);
  if (reduced) {
    for (const video of videos) { video.removeAttribute('src'); video.load(); }
  } else if (!document.hidden) play(story);
})();
