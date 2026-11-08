// IELTS platform dev/prod server. No dependencies: `node server.js`.
// Serves the static app, the test content (content/, under /content-api) and its
// audio and pictures (content/media, under /media). Still proxied to ai-tutor: the
// same-origin AI routes (/api/*) and its /ielts/*, /practice/* assets.
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
// Test content copied into content/ (index.json, tests/, transcripts/, models/).
const CONTENT = path.join(ROOT, 'content');
const MEDIA = path.join(CONTENT, 'media');
// Host the media URLs in the documents point at; they are rewritten to /media/.
const MEDIA_HOST = 'https://files.justtostudy.kz';
// Until scripts/fetch-media.js has run, a missing file is fetched from here.
// Set MEDIA_FALLBACK= (empty) to answer 404 instead.
const MEDIA_FALLBACK = (process.env.MEDIA_FALLBACK ?? MEDIA_HOST).replace(/\/+$/, '');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.woff2': 'font/woff2',
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
// content/ is read through /content-api and /media only.
const PRIVATE = ['server.js', 'server', 'scripts', 'content', 'Dockerfile', 'docker-compose.yaml', 'node_modules'];

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

// ---- content API: the same paths and shapes as the backend's /mobile/ielts/* ----
let INDEX = null;
const index = () => (INDEX ||= JSON.parse(fs.readFileSync(path.join(CONTENT, 'index.json'), 'utf8')));
const safeId = (id) => id.replace(/[^A-Za-z0-9._-]/g, '_');
const localMedia = (txt) => txt.split(MEDIA_HOST + '/').join('/media/');

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': TYPES['.json'], 'cache-control': 'no-cache' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
function sendFile(res, dir, id) {
  fs.readFile(path.join(CONTENT, dir, safeId(id) + '.json'), 'utf8', (err, txt) => {
    if (err) return sendJson(res, 404, { message: 'Not found' });
    sendJson(res, 200, localMedia(txt));
  });
}
function content(req, res, rest) {
  if (req.method !== 'GET') return sendJson(res, 405, { message: 'Read-only' });
  const url = new URL(rest, 'http://x');
  const seg = url.pathname.replace(/^\/mobile\/ielts\//, '').split('/').map(decodeURIComponent);
  try {
    if (seg[0] === 'tests' && seg.length === 1) {
      const list = index().lists[url.searchParams.get('skill') || 'reading'] || [];
      return sendJson(res, 200, localMedia(JSON.stringify(list)));
    }
    if (seg[0] === 'tests' && seg.length === 2) return sendFile(res, 'tests', seg[1]);
    if (seg[0] === 'tests' && seg[2] === 'transcript') return sendFile(res, 'transcripts', seg[1]);
    if (seg[0] === 'tests' && seg[2] === 'model') return sendFile(res, 'models', seg[1]);
    if (seg[0] === 'mocks' && seg.length === 1) {
      const mod = url.searchParams.get('module');
      return sendJson(res, 200, { mocks: index().mocks.filter((m) => !mod || m.module === mod), history: [] });
    }
  } catch (e) { return sendJson(res, 500, { message: e.message }); }
  sendJson(res, 404, { message: 'Not found' });
}

// ---- media: content/media/<path on the file host>, with Range for audio seeking ----
function media(req, res) {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname.slice('/media/'.length));
  const file = path.normalize(path.join(MEDIA, rel));
  if (!file.startsWith(MEDIA + path.sep) || rel.split('/').some((x) => x.startsWith('.'))) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      if (MEDIA_FALLBACK) { res.writeHead(302, { location: MEDIA_FALLBACK + '/' + rel }); return res.end(); }
      res.writeHead(404); return res.end();
    }
    const type = TYPES[path.extname(file)] || 'application/octet-stream';
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (m && (m[1] || m[2])) {
      const start = m[1] ? +m[1] : Math.max(0, st.size - +m[2]);
      const end = m[1] && m[2] ? Math.min(+m[2], st.size - 1) : st.size - 1;
      if (start > end || start >= st.size) { res.writeHead(416, { 'content-range': `bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, { 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${st.size}`, 'content-length': end - start + 1, 'cache-control': 'public, max-age=86400' });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': st.size, 'cache-control': 'public, max-age=86400' });
    fs.createReadStream(file).pipe(res);
  });
}

http.createServer((req, res) => {
  if (req.url.startsWith('/content-api/')) return content(req, res, req.url.slice('/content-api'.length));
  if (req.url.startsWith('/media/')) return media(req, res);
  if (req.url.startsWith('/staff-api/')) {
    if (STAFF_API) return proxy(req, res, STAFF_API);
    res.writeHead(503, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, reason: 'no-server' }));
  }
  const local = PROXY_PREFIXES.some((p) => req.url.startsWith(p)) && !fs.existsSync(path.join(ROOT, decodeURIComponent(req.url.split('?')[0])));
  if (local) return proxy(req, res);
  serveStatic(req, res);
}).listen(PORT, () => console.log(`IELTS platform → http://localhost:${PORT}  (proxy ${UPSTREAM})`));
