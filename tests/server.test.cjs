const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {once} = require('node:events');

(async () => {
  const child = spawn(process.execPath, [path.join(__dirname, '../scripts/serve.cjs')],
    {env:{...process.env, PORT:'0'}, stdio:['ignore','pipe','inherit']});
  try {
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Demo server did not start.')), 5000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.stdout.on('data', data => {
        const match = data.toString().match(/localhost:(\d+)/);
        if (match) { clearTimeout(timer); resolve(Number(match[1])); }
      });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
    });
    const request = (url, headers={}) => new Promise((resolve, reject) => {
      http.get({host:'127.0.0.1', port, path:url, headers}, response => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => resolve({status:response.statusCode, headers:response.headers, body:Buffer.concat(chunks)}));
        response.on('error', reject);
      }).on('error', reject);
    });
    const page = await request('/');
    assert.equal(page.status, 200); assert.match(page.body.toString(), /src\/video-startup.js/);
    const range = await request('/assets/codex-story-v8.webm', {Range:'bytes=0-3'});
    assert.equal(range.status, 206); assert.match(range.headers['content-range'], /^bytes 0-3\/\d+$/);
    assert.deepEqual([...range.body], [0x1a,0x45,0xdf,0xa3]);
    assert.equal((await request('/assets/codex-story-v8.webm', {Range:'bytes=999999999-'})).status, 416);
    assert.equal((await request('/scripts/encode-video.py')).status, 404);
    assert.equal((await request('/assets/%2e%2e/%2e%2e/package.json')).status, 404);
    console.log('PASS: demo serving, video byte ranges, invalid ranges and restricted file paths.');
  } finally {
    const closed = once(child, 'close'); child.kill(); await closed;
  }
})().catch(error => { console.error(error); process.exitCode=1; });
