// Render the editable SVG story into raster frames; no browser is required.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { fixture } = require('../tests/drawing-fixture.cjs');

const ROOT = path.join(__dirname, '../build/frames');
const SOURCE = path.join(__dirname, '../src/cartoon-source.js');
const RATE = 60, WIDTH = 1400, HEIGHT = 850;
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

(async () => {
  fs.mkdirSync(ROOT, { recursive: true });
  const source = fs.readFileSync(SOURCE);
  const f = fixture({ sourcePath: SOURCE, width: WIDTH, height: HEIGHT });
  const overlay = f.ids.get('codex-startup-visual');
  const svgNode = overlay.querySelector('svg');
  const css = f.document.head.children.map(node => node.textContent).join('\n').replace(/#codex-startup-visual\s*/g, '');
  const backdrop = '<defs><pattern id="video-paper-dots" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="1.4" cy="1.4" r="1.4" fill="#6ca98b" opacity=".188"/></pattern></defs><rect width="1400" height="850" fill="#f6f5e9"/><rect width="1400" height="850" fill="url(#video-paper-dots)"/>';
  function svg() {
    let xml = f.serialize(svgNode);
    xml = xml.replace(/<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="850"');
    return Buffer.from(xml.replace(/(<svg[^>]*>)/, '$1<style>' + css + '</style>' + backdrop));
  }
  const render = filename => sharp(svg()).removeAlpha().png({ compressionLevel: 1 }).toFile(filename);
  await render(path.join(ROOT, 'codex-poster-v8.png'));
  const manifest = { source_sha256: digest(source), frame_rate: RATE, width: WIDTH, height: HEIGHT,
    story_duration_ms: 7600, burst_duration_ms: 500, story_frames: 456, burst_frames: 30,
    background: '#f6f5e9 with comic paper dots', ui_baked: false,
    method: 'Execute v7 component SVG states in the existing VM fixture, then rasterize with installed sharp; this is not measured browser playback.' };
  for (const part of ['story', 'burst']) fs.mkdirSync(path.join(ROOT, part + '-frames'), { recursive: true });
  f.frame(0);
  console.log('Rendering 456 story frames at 60 fps…');
  for (let index = 0; index < 456; index++) {
    f.frame((index + 1) * 1000 / RATE);
    await render(path.join(ROOT, 'story-frames', String(index).padStart(4, '0') + '.png'));
  }
  if (overlay.dataset.stage !== 'full') throw new Error('Story must reach the full waiting pose.');
  await render(path.join(ROOT, 'codex-wait-v8.png'));
  f.api.finish();
  console.log('Rendering 30 comic burst frames at 60 fps…');
  for (let index = 0; index < 30; index++) {
    f.frame(7600 + (index + 1) * 1000 / RATE);
    await render(path.join(ROOT, 'burst-frames', String(index).padStart(4, '0') + '.png'));
  }
  await render(path.join(ROOT, 'codex-burst-final-v8.png'));
  f.api.cancel();
  f.clean();
  fs.writeFileSync(path.join(ROOT, 'render-manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('SVG raster frames and poster are complete.');
})().catch(error => { console.error(error); process.exitCode = 1; });
