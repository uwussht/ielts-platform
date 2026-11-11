/* ==========================================================================
   The student's data, under /app-api (signed in). Paths and response shapes
   are the ones the app already reads (they follow ai-tutor's /mobile/ielts/*).

     profile     GET/PUT /mobile/ielts/profile, PUT /profile/route, GET /plan/me
     plan        GET/PUT /mobile/ielts/plan/state   (marks of the plan built in the app)
     overview    GET /mobile/ielts/dashboard, GET /mobile/ielts/progress
     tests       GET /mobile/ielts/tests?skill=     (the bank's list + the student's attempts)
                 POST /mobile/ielts/tests/:id/attempts      reading / listening, checked by the keys
                 POST /mobile/ielts/tests/:id/writing       an essay, waits for a teacher
                 POST /ielts/speaking/assess                recorded answers (multipart), wait for a teacher
                 POST /ielts/writing/assess                 the essay's current state
     attempts    GET /mobile/ielts/attempts/:id, PUT …/selfcheck, GET /writing/works, /speaking/works
     diagnostic  GET /mobile/ielts/diagnostic, POST …/path, POST …, GET …/last, POST /ielts/diagnostic/assess
     mocks       GET /mobile/ielts/mocks, POST /mocks/:id/sessions, GET/POST /mocks/sessions/:sid/…
     vocabulary  /mobile/vocab-progress/*, /mobile/lesson-vocab/*, POST /mobile/saved-words

   Writing and speaking have no automatic grading: they are 'pending_review'
   until a teacher grades them in the staff area (staff.js).
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const Busboy = require('busboy');
const { pool, tx } = require('./db');
const { requireUser, requireAccess } = require('./auth');
const C = require('./content');

const router = express.Router();
router.use(requireUser, requireAccess);

const SKILLS = ['listening', 'reading', 'writing', 'speaking'];
const r5 = (x) => Math.round(x * 2) / 2;
const num = (v) => (v == null ? null : Number(v));
const isoDay = (d) => new Date(d).toISOString().slice(0, 10);
const nf = (res, what = 'not-found') => res.status(404).json({ ok: false, reason: what, message: 'Not found' });
const bad = (res, reason) => res.status(400).json({ ok: false, reason, message: reason });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const countWords = (s) => String(s || '').trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/* ------------------------------------------------------------ storage */

async function getState(uid, key, def) {
  const { rows } = await pool.query('SELECT value FROM user_state WHERE user_id = $1 AND key = $2', [uid, key]);
  return rows.length ? rows[0].value : def;
}
async function setState(uid, key, value) {
  await pool.query(
    `INSERT INTO user_state (user_id, key, value) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [uid, key, JSON.stringify(value)]);
}

function attemptOut(r) {
  return { id: r.id, mode: r.mode, finishedAt: r.finished_at, rawScore: r.raw_score, maxScore: r.max_score, timeSec: r.time_sec, band: num(r.band), status: r.status };
}
async function attemptsOf(uid) {
  const { rows } = await pool.query(
    `SELECT id, test_id, skill, kind, title, mode, status, band, raw_score, max_score, time_sec, finished_at,
            CASE WHEN skill IN ('reading', 'listening') THEN result->'items' END AS items,
            result->'bands' AS bands, result->>'words' AS words
       FROM attempts WHERE user_id = $1 ORDER BY finished_at DESC, id DESC`, [uid]);
  return rows;
}
async function insertAttempt(c, a) {
  const { rows } = await c.query(
    `INSERT INTO attempts (user_id, test_id, skill, kind, title, mode, status, band, raw_score, max_score, time_sec, answers, result)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
    [a.userId, a.testId, a.skill, a.kind || null, String(a.title || '').slice(0, 300), a.mode || 'practice', a.status || 'done', a.band ?? null,
      a.raw ?? null, a.max ?? null, Number.isFinite(+a.timeSec) ? Math.round(+a.timeSec) : null, JSON.stringify(a.answers || {}), JSON.stringify(a.result || {})]);
  return rows[0];
}

/* ------------------------------------------------------------ profile */

/** The student's bands now: the latest result of each skill, else the diagnostic's. */
function bandsFrom(list) {
  const diag = list.find((a) => a.skill === 'diagnostic')?.bands || {};
  const bands = {};
  for (const s of SKILLS) {
    const a = list.find((x) => x.skill === s && x.band != null && x.status === 'done' && (s === 'writing' || s === 'speaking' || (x.max_score || 0) >= 10));
    bands[s] = a ? num(a.band) : diag[s] ?? null;
  }
  const all = SKILLS.map((s) => bands[s]);
  bands.overall = all.every((x) => x != null) ? r5(all.reduce((s, x) => s + x, 0) / 4) : diag.overall ?? null;
  return bands;
}
async function profileOf(u, list) {
  const p = u.profile || {};
  list ||= await attemptsOf(u.id);
  const diag = list.find((a) => a.skill === 'diagnostic');
  return {
    track: u.track || p.track || 'academic', targetBand: num(u.target_band) ?? p.targetBand ?? null, examDate: u.exam_date ? isoDay(u.exam_date) : p.examDate ?? null,
    purpose: p.purpose ?? null, examWindow: p.examWindow ?? null, dailyMinutes: p.dailyMinutes ?? null, familiarity: p.familiarity ?? null,
    route: u.route || p.route || null, onboarded: !!p.onboarded, diagnosticDone: !!diag, startBand: diag?.bands?.overall ?? null,
    bands: bandsFrom(list), name: u.name,
  };
}

router.get('/mobile/ielts/profile', wrap(async (req, res) => res.json(await profileOf(req.user))));

router.put('/mobile/ielts/profile', wrap(async (req, res) => {
  const b = req.body || {};
  const p = { ...(req.user.profile || {}), onboarded: true };
  for (const k of ['purpose', 'examWindow', 'dailyMinutes', 'familiarity', 'track']) if (b[k] !== undefined) p[k] = b[k];
  const target = b.targetBand != null && Number(b.targetBand) >= 1 && Number(b.targetBand) <= 9 ? r5(Number(b.targetBand)) : null;
  const exam = /^\d{4}-\d{2}-\d{2}$/.test(String(b.examDate || '')) ? b.examDate : null;
  const { rows } = await pool.query(
    `UPDATE users SET profile = $2, track = COALESCE($3, track), target_band = COALESCE($4, target_band),
            exam_date = CASE WHEN $6 THEN $5::date ELSE exam_date END WHERE id = $1 RETURNING *`,
    [req.user.id, JSON.stringify(p), ['academic', 'general'].includes(b.track) ? b.track : null, target, exam, 'examDate' in b]);
  res.json(await profileOf(rows[0]));
}));

router.put('/mobile/ielts/profile/route', wrap(async (req, res) => {
  const route = String(req.body?.route || '').slice(0, 40) || null;
  const { rows } = await pool.query('UPDATE users SET route = $2 WHERE id = $1 RETURNING *', [req.user.id, route]);
  res.json(await profileOf(rows[0]));
}));

router.get('/mobile/ielts/plan/me', wrap(async (req, res) => {
  const p = await profileOf(req.user);
  res.json({ ieltsAccount: true, purchased: true, access: p.onboarded && p.diagnosticDone, studyMode: 'self_study', track: p.track,
    programmeName: null, onboarded: p.onboarded, diagnosticDone: p.diagnosticDone, targetBand: p.targetBand, examDate: p.examDate });
}));

/* The plan itself is built in the app from the programmes (js/core/plan-local.js);
   the server keeps its marks: start date, study mode, start band, done and moved tasks. */
router.get('/mobile/ielts/plan/state', wrap(async (req, res) => res.json({ state: await getState(req.user.id, 'plan', null) })));
router.put('/mobile/ielts/plan/state', wrap(async (req, res) => {
  const s = req.body?.state;
  if (s !== null && (typeof s !== 'object' || JSON.stringify(s).length > 2e5)) return bad(res, 'bad-state');
  if (s === null) await pool.query("DELETE FROM user_state WHERE user_id = $1 AND key = 'plan'", [req.user.id]);
  else await setState(req.user.id, 'plan', s);
  res.json({ ok: true });
}));

/* ------------------------------------------------------- dashboard, progress */

const sourceOf = (a) => (a.skill === 'diagnostic' ? 'diagnostic' : a.skill === 'writing' || a.skill === 'speaking' ? 'work' : ['test', 'full'].includes(a.kind) ? 'full' : 'partial');

function streakOf(list) {
  const days = [...new Set(list.map((a) => isoDay(a.finished_at)))].sort().reverse();
  let best = 0, run = 0, prev = null;
  for (const d of [...days].reverse()) { run = prev && (Date.parse(d) - Date.parse(prev)) === 864e5 ? run + 1 : 1; best = Math.max(best, run); prev = d; }
  const today = isoDay(Date.now()), yest = isoDay(Date.now() - 864e5);
  let current = 0;
  if (days[0] === today || days[0] === yest) { current = 1; for (let i = 1; i < days.length && Date.parse(days[i - 1]) - Date.parse(days[i]) === 864e5; i++) current++; }
  return { current, best };
}
/** Question types answered at least 3 times, weakest first. */
function typeStats(list) {
  const by = {};
  for (const a of list) for (const it of a.items || []) {
    if (!it.type) continue;
    const k = a.skill + '|' + it.type, b = (by[k] ||= { skill: a.skill, key: it.type, correct: 0, total: 0, attemptId: a.id, kind: a.kind });
    b.total++; if (it.correct) b.correct++;
  }
  return Object.values(by).filter((b) => b.total >= 3).sort((x, y) => x.correct / x.total - y.correct / y.total);
}

router.get('/mobile/ielts/dashboard', wrap(async (req, res) => {
  const list = await attemptsOf(req.user.id);
  const prof = await profileOf(req.user, list);
  const xp = list.reduce((s, a) => s + 10 + (a.raw_score || 0), 0);
  const today = isoDay(Date.now());
  const xpToday = list.filter((a) => isoDay(a.finished_at) === today).reduce((s, a) => s + 10 + (a.raw_score || 0), 0);
  const diag = list.find((a) => a.skill === 'diagnostic');
  const bands = prof.bands;
  const graded = list.filter((a) => a.band != null && a.skill !== 'diagnostic');
  const weak = typeStats(list)[0];
  const checking = list.some((a) => a.status === 'pending_review');
  res.json({
    xp, xpToday, level: Math.floor(xp / 400) + 1, levelXp: xp % 400, levelSize: 400, streak: streakOf(list),
    targetBand: prof.targetBand, examDate: prof.examDate,
    bands: { listening: bands.listening, reading: bands.reading, writing: bands.writing, speaking: bands.speaking }, overall: bands.overall,
    dynamics: diag?.bands?.overall != null && bands.overall != null ? r5(bands.overall - diag.bands.overall) : null,
    forecast: null, forecastPoints: [],
    journey: {
      baseline: diag ? { score: diag.bands?.overall ?? null, source: 'diagnostic', preliminary: !!diag.bands?.overallPrelim, estimate: false, attemptId: diag.id, date: isoDay(diag.finished_at) } : null,
      checking,
      current: bands.overall != null ? { score: bands.overall, source: 'sections', attemptId: graded[0]?.id ?? diag?.id ?? null, date: graded[0] ? isoDay(graded[0].finished_at) : null, sections: SKILLS.filter((s) => bands[s] != null).length, estimate: false } : null,
      target: prof.targetBand, gap: prof.targetBand != null && bands.overall != null ? r5(prof.targetBand - bands.overall) : null,
    },
    growthZone: weak ? { skill: weak.skill, kind: 'type', key: weak.key, correct: weak.correct, total: weak.total, band: bands[weak.skill] ?? null, evidenceAttemptId: weak.attemptId, testKind: weak.kind } : null,
    plan: { date: today, tasks: [], budget: prof.dailyMinutes || 60, reduced: false, doneMinutes: 0 }, roadmap: null,
  });
}));

router.get('/mobile/ielts/progress', wrap(async (req, res) => {
  const list = await attemptsOf(req.user.id);
  const skills = {};
  for (const s of SKILLS) {
    const xs = list.filter((a) => a.skill === s && a.band != null);
    const diag = list.find((a) => a.skill === 'diagnostic');
    skills[s] = xs[0] ? { source: sourceOf(xs[0]), date: isoDay(xs[0].finished_at), band: num(xs[0].band), delta: xs[1] ? r5(num(xs[0].band) - num(xs[1].band)) : null, checking: list.some((a) => a.skill === s && a.status === 'pending_review') }
      : diag?.bands?.[s] != null ? { source: 'diagnostic', date: isoDay(diag.finished_at), band: diag.bands[s], estimate: true, delta: null, checking: false }
        : { source: null, date: null, band: null, delta: null, checking: list.some((a) => a.skill === s && a.status === 'pending_review') };
  }
  // overall after each graded result, oldest first
  const series = [];
  const asc = [...list].reverse();
  for (let i = 0; i < asc.length; i++) {
    const a = asc[i];
    if (a.band == null && a.bands?.overall == null) continue;
    const upto = asc.slice(0, i + 1).reverse();
    const o = bandsFrom(upto).overall ?? (a.skill === 'diagnostic' ? a.bands?.overall : null);
    if (o != null) series.push({ date: isoDay(a.finished_at), overall: o, source: sourceOf(a), skill: a.skill });
  }
  const traps = {};
  for (const a of list) for (const it of a.items || []) if (!it.correct && it.trap) { const k = a.skill + '|' + it.trap; (traps[k] ||= { kind: 'trap', key: it.trap, skill: a.skill, count: 0 }).count++; }
  res.json({
    completion: null, skills, series,
    errors: Object.values(traps).sort((x, y) => y.count - x.count).slice(0, 6),
    recent: list.slice(0, 100).map((a) => ({ id: a.id, title: a.title, skill: a.skill, source: sourceOf(a), finishedAt: a.finished_at, band: num(a.band) ?? a.bands?.overall ?? null, status: a.status })),
  });
}));

/* -------------------------------------------------------------- tests */

router.get('/mobile/ielts/tests', wrap(async (req, res) => {
  const skill = String(req.query.skill || 'reading');
  const list = C.list(skill);
  const { rows } = await pool.query(
    `SELECT id, test_id, mode, raw_score, max_score, band, finished_at, status FROM attempts
      WHERE user_id = $1 AND skill = $2 ORDER BY finished_at DESC`, [req.user.id, skill === 'vocab' ? '-' : skill]);
  const by = {};
  for (const r of rows) (by[r.test_id] ||= []).push(r);
  const sb = bandsFrom(await attemptsOf(req.user.id))[skill] ?? null;
  res.json(list.map((m) => {
    const xs = by[m.id] || [];
    const best = xs.filter((x) => x.band != null || x.raw_score != null).sort((a, b) => (num(b.band) ?? 0) - (num(a.band) ?? 0) || (b.raw_score ?? 0) - (a.raw_score ?? 0))[0];
    const level = m.bandMin == null ? 'any' : sb == null ? m.level : sb < m.bandMin - 0.5 ? 'above' : sb > (m.bandMax ?? m.bandMin) ? 'below' : 'fit';
    return { ...m, attemptCount: xs.length, lastAttempt: xs[0] ? attemptOut(xs[0]) : null, bestAttempt: best ? attemptOut(best) : null, studentBand: sb, level };
  }));
}));

/** Reading / listening: every answer checked by the keys. */
router.post('/mobile/ielts/tests/:id/attempts', wrap(async (req, res) => {
  const b = req.body || {};
  const g = C.grade(req.params.id, b.answers || {});
  if (!g) return nf(res);
  const items = g.items.map((x) => ({ ...x, timeSec: b.questionSec?.[x.itemId] ?? null }));
  const row = await insertAttempt(pool, { userId: req.user.id, testId: req.params.id, skill: g.skill, kind: g.kind, title: g.title, mode: b.mode, band: g.band,
    raw: g.raw, max: g.max, timeSec: b.timeSec, answers: b.answers || {}, result: { items, highlights: Array.isArray(b.highlights) ? b.highlights.slice(0, 200) : [], startedAt: b.startedAt || null, device: b.device || null } });
  res.json({ attempt: attemptOut(row) });
}));

/** An attempt as the review screens read it: the document (with keys for reading/listening), answers and result. */
async function attemptView(row) {
  const d = C.doc(row.test_id);
  let document = d?.document || null;
  if (document && (row.skill === 'reading' || row.skill === 'listening')) document = C.withKeys(document, row.test_id);
  if (document && !document.id) document.id = row.test_id;
  return { testId: row.test_id, skill: row.skill, attempt: attemptOut(row), document, answers: row.answers, result: { ...row.result, status: row.result?.status || row.status } };
}
async function ownAttempt(req, id) {
  const { rows } = await pool.query('SELECT * FROM attempts WHERE id = $1 AND user_id = $2', [Number(id) || 0, req.user.id]);
  return rows[0] || null;
}
router.get('/mobile/ielts/attempts/:id', wrap(async (req, res) => {
  const row = await ownAttempt(req, req.params.id);
  if (!row) return nf(res);
  res.json(await attemptView(row));
}));
router.put('/mobile/ielts/attempts/:id/selfcheck', wrap(async (req, res) => {
  const r = await pool.query(`UPDATE attempts SET answers = jsonb_set(answers, '{selfCheck}', $3::jsonb) WHERE id = $1 AND user_id = $2`,
    [Number(req.params.id) || 0, req.user.id, JSON.stringify(req.body || {})]);
  res.json({ ok: r.rowCount > 0 });
}));

/* ------------------------------------------------------ writing, speaking */

router.post('/mobile/ielts/tests/:id/writing', wrap(async (req, res) => {
  const d = C.doc(req.params.id);
  if (!d) return nf(res);
  const b = req.body || {};
  const text = String(b.text || '').slice(0, 20000);
  const doc = d.document, n = countWords(text), min = doc.minWords || (doc.kind === 'task2' ? 250 : 150);
  const row = await insertAttempt(pool, { userId: req.user.id, testId: req.params.id, skill: 'writing', kind: doc.kind || d.test?.kind, title: d.test?.title || doc.title,
    mode: b.mode || 'exam', status: 'pending_review', timeSec: b.timeSec, answers: { text, selfCheck: {} },
    result: { status: 'pending_review', words: n, minWords: min, underLength: n < min, timeLimitSec: doc.timeLimitSec || null, pasteBlocked: b.pasteBlocked || 0 } });
  res.json({ attempt: attemptOut(row) });
}));
/* The app asks to grade an essay; there is no automatic grading, so it gets the essay as it stands. */
router.post('/ielts/writing/assess', wrap(async (req, res) => {
  const row = await ownAttempt(req, req.body?.attemptId);
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json(await attemptView(row));
}));

const works = (skill) => wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, test_id, kind, title, status, band, finished_at, result->>'words' AS words FROM attempts
      WHERE user_id = $1 AND skill = $2 ORDER BY finished_at DESC`, [req.user.id, skill]);
  res.json(rows.map((r) => {
    const m = C.meta(r.test_id) || {};
    return { attemptId: r.id, testId: r.test_id, title: r.title, kind: r.kind, category: m.category || null, words: r.words != null ? Number(r.words) : null, finishedAt: r.finished_at, status: r.status, band: num(r.band) };
  }));
});
router.get('/mobile/ielts/writing/works', works('writing'));
router.get('/mobile/ielts/speaking/works', works('speaking'));

/** multipart/form-data → { fields, files: [{ field, name, mime, data }] } */
function readForm(req, { maxFile = 20 << 20, maxFiles = 30 } = {}) {
  return new Promise((resolve, reject) => {
    let bb;
    try { bb = Busboy({ headers: req.headers, limits: { fileSize: maxFile, files: maxFiles, fields: 50 } }); } catch (e) { return reject(Object.assign(e, { status: 400 })); }
    const fields = {}, files = [];
    let tooBig = false;
    bb.on('field', (k, v) => { fields[k] = v; });
    bb.on('file', (field, stream, info) => {
      const parts = [];
      stream.on('data', (c) => parts.push(c));
      stream.on('limit', () => { tooBig = true; });
      stream.on('end', () => files.push({ field, name: info.filename, mime: info.mimeType || 'audio/wav', data: Buffer.concat(parts) }));
    });
    bb.on('error', reject);
    bb.on('close', () => (tooBig ? reject(Object.assign(new Error('too_large'), { status: 413 })) : resolve({ fields, files })));
    req.pipe(bb);
  });
}
async function saveAudio(c, attemptId, items, files) {
  for (let i = 0; i < files.length; i++) {
    const f = files[i], idx = Number((/^audio_(\d+)$/.exec(f.field) || [])[1]);
    const it = items[idx] || {};
    if (!f.data.length) continue;
    await c.query('INSERT INTO attempt_audio (attempt_id, item_id, duration, mime, data) VALUES ($1, $2, $3, $4, $5)',
      [attemptId, String(it.itemId || f.name || 'item-' + idx).slice(0, 120), Number(it.durationSec) || null, f.mime, f.data]);
  }
}

router.post('/ielts/speaking/assess', wrap(async (req, res) => {
  const { fields, files } = await readForm(req).catch((e) => { res.status(e.status || 400).json({ error: e.status === 413 ? 'too_large' : 'bad_form' }); return {}; });
  if (!fields) return;
  let items = [];
  try { items = JSON.parse(fields.items || '[]'); } catch {}
  const retry = fields.retryAttemptId ? await ownAttempt(req, fields.retryAttemptId) : null;
  if (retry && retry.status === 'done') return res.status(409).json({ error: 'already_graded', attemptId: retry.id });
  const d = C.doc(fields.testId);
  if (!d && !retry) return res.status(404).json({ error: 'not_found' });
  const result = { status: 'pending_review', items: items.map((x, i) => ({ itemId: x.itemId, durationSec: Number(x.durationSec) || 0, wpm: null, transcript: null, skipped: !files.some((f) => f.field === 'audio_' + i) })) };
  const row = await tx(async (c) => {
    const r = retry || await insertAttempt(c, { userId: req.user.id, testId: fields.testId, skill: 'speaking', kind: d.document.kind || d.test?.kind, title: d.test?.title || d.document.title,
      mode: fields.mode || 'practice', status: 'pending_review', timeSec: items.reduce((s, x) => s + (Number(x.durationSec) || 0), 0), result });
    if (retry) await c.query('DELETE FROM attempt_audio WHERE attempt_id = $1', [retry.id]);
    await saveAudio(c, r.id, items, files);
    return r;
  });
  res.json({ attempt: attemptOut(row) });
}));

/* ------------------------------------------------------------ diagnostic */

let FORM = null;
const form = () => (FORM ||= JSON.parse(fs.readFileSync(path.join(C.DIR, 'diagnostic.json'), 'utf8')));
const answerOf = (it) => String(it.answer).split('|');
const isRight = (it, v) => answerOf(it).some((a) => C.check.norm(a) === C.check.norm(v));
const diagItems = (f) => [
  ...f.listening.slots.flatMap((s) => s.clips.flatMap((c) => c.items.map((it) => ({ ...it, skill: 'listening', slot: s.slot, clip: c.id })))),
  ...f.reading.academic.items.map((it) => ({ ...it, skill: 'reading' })),
];
/* slot 1 decides slot 2: two right answers or more → the first clip, else the easier second one */
function diagPath(f, answers) {
  const first = f.listening.slots[0].clips[0];
  const right = first.items.filter((it) => isRight(it, answers?.[it.id])).length;
  const path = {};
  for (const s of f.listening.slots) path[s.slot] = s.slot === 1 || s.clips.length < 2 ? s.clips[0].id : s.clips[right >= Math.ceil(first.items.length * 0.6) ? 0 : 1].id;
  return path;
}
const toBand = (c, t) => (t ? Math.max(3, Math.min(8.5, r5(3 + (c / t) * 5.5))) : null);
function stripAnswers(f) {
  const out = structuredClone(f);
  for (const s of out.listening.slots) for (const c of s.clips) for (const it of c.items) delete it.answer;
  for (const k of Object.keys(out.reading)) for (const it of out.reading[k].items || []) delete it.answer;
  return out;
}

router.get('/mobile/ielts/diagnostic', wrap(async (req, res) => {
  const f = form();
  const level = f.levels[req.query.level] ? req.query.level : 'standard';
  const p = await profileOf(req.user);
  res.json({ formId: f.id, level, module: req.query.module || p.track || 'academic', code: f.id, form: stripAnswers(f) });
}));
router.post('/mobile/ielts/diagnostic/path', (req, res) => res.json({ path: diagPath(form(), req.body?.answers) }));
router.get('/mobile/ielts/diagnostic/last', wrap(async (req, res) => {
  const { rows } = await pool.query("SELECT id FROM attempts WHERE user_id = $1 AND skill = 'diagnostic' ORDER BY id DESC LIMIT 1", [req.user.id]);
  res.json({ attemptId: rows[0]?.id ?? null });
}));
router.post('/mobile/ielts/diagnostic', wrap(async (req, res) => {
  const f = form(), b = req.body || {};
  const L = f.levels[b.level] || f.levels.standard;
  const path = diagPath(f, b.answers);
  const clipOf = (it) => f.listening.slots.find((x) => x.slot === it.slot).clips.find((c) => c.id === it.clip);
  const asked = diagItems(f).filter((it) => {
    if (it.skill === 'reading') return !L.reading.light || f.reading.academic.lightItems.includes(it.id);
    if (!L.listening.slots.includes(it.slot) || path[it.slot] !== it.clip) return false;
    const take = L.listening.take?.[it.slot];
    return !take || clipOf(it).items.findIndex((x) => x.id === it.id) < take;
  });
  const items = asked.map((it) => {
    const given = b.answers?.[it.id] ?? '', correct = isRight(it, given);
    return { itemId: it.id, skill: it.skill, type: it.type, given, answer: answerOf(it)[0], correct, trap: it.type === 'tfng' && !correct ? 'NG_vs_False' : null };
  });
  const raw = (sk) => { const xs = items.filter((x) => x.skill === sk); return { correct: xs.filter((x) => x.correct).length, total: xs.length }; };
  const byType = {};
  for (const x of items) { const t = (byType[x.type] ||= { correct: 0, total: 0 }); t.total++; if (x.correct) t.correct++; }
  const rl = raw('listening'), rr = raw('reading');
  const words = countWords(b.writingText), secs = Object.values(b.speakingSec || {}).map(Number).filter(Boolean);
  const bands = { listening: toBand(rl.correct, rl.total), reading: toBand(rr.correct, rr.total), writing: null, speaking: null, overallPrelim: true };
  bands.overall = bands.listening != null && bands.reading != null ? r5((bands.listening + bands.reading) / 2) : bands.listening ?? bands.reading;
  const result = { level: b.level || 'standard', module: b.module || 'academic', bands, raw: { listening: rl, reading: rr },
    writing: words ? { status: 'pending_review', words, text: String(b.writingText).slice(0, 20000), question: f.writing.question } : null,
    // speaking waits for its recordings (POST /ielts/diagnostic/assess), then for a teacher
    speaking: secs.length ? { status: 'pending_ai', answers: secs.length, seconds: secs.reduce((s, x) => s + x, 0) } : null,
    weakTypes: Object.entries(byType).filter(([, v]) => v.correct / v.total < 0.6).map(([k]) => k), byType, items };
  const row = await insertAttempt(pool, { userId: req.user.id, testId: 'DG-' + f.id, skill: 'diagnostic', kind: 'diagnostic', title: 'Diagnostic', mode: 'exam',
    status: result.writing || result.speaking ? 'pending_review' : 'done', band: bands.overall, raw: rl.correct + rr.correct, max: rl.total + rr.total, timeSec: b.timeSec,
    answers: { answers: b.answers || {}, writingText: b.writingText || '' }, result });
  res.json({ attempt: attemptOut(row) });
}));
/* writing is already saved with the attempt; speaking brings its recordings here */
router.post('/ielts/diagnostic/assess', wrap(async (req, res) => {
  const { fields, files } = await readForm(req).catch((e) => { res.status(e.status || 400).json({ error: 'bad_form' }); return {}; });
  if (!fields) return;
  const row = await ownAttempt(req, fields.attemptId);
  if (!row || row.skill !== 'diagnostic') return res.status(404).json({ error: 'not_found' });
  if (fields.skill === 'speaking' && files.length) {
    let items = [];
    try { items = JSON.parse(fields.items || '[]'); } catch {}
    await tx(async (c) => {
      await c.query('DELETE FROM attempt_audio WHERE attempt_id = $1', [row.id]);
      await saveAudio(c, row.id, items, files);
      const sp = { ...(row.result.speaking || {}), status: 'pending_review', items: items.map((x) => ({ itemId: x.itemId, durationSec: Number(x.durationSec) || 0 })) };
      await c.query(`UPDATE attempts SET result = jsonb_set(result, '{speaking}', $2::jsonb), status = 'pending_review' WHERE id = $1`, [row.id, JSON.stringify(sp)]);
    });
  }
  res.json({ ok: true });
}));

/* ----------------------------------------------------------------- mocks */

const MOCK_ORDER = ['listening', 'reading', 'writing', 'speaking'];
const MOCK_MIN = { listening: 40, reading: 60, writing: 60, speaking: 14 };
const FRESH_DAYS = 30;
const mocksState = (uid) => getState(uid, 'mocks', { seq: 0, list: {} });

async function refreshSession(uid, s) {
  const ids = s.sections.flatMap((x) => x.attemptIds).map(Number).filter((x) => x > 0);
  const { rows } = ids.length ? await pool.query('SELECT * FROM attempts WHERE user_id = $1 AND id = ANY($2)', [uid, ids]) : { rows: [] };
  const A = Object.fromEntries(rows.map((r) => [String(r.id), r]));
  for (const x of s.sections) {
    if (!x.attemptIds.length) { x.state = x.closed || s.status !== 'in_progress' ? 'missing' : 'pending'; x.band = null; continue; }
    const list = x.attemptIds.map((id) => A[String(id)]).filter(Boolean);
    if (x.name === 'listening' || x.name === 'reading') {
      const a = list[0];
      Object.assign(x, { band: num(a?.band), rawScore: a?.raw_score ?? null, maxScore: a?.max_score ?? null, state: a ? 'done' : 'missing', parts: [] });
      continue;
    }
    x.parts = list.map((a) => ({ attemptId: a.id, status: a.status, criteria: a.result?.criteria || null }));
    const ready = x.parts.length && x.parts.every((q) => q.status === 'done');
    x.state = ready ? 'done' : 'checking';
    const b = list.map((a) => num(a.band)).filter((v) => v != null);
    // Task 2 counts twice as much as Task 1
    x.band = ready && b.length ? (x.name === 'writing' && b.length === 2 ? r5((b[0] + 2 * b[1]) / 3) : r5(b.reduce((t, v) => t + v, 0) / b.length)) : null;
  }
  const bands = s.sections.map((x) => x.band);
  s.overall = s.status !== 'aborted' && bands.every((v) => v != null) ? r5(bands.reduce((a, v) => a + v, 0) / 4) : null;
  s.partial = s.status !== 'in_progress' && s.status !== 'aborted' && s.sections.some((x) => x.state === 'missing');
  return s;
}
const sessionOut = (s) => ({ ...s, serverNow: new Date().toISOString() });

router.get('/mobile/ielts/mocks', wrap(async (req, res) => {
  const mod = req.query.module;
  const S = await mocksState(req.user.id);
  for (const s of Object.values(S.list)) await refreshSession(req.user.id, s);
  const open = Object.values(S.list).find((s) => s.status === 'in_progress');
  res.json({
    mocks: C.mocks().filter((m) => !mod || m.module === mod).map((m) => {
      const ss = Object.values(S.list).filter((s) => s.mockId === m.id).sort((a, b) => b.id - a.id)[0];
      return { ...m, fresh: Date.now() - Date.parse(m.createdAt) < FRESH_DAYS * 864e5, status: ss ? (ss.status === 'in_progress' ? 'in_progress' : 'submitted') : 'not_started',
        sessionId: ss?.id ?? null, sections: ss ? Object.fromEntries(ss.sections.map((x) => [x.name, x.state])) : {} };
    }),
    history: Object.values(S.list).filter((s) => !mod || s.module === mod).sort((a, b) => b.id - a.id)
      .map((s) => ({ ...sessionOut(s), sections: s.sections.map((x) => ({ name: x.name, band: x.band ?? null, state: x.state })) })),
    open: open ? { id: open.id, mockId: open.mockId, title: open.title } : null, freshDays: FRESH_DAYS,
  });
}));

async function withSession(req, res, fn) {
  const S = await mocksState(req.user.id);
  const s = S.list[req.params.sid];
  if (!s) return nf(res);
  const out = await fn(s, S);
  if (res.headersSent) return;
  await refreshSession(req.user.id, s);
  await setState(req.user.id, 'mocks', S);
  res.json(out ?? sessionOut(s));
}
router.post('/mobile/ielts/mocks/:id/sessions', wrap(async (req, res) => {
  const d = C.doc(req.params.id);
  if (!d) return nf(res);
  const S = await mocksState(req.user.id);
  if (Object.values(S.list).some((s) => s.status === 'in_progress')) return res.status(409).json({ ok: false, reason: 'open', message: 'A mock is already in progress' });
  const sec = d.document.sections || {};
  const id = ++S.seq;
  S.list[id] = { id, mockId: req.params.id, title: d.test?.title || d.document.title, module: d.document.module || 'academic', status: 'in_progress', partial: false, overall: null,
    startedAt: new Date().toISOString(), finishedAt: null, section: null, sectionDeadline: null, draft: null,
    sections: MOCK_ORDER.map((name) => ({ name, testIds: [].concat(sec[name] || []), attemptIds: [], state: 'pending', band: null })) };
  await refreshSession(req.user.id, S.list[id]);
  await setState(req.user.id, 'mocks', S);
  res.json(sessionOut(S.list[id]));
}));
router.get('/mobile/ielts/mocks/sessions/:sid', wrap((req, res) => withSession(req, res, () => null)));
router.post('/mobile/ielts/mocks/sessions/:sid/sections/:sec/start', wrap((req, res) => withSession(req, res, (s) => {
  if (!MOCK_ORDER.includes(req.params.sec)) return void bad(res, 'bad-section');
  s.section = req.params.sec; s.sectionDeadline = new Date(Date.now() + MOCK_MIN[req.params.sec] * 6e4).toISOString(); s.draft = null;
})));
router.put('/mobile/ielts/mocks/sessions/:sid/sections/:sec/draft', wrap((req, res) => withSession(req, res, (s) => {
  if (s.section === req.params.sec && JSON.stringify(req.body || {}).length < 2e5) s.draft = req.body;
  return { ok: true };
})));
router.post('/mobile/ielts/mocks/sessions/:sid/sections/:sec/finish', wrap((req, res) => withSession(req, res, (s) => {
  const x = s.sections.find((y) => y.name === req.params.sec);
  if (!x) return void bad(res, 'bad-section');
  x.attemptIds = (req.body?.attemptIds || []).filter((v) => v != null).map(String);
  x.closed = true;
  s.section = null; s.sectionDeadline = null; s.draft = null;
  if (s.sections.every((y) => y.attemptIds.length || y.closed)) { s.status = 'submitted'; s.finishedAt = new Date().toISOString(); }
})));
router.post('/mobile/ielts/mocks/sessions/:sid/abort', wrap((req, res) => withSession(req, res, (s) => {
  s.status = 'aborted'; s.section = null; s.finishedAt = new Date().toISOString();
})));

/* ------------------------------------------------------------ vocabulary */

router.get('/mobile/vocab-progress', wrap(async (req, res) => {
  const scopes = String(req.query.scopes || '').split(',').filter(Boolean).slice(0, 50);
  const out = {};
  for (const s of scopes) {
    const st = Object.values(await getState(req.user.id, 'vocab:' + s, {}));
    out[s] = { seen: st.length, learned: st.filter((x) => x.learned).length, due: st.filter((x) => x.due).length };
  }
  res.json(out);
}));
router.get('/mobile/vocab-progress/:scope', wrap(async (req, res) => res.json(await getState(req.user.id, 'vocab:' + req.params.scope, {}))));
router.post('/mobile/vocab-progress/:scope', wrap(async (req, res) => {
  const key = 'vocab:' + req.params.scope;
  const sc = await getState(req.user.id, key, {});
  // Leitner boxes: right moves a word up a box, wrong sends it back to 1; box 3+ counts as learned
  for (const r of (req.body?.results || []).slice(0, 500)) {
    const x = (sc[String(r.key).slice(0, 120)] ||= { box: 0 });
    x.box = r.ok ? Math.min(5, (x.box || 0) + 1) : 1; x.due = false; x.learned = x.box >= 3; x.at = new Date().toISOString();
  }
  await setState(req.user.id, key, sc);
  res.json(sc);
}));

const savedState = (uid) => getState(uid, 'savedWords', { seq: 0, list: [] });
router.get('/mobile/lesson-vocab/saved', wrap(async (req, res) => res.json({ words: (await savedState(req.user.id)).list })));
async function addWord(req, res) {
  const b = req.body || {};
  const word = String(b.word || '').trim().slice(0, 120);
  if (!word) return bad(res, 'no-word');
  const S = await savedState(req.user.id);
  if (!S.list.some((w) => w.word.toLowerCase() === word.toLowerCase())) {
    S.list.push({ id: ++S.seq, word, translationRu: b.translationRu || b.translation || null, translationKz: b.translationKz || null, example: b.example || null, learned: false, source: b.source || 'manual', createdAt: new Date().toISOString() });
    await setState(req.user.id, 'savedWords', S);
  }
  res.json({ ok: true });
}
router.post('/mobile/lesson-vocab', wrap(addWord));
router.post('/mobile/saved-words', wrap(addWord));
router.post('/mobile/lesson-vocab/saved/learned', wrap(async (req, res) => {
  const S = await savedState(req.user.id), ids = (req.body?.ids || []).map(Number);
  for (const w of S.list) if (ids.includes(w.id)) w.learned = true;
  await setState(req.user.id, 'savedWords', S);
  res.json({ ok: true });
}));
router.delete('/mobile/lesson-vocab/words/:id', wrap(async (req, res) => {
  const S = await savedState(req.user.id);
  S.list = S.list.filter((w) => String(w.id) !== req.params.id);
  await setState(req.user.id, 'savedWords', S);
  res.json({ ok: true });
}));

/* No limits on the platform; no translation service yet. */
router.get('/mobile/content-quota/usage', (req, res) => res.json([]));
router.get('/translate', (req, res) => res.json({ translation: '' }));

module.exports = router;
