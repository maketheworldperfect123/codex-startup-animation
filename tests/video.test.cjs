const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {fixture} = require('./video-fixture.cjs');

const STORY = 'cs-story-video', BURST = 'cs-burst-video', OVERLAY = 'codex-startup-visual';
const cases = [];
const report = {
  scope: 'Controlled Node VM media lifecycle checks. Video events and presented frames are simulated. This is not a browser video decoding, GPU, display refresh, native startup, or FPS benchmark.',
  source_sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '../src/video-startup.js'))).digest('hex'),
  cases,
  browser_frame_rate_benchmark_executed: false,
  native_video_playback_executed: false
};
const overlay = f => f.ids.get(OVERLAY);
const story = f => f.ids.get(STORY);
const burst = f => f.ids.get(BURST);
const prime = f => { f.loaded(STORY); f.present(STORY, 1 / 60); };
function callbacks(f) { return f.nodes.filter(n => n.tagName === 'video').reduce((sum, n) => sum + n.presentedCallbacks.size, 0); }
async function run(name, fn) {
  try { const detail = await fn(); cases.push({name, passed: true, ...(detail || {})}); console.log('PASS: ' + name); }
  catch (error) { cases.push({name, passed: false, error: error.message, stack: error.stack}); throw error; }
}
async function cancelAndClean(f) { f.api.cancel(); assert.equal((await f.api.done).reason, 'cancelled'); f.clean(); }
async function finishBurst(f, at) {
  f.loaded(BURST); f.present(BURST, 1 / 60);
  f.tick(at + 500); f.end(BURST, .5);
  assert.equal(overlay(f).style.transitionDuration, '500ms');
  f.tick(at + 1050); assert.equal((await f.api.done).reason, 'ready'); f.clean();
}

(async () => {
  await run('Early ready waits for the full story, then the 0.5 s burst and 0.5 s reveal', async () => {
    const f = fixture();
    assert.equal(story(f).muted, true); assert.equal(burst(f).muted, true);
    assert.equal(story(f).playCalls, 1); assert.equal(burst(f).playCalls, 0);
    assert.equal(overlay(f).dataset.video, undefined, 'Poster remains visible before decoded video data');
    const done = f.api.finish(); assert.equal(f.api.finish(), done, 'Repeated finish returns the same promise');
    f.loaded(STORY); assert.equal(overlay(f).dataset.video, undefined, 'loadeddata alone does not immediately hide the poster');
    f.present(STORY, 1 / 60); assert.equal(overlay(f).dataset.video, 'story');
    f.tick(7600); assert.equal(burst(f).playCalls, 0, 'A wall-clock deadline cannot bypass story ended');
    f.end(STORY, 7.6); assert.equal(burst(f).playCalls, 1); assert.equal(overlay(f).dataset.stage, 'burst');
    assert.equal(overlay(f).dataset.video, 'story', 'Keep the final story frame until the first burst frame exists');
    await finishBurst(f, 7600);
    return {story_ms: 7600, burst_ms: 500, reveal_ms: 500, cleanup_fallback_ms: 50};
  });
  await run('Late ready holds the final story frame with no continuous RAF loop', async () => {
    const f = fixture(); prime(f); f.loaded(BURST);
    assert.equal(burst(f).playCalls, 0, 'Preloading is not playback');
    f.tick(7600); f.end(STORY, 7.6);
    assert.equal(overlay(f).dataset.stage, 'full'); assert.equal(overlay(f).dataset.video, 'story');
    assert.equal(story(f).paused, true); assert.equal(f.frames.size, 0); assert.equal(callbacks(f), 0);
    story(f).dispatchEvent('timeupdate'); assert.equal(overlay(f).dataset.stage, 'full', 'Late timeupdate cannot revert the held stage');
    f.tick(10600); assert.equal(burst(f).playCalls, 0); f.api.finish();
    assert.equal(burst(f).playCalls, 1); assert.equal(overlay(f).dataset.video, 'story');
    f.frame(10600 + 1000 / 60); assert.equal(overlay(f).dataset.video, 'burst', 'Decoded preloaded burst is revealed on the next paint');
    await finishBurst(f, f.clock);
    return {waiting_ms: 3000, waiting_raf_callbacks: 0};
  });
  await run('Loadeddata plus one paint is a bounded fallback without video-frame callbacks', async () => {
    const f = fixture({videoFrameCallback: false});
    assert.equal(f.frames.size, 0); assert.equal(overlay(f).dataset.video, undefined);
    f.loaded(STORY); assert.equal(f.frames.size, 1); assert.equal(overlay(f).dataset.video, undefined);
    f.frame(); assert.equal(overlay(f).dataset.video, 'story'); assert.equal(f.frames.size, 0);
    await cancelAndClean(f);
  });
  await run('Prepaint overlay is reused and scoped assets clean up', async () => {
    const f = fixture({prepaint: true});
    assert.equal(f.document.body.children.length, 1); assert.equal(f.ids.get('cs-poster').src, './assets/codex-poster-v8.png');
    assert.equal(story(f), f.prepaintMedia.story); assert.equal(burst(f), f.prepaintMedia.burst);
    assert.equal(f.ids.get('cs-poster'), f.prepaintMedia.poster, 'Native prepaint media objects are reused without duplicate decoder loading');
    await cancelAndClean(f);
  });
  await run('Story hidden pause and visible resume retain the decoded frame and compensate notBefore', async () => {
    const f = fixture(); prime(f); f.tick(1000); f.visibility(true);
    assert.equal(story(f).paused, true); assert.equal(burst(f).paused, true); assert.equal(callbacks(f), 0); assert.equal(f.frames.size, 0);
    f.tick(4000); assert.equal(f.api.notBefore, 10600);
    const played = story(f).playCalls; f.visibility(false); assert.equal(story(f).playCalls, played + 1);
    assert.equal(story(f).paused, false); assert.equal(overlay(f).dataset.video, 'story'); assert.equal(f.api.notBefore, 10600);
    await cancelAndClean(f);
  });
  await run('Ready requested while hidden does not start a new media clip until visible', async () => {
    const f = fixture(); prime(f); f.tick(7600); f.end(STORY, 7.6); f.visibility(true); f.api.finish();
    assert.equal(burst(f).playCalls, 0); assert.equal(overlay(f).dataset.stage, 'full');
    f.tick(8000); f.visibility(false); assert.equal(burst(f).playCalls, 1);
    await cancelAndClean(f);
  });
  await run('Burst hidden pause and visible resume continue the same clip', async () => {
    const f = fixture(); prime(f); f.api.finish(); f.tick(7600); f.end(STORY, 7.6); f.loaded(BURST); f.present(BURST, .1);
    f.tick(7700); f.visibility(true); assert.equal(burst(f).paused, true);
    f.tick(8200); const currentTime = burst(f).currentTime, played = burst(f).playCalls;
    f.visibility(false); assert.equal(burst(f).playCalls, played + 1); assert.equal(burst(f).currentTime, currentTime);
    await finishBurst(f, 8200);
  });
  await run('Rejected autoplay holds the static poster until ready and announces a shorter readiness deadline', async () => {
    const f = fixture({rejectedPlay: [STORY]}); await f.flush();
    assert.equal(overlay(f).dataset.stage, 'fallback'); assert.equal(overlay(f).dataset.video, undefined); assert.equal(f.api.notBefore, 120);
    assert.equal(f.events.filter(event => event.type === 'codex:startup-visual-fallback').length, 1);
    assert.equal(story(f).paused, true); assert.equal(callbacks(f), 0); assert.equal(f.frames.size, 0);
    f.tick(500); assert.ok(overlay(f)); f.api.finish(); assert.equal(overlay(f).style.transitionDuration, '850ms');
    f.tick(1400); assert.equal((await f.api.done).reason, 'ready'); f.clean();
  });
  await run('Media load errors are handled once and ignore late decoded-frame callbacks', async () => {
    const f = fixture(); prime(f); story(f).dispatchEvent('error'); burst(f).dispatchEvent('error');
    assert.equal(overlay(f).dataset.stage, 'fallback'); assert.equal(overlay(f).dataset.video, undefined);
    assert.equal(f.events.filter(event => event.type === 'codex:startup-visual-fallback').length, 1);
    f.loaded(STORY); f.present(STORY); assert.equal(overlay(f).dataset.video, undefined); assert.equal(callbacks(f), 0);
    await cancelAndClean(f);
  });
  await run('Rejected burst playback fades gracefully after composer readiness', async () => {
    const f = fixture({rejectedPlay: [BURST]}); prime(f); f.api.finish(); f.tick(7600); f.end(STORY, 7.6); await f.flush();
    assert.equal(overlay(f).dataset.exitMode, 'fade'); assert.equal(overlay(f).style.transitionDuration, '850ms');
    f.tick(8500); assert.equal((await f.api.done).reason, 'ready'); f.clean();
  });
  await run('Intentional pause AbortError arriving after visible resume does not trigger media failure', async () => {
    const f = fixture({deferredPlay: [STORY]}); const video = story(f);
    f.visibility(true); f.tick(200); f.visibility(false);
    const error = new Error('Mock pause interrupted play'); error.name = 'AbortError'; video.pendingPlay.shift().reject(error); await f.flush();
    assert.notEqual(overlay(f).dataset.stage, 'fallback'); assert.equal(f.api.notBefore, 7800);
    video.pendingPlay.shift().resolve(); await f.flush(); await cancelAndClean(f);
  });
  await run('Pointer skip and Escape skip release all media, listeners, timers and callbacks', async () => {
    for (const mode of ['pointer', 'escape']) {
      const f = fixture();
      if (mode === 'pointer') overlay(f).dispatchEvent('pointerdown');
      else f.sandbox.dispatchEvent({type: 'keydown', key: 'Escape'});
      assert.equal(overlay(f).style.transitionDuration, '220ms'); assert.equal(callbacks(f), 0);
      f.tick(270); assert.equal((await f.api.done).reason, 'skipped'); f.clean();
      for (const video of f.nodes.filter(n => n.tagName === 'video')) { assert.equal(video.src, ''); assert.ok(video.loadCalls > 0); }
    }
  });
  await run('Reduced motion never plays the clips and preserves the short readable intro', async () => {
    const f = fixture({reduced: true}); assert.equal(story(f).playCalls, 0); assert.equal(burst(f).playCalls, 0);
    assert.equal(story(f).src, ''); assert.equal(burst(f).src, ''); assert.equal(f.api.notBefore, 120);
    f.api.finish(); f.tick(119); assert.equal(overlay(f).dataset.exitMode, undefined);
    f.tick(120); assert.equal(overlay(f).style.transitionDuration, '120ms');
    f.tick(290); assert.equal((await f.api.done).reason, 'ready'); f.clean();
  });
  await run('A stalled burst releases the overlay through its independent 2 s fallback', async () => {
    const f = fixture(); prime(f); f.api.finish(); f.tick(7600); f.end(STORY, 7.6);
    f.tick(9600); assert.equal(overlay(f).style.transitionDuration, '500ms');
    f.tick(10150); assert.equal((await f.api.done).reason, 'ready'); f.clean();
  });
  await run('Overall timeout releases a stalled or hidden renderer without media ended', async () => {
    const f = fixture(); f.visibility(true); f.tick(15000); assert.equal(overlay(f).style.transitionDuration, '850ms');
    f.tick(15900); assert.equal((await f.api.done).reason, 'timeout'); f.clean();
  });
  await run('Opacity transition completion cleans up before its fallback timer', async () => {
    const f = fixture(); overlay(f).dispatchEvent('pointerdown');
    overlay(f).dispatchEvent({type: 'transitionend', propertyName: 'opacity'});
    assert.equal((await f.api.done).reason, 'skipped'); f.clean();
  });
  await run('Cancelled media cannot revive from late playback promises or lifecycle events', async () => {
    const f = fixture({deferredPlay: [STORY]}); const video = story(f); await cancelAndClean(f);
    video.pendingPlay.shift().reject(new Error('Mock late playback rejection')); await f.flush();
    video.dispatchEvent('loadeddata'); video.dispatchEvent('ended'); f.tick(18000); f.clean();
    assert.equal(f.events.filter(event => event.type === 'codex:startup-visual-removed').length, 1);
  });

  const readiness = spawnSync(process.execPath, [path.join(__dirname, 'readiness.test.cjs')], {encoding: 'utf8'});
  report.video_readiness = {passed: readiness.status === 0, exit_code: readiness.status,
    stdout: readiness.stdout.trim(), stderr: readiness.stderr.trim(),
    source_sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '../src/readiness.js'))).digest('hex')};
  assert.equal(readiness.status, 0, readiness.stderr || readiness.stdout || 'Video readiness selfcheck failed');
  console.log(readiness.stdout.trim()); report.passed = true;
})().catch(error => { report.passed = false; report.error = error.message; console.error(error); process.exitCode = 1; })
  .finally(() => {
    const output = path.join(__dirname, '../build/playback-checks.json');
    fs.mkdirSync(path.dirname(output), {recursive: true}); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  });
