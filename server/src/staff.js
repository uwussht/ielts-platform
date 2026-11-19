/* ==========================================================================
   Routes, all under /staff-api:

     me           GET    /me                     role, permissions and plans of the caller
                  PUT    /me/snapshot            the student's track, bands and exam date
                  GET    /me/scores              the caller's reported official results
                  POST   /me/scores              report an official IELTS result (waits)
     staff        GET    /staff/users?q=&role=   the students table
                  PUT    /staff/users/:id/plans  plans (manager, admin)
                  PUT    /staff/users/:id/access { type: none|trial|full, until? } course access (manager, admin)
                  PUT    /staff/users/:id/role   role (admin)
                  DELETE /staff/users/:id        the staff record (admin; never oneself)
                  POST   /staff/scores/:id       confirm / send back a result (curator, admin)
                  GET    /staff/users/:id/attempts      a student's attempts
     test bank    GET    /staff/tests?skill=&q=         the bank with attempt counts
                  GET    /staff/tests/:id               a test with its answer keys

   Deleting a student deletes the account and everything in it.
   ========================================================================== */
'use strict';

const express = require('express');
const { pool, tx } = require('./db');
const { requireUser, requirePerm, permsOf, ROLES, PLANS, accessOf, accessOfUser, today } = require('./auth');
const C = require('./content');
const AI = require('./ai');
const Sync = require('./sync');

const router = express.Router();
router.use(requireUser);

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const num = (v) => (v == null ? null : Number(v));
/** An IELTS band: 0–9 in half steps, or null. */
function band(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 9 && Math.round(n * 2) === n * 2 ? n : undefined;
}
const clean = (s, max) => String(s || '').trim().replace(/\s+/g, ' ').slice(0, max);

function scoreRow(r) {
  return {
    id: r.id, source: r.source, overall: num(r.overall),
    listening: num(r.listening), reading: num(r.reading), writing: num(r.writing), speaking: num(r.speaking),
    date: iso(r.taken_on), status: r.status, comment: r.comment || null,
  };
}

async function plansOf(id) {
  const { rows } = await pool.query('SELECT plan FROM user_plans WHERE user_id = $1 ORDER BY plan', [id]);
  return rows.map((r) => r.plan);
}

/* ------------------------------------------------------------------ me */

router.get('/me', async (req, res, next) => {
  try {
    const u = req.user;
    res.json({ ok: true, user: { id: u.id, name: u.name, role: u.role, perms: permsOf(u.role), plans: await plansOf(u.id), access: accessOfUser(u) } });
  } catch (e) { next(e); }
});

/** What the staff table shows about a student, sent by the app when it loads. */
router.put('/me/snapshot', async (req, res, next) => {
  const b = req.body || {};
  const bands = ['startBand', 'currentBand', 'targetBand'].map((k) => band(b[k]));
  if (bands.includes(undefined)) return res.status(400).json({ ok: false, reason: 'bad-band' });
  if (b.examDate && !isDate(b.examDate)) return res.status(400).json({ ok: false, reason: 'bad-date' });
  try {
    await pool.query(
      `UPDATE users SET track = $2, programme = $3, start_band = $4, current_band = $5,
              target_band = $6, exam_date = $7, last_seen_at = now() WHERE id = $1`,
      [req.user.id, clean(b.track, 20) || null, clean(b.programme, 80) || null,
        bands[0], bands[1], bands[2], b.examDate || null]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/me/scores', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM score_reports WHERE user_id = $1 ORDER BY taken_on DESC, id DESC', [req.user.id]);
    res.json({ ok: true, scores: rows.map(scoreRow) });
  } catch (e) { next(e); }
});

/** An official result the student reports; a curator confirms it or sends it back. */
router.post('/me/scores', async (req, res, next) => {
  const b = req.body || {};
  const parts = ['overall', 'listening', 'reading', 'writing', 'speaking'].map((k) => band(b[k]));
  if (parts.includes(undefined) || parts[0] == null) return res.status(400).json({ ok: false, reason: 'bad-band' });
  if (!isDate(b.date) || b.date > iso(new Date())) return res.status(400).json({ ok: false, reason: 'bad-date' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO score_reports (user_id, source, overall, listening, reading, writing, speaking, taken_on)
       VALUES ($1, 'official', $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.user.id, ...parts, b.date]);
    res.json({ ok: true, score: scoreRow(rows[0]) });
  } catch (e) { next(e); }
});

/* --------------------------------------------------------------- staff */

const staff = express.Router();
staff.use(requirePerm('staff'));

staff.get('/users', async (req, res, next) => {
  const q = clean(req.query.q, 80).toLowerCase();
  const role = ROLES.includes(req.query.role) ? req.query.role : null;
  try {
    const vals = [];
    const where = [];
    if (q) {
      vals.push('%' + q + '%');
      where.push(`(lower(u.name) LIKE $${vals.length} OR coalesce(u.phone, '') LIKE $${vals.length} OR lower(coalesce(u.email, '')) LIKE $${vals.length})`);
    }
    if (role) { vals.push(role); where.push(`u.role = $${vals.length}`); }
    const { rows } = await pool.query(
      `SELECT u.*,
              COALESCE((SELECT array_agg(plan ORDER BY plan) FROM user_plans p WHERE p.user_id = u.id), '{}') AS plans
         FROM users u ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY u.created_at DESC LIMIT 500`, vals);
    const ids = rows.map((r) => r.id);
    const scores = {};
    if (ids.length) {
      const sc = await pool.query('SELECT * FROM score_reports WHERE user_id = ANY($1) ORDER BY taken_on DESC, id DESC', [ids]);
      sc.rows.forEach((r) => (scores[r.user_id] = scores[r.user_id] || []).push(scoreRow(r)));
    }
    const aiUsed = ids.length ? await AI.usedBy(ids) : {};
    res.json({
      ok: true,
      users: rows.map((r) => ({
        id: r.id, name: r.name, phone: r.phone, email: r.email, role: r.role, plans: r.plans,
        createdAt: r.created_at, lastSeenAt: r.last_seen_at, lastLoginAt: r.last_login_at,
        access: accessOfUser(r),
        ai: AI.usageView(r.role, r.ai_limit, aiUsed[r.id] || 0),
        track: r.track, programme: r.programme,
        startBand: num(r.start_band), currentBand: num(r.current_band), targetBand: num(r.target_band),
        examDate: iso(r.exam_date),
        scores: scores[r.id] || [],
      })),
    });
  } catch (e) { next(e); }
});

staff.put('/users/:id/plans', requirePerm('plans'), async (req, res, next) => {
  const id = Number(req.params.id);
  const plans = Array.isArray(req.body?.plans) ? [...new Set(req.body.plans)] : null;
  if (!plans || plans.some((p) => !PLANS.includes(p))) return res.status(400).json({ ok: false, reason: 'bad-plan' });
  try {
    await tx(async (c) => {
      await c.query('DELETE FROM user_plans WHERE user_id = $1', [id]);
      if (plans.length) await c.query('INSERT INTO user_plans (user_id, plan) SELECT $1, unnest($2::text[])', [id, plans]);
    });
    res.json({ ok: true, plans: await plansOf(id) });
  } catch (e) { next(e); }
});

/**
 * Course access: none, trial or full, until a date (the last day included)
 * or, with no date, open-ended. A trial with no date lasts TRIAL_DAYS,
 * today included.
 */
const TRIAL_DAYS = 7;
const addDays = (day, n) => { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
staff.put('/users/:id/access', requirePerm('access'), async (req, res, next) => {
  const id = Number(req.params.id);
  const type = req.body?.type;
  let until = req.body?.until || null;
  if (!['none', 'trial', 'full'].includes(type)) return res.status(400).json({ ok: false, reason: 'bad-access' });
  if (until !== null && !isDate(until)) return res.status(400).json({ ok: false, reason: 'bad-date' });
  if (type === 'trial' && !until) until = addDays(today(), TRIAL_DAYS - 1);
  if (type === 'none') until = null;
  try {
    const { rows } = await pool.query(
      `UPDATE users SET access_type = $2, access_until = $3, access_set_by = $4, access_set_at = now()
        WHERE id = $1 RETURNING role, access_type, access_until`, [id, type, until, req.user.id]);
    if (!rows.length) return res.status(404).json({ ok: false, reason: 'not-found' });
    res.json({ ok: true, access: accessOf(rows[0].role, rows[0].access_type, rows[0].access_until) });
  } catch (e) { next(e); }
});

/** The number of AI checks for one student; null goes back to the AI_LIMIT default. */
staff.put('/users/:id/ai-limit', requirePerm('access'), async (req, res, next) => {
  const id = Number(req.params.id);
  const limit = req.body?.limit;
  if (limit !== null && !(Number.isInteger(limit) && limit >= 0 && limit <= 1000)) return res.status(400).json({ ok: false, reason: 'bad-limit' });
  try {
    const r = await pool.query('UPDATE users SET ai_limit = $2 WHERE id = $1', [id, limit]);
    if (!r.rowCount) return res.status(404).json({ ok: false, reason: 'not-found' });
    res.json({ ok: true, ai: await AI.usage(id) });
  } catch (e) { next(e); }
});

staff.put('/users/:id/role', requirePerm('roles'), async (req, res, next) => {
  const id = Number(req.params.id);
  const role = req.body?.role;
  if (!ROLES.includes(role)) return res.status(400).json({ ok: false, reason: 'bad-role' });
  /* An admin cannot demote themself: the last admin would lock everyone out. */
  if (id === req.user.id && role !== 'admin') return res.status(400).json({ ok: false, reason: 'self' });
  try {
    const r = await pool.query('UPDATE users SET role = $2 WHERE id = $1', [id, role]);
    if (!r.rowCount) return res.status(404).json({ ok: false, reason: 'not-found' });
    res.json({ ok: true, role });
  } catch (e) { next(e); }
});

staff.delete('/users/:id', requirePerm('roles'), async (req, res, next) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ ok: false, reason: 'self' });
  try {
    const r = await pool.query('DELETE FROM users WHERE id = $1', [id]);
    if (!r.rowCount) return res.status(404).json({ ok: false, reason: 'not-found' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

staff.post('/scores/:id', requirePerm('scores'), async (req, res, next) => {
  const status = req.body?.status;
  const comment = clean(req.body?.comment, 500);
  if (!['confirmed', 'rejected'].includes(status)) return res.status(400).json({ ok: false, reason: 'bad-status' });
  if (status === 'rejected' && !comment) return res.status(400).json({ ok: false, reason: 'comment' });
  try {
    const { rows } = await pool.query(
      `UPDATE score_reports SET status = $2, comment = $3, reviewed_by = $4, reviewed_at = now()
        WHERE id = $1 RETURNING *`, [Number(req.params.id), status, comment || null, req.user.id]);
    if (!rows.length) return res.status(404).json({ ok: false, reason: 'not-found' });
    res.json({ ok: true, score: scoreRow(rows[0]) });
  } catch (e) { next(e); }
});

/* ------------------------------------------------------- a student's work */

const r5 = (x) => Math.round(x * 2) / 2;
const attemptRow = (r) => ({
  id: r.id, userId: r.user_id, student: r.student_name ?? undefined, testId: r.test_id, skill: r.skill, kind: r.kind, title: r.title, mode: r.mode,
  status: r.status, band: num(r.band), rawScore: r.raw_score, maxScore: r.max_score, timeSec: r.time_sec, finishedAt: r.finished_at,
});

staff.get('/users/:id/attempts', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.id, a.user_id, a.test_id, a.skill, a.kind, a.title, a.mode, a.status, a.band, a.raw_score, a.max_score, a.time_sec, a.finished_at
         FROM attempts a WHERE a.user_id = $1 ORDER BY a.finished_at DESC LIMIT 300`, [Number(req.params.id) || 0]);
    res.json({ ok: true, attempts: rows.map(attemptRow) });
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------- test bank */

/* The sync from the admin bank (sync.js): its state, and a run now (admins). */
staff.get('/sync', (req, res) => res.json({ ok: true, sync: Sync.status() }));
staff.post('/sync', requirePerm('roles'), async (req, res) => {
  // waits for the run, but answers within 25 s either way (the page asks again)
  await Promise.race([Sync.run(), new Promise((r) => setTimeout(r, 25e3))]);
  res.json({ ok: true, sync: Sync.status() });
});

staff.get('/tests', async (req, res, next) => {
  const skill = ['reading', 'listening', 'writing', 'speaking', 'vocab', 'mock'].includes(req.query.skill) ? req.query.skill : 'reading';
  const q = clean(req.query.q, 80).toLowerCase();
  try {
    const list = (skill === 'mock' ? C.mocks().map((m) => ({ ...m, kind: 'mock' })) : C.list(skill))
      .filter((m) => !q || m.id.toLowerCase().includes(q) || String(m.title || '').toLowerCase().includes(q));
    const { rows } = await pool.query(
      'SELECT test_id, count(*)::int AS n, avg(band)::float AS band FROM attempts WHERE test_id = ANY($1) GROUP BY test_id', [list.map((m) => m.id)]);
    const by = Object.fromEntries(rows.map((r) => [r.test_id, r]));
    res.json({ ok: true, tests: list.map((m) => ({ id: m.id, title: m.title, kind: m.kind, module: m.module, category: m.category, questionCount: m.questionCount,
      bandMin: m.bandMin, bandMax: m.bandMax, hasKey: !!C.check.keysOf(m.id), attempts: by[m.id]?.n || 0, avgBand: by[m.id]?.band != null ? r5(by[m.id].band) : null })) });
  } catch (e) { next(e); }
});

staff.get('/tests/:id', (req, res) => {
  const d = C.doc(req.params.id);
  if (!d) return res.status(404).json({ ok: false, reason: 'not-found' });
  res.json({ ok: true, test: { ...(C.meta(req.params.id) || {}), ...d.test }, document: C.withKeys(d.document, req.params.id), hasKey: !!C.check.keysOf(req.params.id) });
});

router.use('/staff', staff);

module.exports = router;
