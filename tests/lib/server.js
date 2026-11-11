// Tiny static server for the browser tests (serves the repo root, like GitHub Pages).
// node tests/lib/server.js [port]   — or used by tests/run.js
const http = require('http'), fs = require('fs'), path = require('path');
const { ROOT } = require('./paths');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.pdf': 'application/pdf' };

function start(port) {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((resolve, reject) => { srv.once('error', reject); srv.listen(port, () => resolve(srv)); });
}

if (require.main === module) start(+process.argv[2] || 8765).then(() => console.log('serving', ROOT));
module.exports = { start };
