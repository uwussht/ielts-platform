// IELTS platform dev/prod server. No dependencies: `node server.js`.
// Serves the static app and proxies the ai-tutor same-origin routes
// (/api/* — AI checks, transcription, TTS — and /ielts/*, /practice/* assets)
// so the app reuses ai-tutor's AI endpoints. The main backend
// (prod-server.justtostudy.kz) allows CORS and is called from the browser directly.
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = +process.env.PORT || 5173;
const UPSTREAM = (process.env.AI_TUTOR_ORIGIN || 'https://ai-tutor.justtostudy.kz').replace(/\/+$/, '');
const ROOT = __dirname;
const PROXY_PREFIXES = ['/api/', '/ielts/', '/practice/'];
// Staff API (server/, run with docker compose). Unset: the staff area says it needs the server.
const STAFF_API = (process.env.STAFF_API_ORIGIN || '').replace(/\/+$/, '');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2',
};

function proxy(req, res, origin = UPSTREAM) {
  const target = new URL(origin + req.url);
  const headers = { ...req.headers, host: target.host };
  delete headers.origin; delete headers.referer; delete headers['accept-encoding'];
  const up = (target.protocol === 'http:' ? http : https).request(target, { method: req.method, headers }, (r) => {
    const h = { ...r.headers };
    delete h['content-security-policy'];
    res.writeHead(r.statusCode || 502, h);
    r.pipe(res);
  });
  up.on('error', (e) => { res.writeHead(502, { 'content-type': 'text/plain' }); res.end('Upstream error: ' + e.message); });
  req.pipe(up);
}

// Never served: the server code, the staff API and Docker/env files.
const PRIVATE = ['server.js', 'server', 'Dockerfile', 'docker-compose.yaml', 'node_modules'];

function serveStatic(req, res) {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(ROOT, p));
  const rel = path.relative(ROOT, file).split(path.sep);
  if (!file.startsWith(ROOT) || PRIVATE.includes(rel[0]) || rel.some((x) => x.startsWith('.'))) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    // Unknown paths fall back to the SPA entry so deep links work.
    const f = !err && st.isFile() ? file : path.join(ROOT, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    fs.createReadStream(f).pipe(res);
  });
}

http.createServer((req, res) => {
  if (req.url.startsWith('/staff-api/')) {
    if (STAFF_API) return proxy(req, res, STAFF_API);
    res.writeHead(503, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, reason: 'no-server' }));
  }
  const local = PROXY_PREFIXES.some((p) => req.url.startsWith(p)) && !fs.existsSync(path.join(ROOT, decodeURIComponent(req.url.split('?')[0])));
  if (local) return proxy(req, res);
  serveStatic(req, res);
}).listen(PORT, () => console.log(`IELTS platform → http://localhost:${PORT}  (proxy ${UPSTREAM})`));
