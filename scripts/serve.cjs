const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 8080);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid PORT.');
const mime = {'.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.webm':'video/webm', '.png':'image/png'};

const server = http.createServer((request, response) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch { response.writeHead(400).end(); return; }
  if (pathname === '/') pathname = '/demo/index.html';
  const file = path.resolve(root, '.' + pathname);
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative) ||
      !/^(demo|src|assets)[\\/]/.test(relative)) {
    response.writeHead(404).end(); return;
  }
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) { response.writeHead(404).end(); return; }
    const headers = {'Content-Type':mime[path.extname(file)] || 'application/octet-stream',
      'Accept-Ranges':'bytes', 'Cache-Control':'no-cache'};
    const range = request.headers.range;
    let start = 0, end = stat.size - 1;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) { response.writeHead(416).end(); return; }
      if (!match[1]) start = Math.max(0, stat.size - Number(match[2]));
      else start = Number(match[1]);
      if (match[1] && match[2]) end = Math.min(end, Number(match[2]));
      if (start > end || start >= stat.size) {
        response.writeHead(416, {'Content-Range':`bytes */${stat.size}`}).end(); return;
      }
      headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
    }
    headers['Content-Length'] = end - start + 1;
    response.writeHead(range ? 206 : 200, headers);
    if (request.method === 'HEAD') response.end();
    else fs.createReadStream(file, {start, end}).on('error', () => response.destroy()).pipe(response);
  });
});
server.listen(port, '127.0.0.1', () => console.log(`Open http://localhost:${server.address().port}/demo/index.html`));
