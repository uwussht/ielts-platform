/* ==========================================================================
   Keeps the test bank up to date with the admin bank (the JTS admin panel,
   «Практика и тесты → IELTS»): every SYNC_EVERY_MIN minutes it signs in to the
   admin API, lists the tests and fetches only those whose revision changed.

   What a run does, reading only (GET) from the admin bank:
     new or edited published tests → tests/, keys/, transcripts/, models/ (sync-map.js)
     tests taken off (unpublished or in the trash) → off the lists; their files stay,
                                                     so past attempts still open
     recordings and pictures they use → the media volume (/media)
     the active programmes → programmes.json
   Everything goes to CONTENT_LIVE (a volume the site reads too, see live.js);
   index.json there is the image's index with these changes. The image's own
   copy is never written, so a redeploy changes nothing that was synced.

   Settings (server .env):
     SOURCE_LOGIN         phone or email of an ADMIN account of the admin panel
     SOURCE_PASSWORD      its password (the deploy passes it as SOURCE_PASSWORD_B64)
     SOURCE_URL           https://dev-server.justtostudy.kz   (the admin panel's API)
     SYNC_EVERY_MIN       10
     CONTENT_LIVE         /app/content-live   (without it there is nothing to write to: off)
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const C = require('./content');
const M = require('./sync-map');

const env = (k, d = '') => (process.env[k] || '').trim() || d;
const b64 = env('SOURCE_PASSWORD_B64');
const CFG = {
  url: env('SOURCE_URL', 'https://dev-server.justtostudy.kz').replace(/\/+$/, ''),
  login: env('SOURCE_LOGIN'),
  password: process.env.SOURCE_PASSWORD || (b64 ? Buffer.from(b64, 'base64').toString('utf8') : ''),
  everyMin: Math.max(1, Number(env('SYNC_EVERY_MIN')) || 10),
  live: C.live.dir,
  media: env('MEDIA_DIR', path.join(C.DIR, 'media')),
};
const enabled = () => !!(CFG.login && CFG.password && CFG.live);
// where a file of the students' media URLs sits in the media volume (as on the file host)
const MEDIA_SUB = new URL(M.MEDIA_URL).pathname.split('/').filter(Boolean);
const SKIP_SKILLS = new Set(['diagnostic']); // the platform has its own diagnostic (content/diagnostic.json)

/* ---------------------------------------------------------------- files */

const L = (...p) => path.join(CFG.live, ...p);
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
function writeFile(f, data) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, f);
}
const writeJson = (f, v) => writeFile(f, JSON.stringify(v));
const drop = (f) => { try { fs.unlinkSync(f); } catch {} };
const safeId = (id) => C.check.safeId(id);
const stampOf = (t) => `${t.revision ?? ''}|${t.updatedAt ?? ''}`;

/** What the image holds: { id: stamp } from content/source/list.json (the export it was built from). */
let BASE = null;
function base() {
  if (!BASE) {
    BASE = new Map();
    for (const t of readJson(path.join(C.DIR, 'source', 'list.json'), [])) if (!SKIP_SKILLS.has(t.skill)) BASE.set(t.id, stampOf(t));
  }
  return BASE;
}

/* ------------------------------------------------------- the admin API */

let tokens = null;
const phoneOf = (s) => {
  let d = String(s).replace(/\D/g, '');
  if (d.length === 11 && d[0] === '8') d = '7' + d.slice(1);
  if (d.length === 10) d = '7' + d;
  return '+' + d;
};
async function login() {
  // as the admin panel's sign-in form sends it
  const body = CFG.login.includes('@') ? { email: CFG.login, password: CFG.password } : { phone: phoneOf(CFG.login), password: CFG.password };
  const r = await fetch(CFG.url + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30e3) });
  if (!r.ok) throw Object.assign(new Error(`sign-in to the admin bank failed (HTTP ${r.status}): check SOURCE_LOGIN and SOURCE_PASSWORD`), { code: 'login' });
  const j = await r.json().catch(() => ({}));
  if (!j.accessToken) throw Object.assign(new Error('sign-in to the admin bank gave no token'), { code: 'login' });
  tokens = { access: j.accessToken, refresh: j.refreshToken || null };
}
async function refresh() {
  if (!tokens?.refresh) return false;
  const r = await fetch(`${CFG.url}/auth/refresh?refreshToken=${encodeURIComponent(tokens.refresh)}`, { method: 'POST', signal: AbortSignal.timeout(30e3) }).catch(() => null);
  const j = r?.ok ? await r.json().catch(() => null) : null;
  if (!j?.accessToken) return false;
  tokens = { access: j.accessToken, refresh: j.refreshToken || tokens.refresh };
  return true;
}
/** GET from the admin API as the sync's account: JSON, or a Buffer with { binary: true }. */
async function get(p, { binary = false } = {}) {
  if (!tokens) await login();
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(CFG.url + p, { headers: { authorization: 'Bearer ' + tokens.access }, signal: AbortSignal.timeout(binary ? 300e3 : 60e3) });
    if ((r.status === 401 || r.status === 403) && attempt === 0) {
      r.body?.cancel();
      if (!(await refresh())) await login();
      continue;
    }
    if (r.status === 403) throw Object.assign(new Error('the admin bank refused access: SOURCE_LOGIN must be an ADMIN account'), { code: 'forbidden' });
    if (!r.ok) { r.body?.cancel(); throw Object.assign(new Error(`GET ${p}: HTTP ${r.status}`), { code: 'http_' + r.status }); }
    return binary ? Buffer.from(await r.arrayBuffer()) : r.json();
  }
}

/* ---------------------------------------------------------------- a run */

/** One test's files in the live folder. */
function writeTest(a) {
  const f = safeId(a.test.id) + '.json';
  writeJson(L('tests', f), { test: M.listEntry(a.test, a.document), document: M.studentDoc(a.document) });
  const keys = M.keysOf(a.document), tr = M.transcriptOf(a.document), model = M.modelOf(a.document);
  keys ? writeJson(L('keys', f), keys) : drop(L('keys', f));
  if (tr) writeJson(L('transcripts', f), tr);
  if (model) writeJson(L('models', f), model);
  return { transcript: !!tr, model: !!model };
}

/** index.json: the image's index with what the sync changed (entries replaced in place, new ones at the end). */
function writeIndex(state) {
  const idx = readJson(path.join(C.DIR, 'index.json'), null);
  if (!idx) throw new Error('the image has no content/index.json');
  const S = state.tests, gone = (id) => state.removed[id];
  for (const skill of M.LIST_SKILLS) {
    const list = (idx.lists[skill] || []).filter((e) => !gone(e.id) && (!S[e.id] || S[e.id].skill === skill))
      // an edited test keeps the date it first appeared (the «new» mark) and its picture
      .map((e) => (S[e.id]?.entry ? { ...S[e.id].entry, createdAt: e.createdAt ?? S[e.id].entry.createdAt, imageUrl: e.imageUrl ?? null } : e));
    const have = new Set(list.map((e) => e.id));
    for (const [id, s] of Object.entries(S)) if (s.skill === skill && s.entry && !have.has(id) && !gone(id)) list.push(s.entry);
    idx.lists[skill] = list;
  }
  const mocks = (idx.mocks || []).filter((m) => !gone(m.id)).map((m) => (S[m.id]?.mock ? { ...m, ...S[m.id].mock, createdAt: m.createdAt } : m));
  const haveM = new Set(mocks.map((m) => m.id));
  for (const [id, s] of Object.entries(S)) if (s.mock && !haveM.has(id) && !gone(id)) mocks.push({ ...s.mock, fresh: true });
  idx.mocks = mocks;
  for (const k of ['transcripts', 'models']) idx[k] = [...new Set([...(idx[k] || []), ...Object.entries(S).filter(([, s]) => s[k]).map(([id]) => id)])];
  idx.source = `${idx.source}; kept up to date from the admin bank (${CFG.url}), last change ${new Date().toISOString()}`;
  writeJson(L('index.json'), idx);
}

let running = null;
let status = { enabled: false, running: false, lastRun: null, lastOk: null, lastError: null, last: null };

async function runOnce() {
  const state = readJson(L('state.json'), null) || { tests: {}, removed: {}, pendingMedia: [], programmes: null };
  const changes = { added: [], updated: [], removed: [], restored: [], media: 0, mediaFailed: 0, programmes: false };

  // 1. the list: one request; only tests whose revision changed are fetched
  const list = await get('/admin/ielts/tests?trash=false');
  if (!Array.isArray(list)) throw new Error('the admin bank sent no list of tests');
  const pub = list.filter((t) => t.status === 'published' && !t.deletedAt && !SKIP_SKILLS.has(t.skill));
  const known = (id) => state.tests[id]?.stamp ?? base().get(id);
  const media = new Set(state.pendingMedia || []);
  for (const t of pub) {
    if (known(t.id) === stampOf(t)) continue;
    const a = await get('/admin/ielts/tests/' + encodeURIComponent(t.id));
    if (!a?.test || !a?.document) throw new Error(`the admin bank sent no document for ${t.id}`);
    const isNew = !state.tests[t.id] && !base().has(t.id);
    const files = writeTest(a);
    for (const n of M.mediaOf(a)) media.add(n);
    state.tests[t.id] = { stamp: stampOf(t), skill: a.test.skill, ...files,
      ...(a.test.skill === 'mock' ? { mock: M.mockEntry(a.test, a.document) } : { entry: M.listEntry(a.test, a.document) }) };
    (isNew ? changes.added : changes.updated).push(t.id);
  }

  // 2. taken off: unpublished or in the trash. A short list (a glitch on their side) removes nothing.
  const live = new Set(pub.map((t) => t.id));
  for (const id of Object.keys(state.removed)) if (live.has(id)) { delete state.removed[id]; changes.restored.push(id); }
  const all = new Set([...base().keys(), ...Object.keys(state.tests)]);
  const missing = [...all].filter((id) => !live.has(id) && !state.removed[id]);
  if (missing.length && missing.length > all.size * 0.2) console.warn(`[sync] ${missing.length} tests missing from the admin list: not removing them (too many at once)`);
  else for (const id of missing) { state.removed[id] = true; changes.removed.push(id); }

  // 3. recordings and pictures not on disk yet (tried again next run if one fails)
  const mdir = path.join(CFG.media, ...MEDIA_SUB);
  const failed = [];
  for (const n of media) {
    if (!/^[\w.-]+$/.test(n)) continue;
    const f = path.join(mdir, n);
    try { if (fs.statSync(f).size > 0) continue; } catch {}
    try { writeFile(f, await get('/admin/ielts/media/' + encodeURIComponent(n), { binary: true })); changes.media++; } catch (e) { failed.push(n); console.error('[sync] media', n, e.message); }
  }
  state.pendingMedia = failed;
  changes.mediaFailed = failed.length;

  // 4. the active programmes
  const cats = await get('/admin/ielts/programmes');
  const active = Array.isArray(cats) ? cats.find((c) => c.active) : null;
  if (active?.names) {
    const views = [];
    for (const key of Object.keys(active.names)) views.push(await get('/admin/ielts/programmes/view/' + encodeURIComponent(key)));
    const out = JSON.stringify(M.programmesOf(views), null, 1) + '\n';
    const hash = crypto.createHash('sha1').update(out).digest('hex');
    if (hash !== state.programmes) {
      // the same as the image's copy: no file of its own (the site reads the image's)
      let baked = null;
      try { baked = fs.readFileSync(path.join(C.DIR, 'programmes.json'), 'utf8'); } catch {}
      if (baked === out) drop(L('programmes.json')); else writeFile(L('programmes.json'), out);
      changes.programmes = state.programmes != null || baked !== out;
      state.programmes = hash;
    }
  }

  // 5. the index, then the stamp the readers watch
  const any = changes.added.length || changes.updated.length || changes.removed.length || changes.restored.length || changes.programmes || changes.media;
  if (any || !fs.existsSync(L('index.json'))) writeIndex(state);
  writeJson(L('state.json'), state);
  if (any) writeFile(L('version.txt'), String(Date.now()));
  return changes;
}

/** One sync now; resolves with the run's changes (or the error), never twice at once. */
function run() {
  if (!enabled()) return Promise.resolve(null);
  if (running) return running;
  status.running = true;
  status.lastRun = new Date().toISOString();
  running = runOnce()
    .then((ch) => {
      status = { ...status, lastOk: new Date().toISOString(), lastError: null, last: ch };
      const n = (k) => ch[k].length;
      if (n('added') || n('updated') || n('removed') || n('restored') || ch.media || ch.programmes) {
        console.log(`[sync] ${n('added')} new, ${n('updated')} changed, ${n('removed')} taken off, ${n('restored')} back, ${ch.media} media files${ch.mediaFailed ? ` (${ch.mediaFailed} failed)` : ''}${ch.programmes ? ', programmes updated' : ''}`);
      }
      return ch;
    })
    .catch((e) => {
      status.lastError = { at: new Date().toISOString(), code: e.code || 'failed', message: e.message };
      console.error('[sync] failed:', e.message);
      return null;
    })
    .finally(() => { status.running = false; running = null; });
  return running;
}

let timer = null;
/** Starts the timer (a first run a little after start-up). */
function start() {
  status.enabled = enabled();
  if (!status.enabled) {
    console.log('[sync] off:', !CFG.live ? 'no CONTENT_LIVE folder' : 'no SOURCE_LOGIN / SOURCE_PASSWORD');
    return;
  }
  console.log(`[sync] on: ${CFG.url} every ${CFG.everyMin} min`);
  setTimeout(run, 15e3).unref();
  timer = setInterval(run, CFG.everyMin * 60e3);
  timer.unref();
}

module.exports = { start, run, status: () => ({ ...status, source: enabled() ? CFG.url : null, everyMin: CFG.everyMin }) };
