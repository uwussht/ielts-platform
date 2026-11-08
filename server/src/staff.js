/* ==========================================================================
   Routes, all under /staff-api:

     me           GET    /me                     role, permissions and plans of the caller
                  PUT    /me/snapshot            the student's route, bands and exam date
                  GET    /me/scores              the caller's reported official results
                  POST   /me/scores              report an official IELTS result (waits)
     staff        GET    /staff/users?q=&role=   the students table
                  PUT    /staff/users/:id/plans  plans (manager, admin)
                  PUT    /staff/users/:id/role   role (admin)
                  DELETE /staff/users/:id        the staff record (admin; never oneself)
                  POST   /staff/scores/:id       confirm / send back a result (curator, admin)

   Deleting removes only this database's row (role, plans, results). The
   ai-tutor account and its progress stay where they are.
   ========================================================================== */
'use strict';

const express = require('express');
const { pool, tx } = require('./db');
const { requireUser, requirePerm, permsOf, ROLES, PLANS } = require('./auth');

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
    res.json({ ok: true, user: { id: u.id, name: u.name, role: u.role, perms: permsOf(u.role), plans: await plansOf(u.id) } });
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
      `UPDATE users SET track = $2, route = $3, programme = $4, start_band = $5, current_band = $6,
              target_band = $7, exam_date = $8, last_seen_at = now() WHERE id = $1`,
      [req.user.id, clean(b.track, 20) || null, clean(b.route, 40) || null, clean(b.programme, 80) || null,
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
    res.json({
      ok: true,
      users: rows.map((r) => ({
        id: r.id, name: r.name, phone: r.phone, email: r.email, role: r.role, plans: r.plans,
        createdAt: r.created_at, lastSeenAt: r.last_seen_at,
        track: r.track, route: r.route, programme: r.programme,
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

router.use('/staff', staff);

module.exports = router;
