const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const root = path.join(__dirname, '..');
const build = spawnSync(process.execPath, [path.join(root, 'scripts/build-demo.cjs')], {encoding:'utf8'});
assert.equal(build.status, 0, build.stderr);
const html = fs.readFileSync(path.join(root, 'demo/index.html'), 'utf8');
assert.equal((html.match(/id="root"/g) || []).length, 1);
assert.equal((html.match(/id="codex-startup-visual"/g) || []).length, 1);
assert.match(html, /<base href="\.\.\/">/);
assert.ok(html.indexOf('src/video-startup.js') < html.indexOf('src/readiness.js'));
assert.match(html, /data-codex-composer="true" contenteditable="true"/);
for (const [, relative] of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  if (relative === '../') continue;
  const file = path.resolve(root, relative);
  assert.ok(file.startsWith(path.resolve(root) + path.sep), 'Demo assets remain inside the repository.');
  assert.ok(fs.statSync(file).isFile(), `Missing demo asset: ${relative}`);
}
for (const name of ['codex-story-v8.webm', 'codex-burst-v8.webm']) {
  const data = fs.readFileSync(path.join(root, 'assets', name));
  assert.deepEqual([...data.subarray(0, 4)], [0x1a, 0x45, 0xdf, 0xa3], 'WebM EBML header');
  assert.ok(data.length > 1000);
}
const poster = fs.readFileSync(path.join(root, 'assets/codex-poster-v8.png'));
assert.deepEqual([...poster.subarray(0, 8)], [137,80,78,71,13,10,26,10], 'PNG signature');
for (const file of ['src/cartoon-source.js','src/video-startup.js','src/readiness.js']) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  assert.doesNotMatch(source, /[A-Z]:[\\/]/, 'Portable source has no Windows absolute paths.');
  assert.doesNotMatch(source, /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b/, 'Startup source does not contact a service.');
}
console.log('PASS: reproducible demo markup, repository-local asset paths, media signatures and standalone sources.');
