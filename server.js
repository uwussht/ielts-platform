// IELTS platform dev/prod server. No dependencies: `node server.js`.
// Live mode (`node --watch server.js --live`, or LIVE=1): the open pages reload when a
// file of the app changes, styles are swapped in place; --watch restarts on server.js edits.
// Serves the static app, the test content (content/, under /content-api) and its
// audio and pictures (content/media, under /media), and forwards /app-api and /staff-api
// to the platform's API (server/).
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = +process.env.PORT || 5173;
const ROOT = __dirname;
// The platform's API (server/, run with docker compose): accounts and student data under
// /app-api, the staff area under /staff-api. Unset: both answer 503 {reason:'no-server'}.
const STAFF_API = (process.env.API_ORIGIN || process.env.STAFF_API_ORIGIN || '').replace(/\/+$/, '');
// Test content copied into content/ (index.json, tests/, transcripts/, models/).
const CONTENT = path.join(ROOT, 'content');
const MEDIA = path.join(CONTENT, 'media');
// Host the media URLs in the documents point at; they are rewritten to /media/.
const MEDIA_HOST = 'https://files.justtostudy.kz';
// Until scripts/fetch-media.js has run, a missing file is fetched from here.
// Set MEDIA_FALLBACK= (empty) to answer 404 instead.
const MEDIA_FALLBACK = (process.env.MEDIA_FALLBACK ?? MEDIA_HOST).replace(/\/+$/, '');
const LIVE = process.argv.includes('--live') || process.env.LIVE === '1';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.woff2': 'font/woff2',
};

function proxy(req, res, origin) {
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
    if (LIVE && path.extname(f) === '.html') {
      return fs.readFile(f, 'utf8', (e, html) => res.end(e ? '' : html.replace('</body>', LIVE_CLIENT + '</body>')));
    }
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
// ---- answer check from content/keys (built by scripts/build-content.py), shared with the API ----
const { checkItem } = require('./server/src/check').create(CONTENT);
function readBody(req) {
  return new Promise((resolve) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > 1e5) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch { resolve(null); } });
  });
}

async function content(req, res, rest) {
  const url = new URL(rest, 'http://x');
  const seg = url.pathname.replace(/^\/mobile\/ielts\//, '').split('/').map(decodeURIComponent);
  if (req.method === 'POST' && seg[0] === 'tests' && seg[2] === 'check' && seg.length === 3) {
    const body = await readBody(req);
    const r = body && checkItem(seg[1], String(body.itemId || ''), body.given);
    return r ? sendJson(res, 200, r) : sendJson(res, 404, { message: 'No key' });
  }
  if (req.method !== 'GET') return sendJson(res, 405, { message: 'Read-only' });
  try {
    if (seg[0] === 'tests' && seg.length === 1) {
      const list = index().lists[url.searchParams.get('skill') || 'reading'] || [];
      return sendJson(res, 200, localMedia(JSON.stringify(list)));
    }
    if (seg[0] === 'tests' && seg.length === 2) return sendFile(res, 'tests', seg[1]);
    if (seg[0] === 'tests' && seg[2] === 'transcript') return sendFile(res, 'transcripts', seg[1]);
    if (seg[0] === 'tests' && seg[2] === 'model') return sendFile(res, 'models', seg[1]);
    if (seg[0] === 'programmes' && seg.length === 1) {
      return fs.readFile(path.join(CONTENT, 'programmes.json'), 'utf8', (err, txt) => (err ? sendJson(res, 404, { message: 'Not found' }) : sendJson(res, 200, txt)));
    }
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

// ---- live reload: /__live is an event stream; a change sends "css" (swap styles) or "reload" ----
const liveClients = new Set();
const LIVE_CLIENT = `<script>(function () {
  var es = new EventSource('/__live');
  es.onmessage = function (e) {
    if (e.data === 'css') {
      document.querySelectorAll('link[rel=stylesheet]').forEach(function (l) {
        if (l.href.indexOf(location.origin) !== 0) return;
        var u = new URL(l.href); u.searchParams.set('v', Date.now()); l.href = u.href;
      });
    } else if (e.data === 'reload') location.reload();
  };
})();</script>`;
function startLive() {
  // app files only: not the content bank, the API, git or editor files
  const SKIP = /^(content|server|node_modules|scripts|\.git|\.claude)([\\/]|$)|(^|[\\/])\.|~$|\.(swp|tmp)$/;
  let timer = null, kind = null;
  fs.watch(ROOT, { recursive: true }, (_, name) => {
    if (!name || SKIP.test(name) || name === 'server.js') return;
    kind = kind === 'reload' || !name.endsWith('.css') ? 'reload' : 'css';
    clearTimeout(timer);
    timer = setTimeout(() => { for (const c of liveClients) c.write(`data: ${kind}\n\n`); kind = null; }, 120);
  });
}
function liveStream(req, res) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  res.write('retry: 1000\n\n');
  liveClients.add(res);
  req.on('close', () => liveClients.delete(res));
}

http.createServer((req, res) => {
  if (LIVE && req.url === '/__live') return liveStream(req, res);
  if (req.url.startsWith('/content-api/')) return content(req, res, req.url.slice('/content-api'.length));
  if (req.url.startsWith('/media/')) return media(req, res);
  if (req.url.startsWith('/staff-api/') || req.url.startsWith('/app-api/')) {
    if (STAFF_API) return proxy(req, res, STAFF_API);
    res.writeHead(503, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, reason: 'no-server' }));
  }
  serveStatic(req, res);
}).listen(PORT, () => {
  if (LIVE) startLive();
  console.log(`IELTS platform → http://localhost:${PORT}  (API ${STAFF_API || 'not set'})${LIVE ? '  · live reload on' : ''}`);
});
