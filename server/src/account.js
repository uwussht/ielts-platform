/* ==========================================================================
   Sign-up and sign-in, under /app-api:

     POST /registration        { name, email, phone, birthDate?, lang?, password } → session
     POST /auth/login          { email | phone, password } → session
     POST /auth/logout         ends this session
     GET  /user/me             the caller
     POST /user/set-password   { password }

   A session is { accessToken, user }. Errors are { ok:false, reason, message }:
   reason 'email-taken' / 'phone-taken' (409), 'bad-login' (401), 'bad-input' (400).
   ========================================================================== */
'use strict';

const express = require('express');
const { pool } = require('./db');
const A = require('./auth');

const router = express.Router();
const fail = (res, status, reason) => res.status(status).json({ ok: false, reason, message: reason });
const clean = (s, max) => String(s || '').trim().replace(/\s+/g, ' ').slice(0, max);

function userOut(u) {
  const name = u.name || '';
  return { id: u.id, name, firstName: name.split(' ')[0] || '', lastName: name.split(' ').slice(1).join(' '), email: u.email, phone: u.phone, role: u.role, lang: u.lang || null };
}
async function session(res, u) {
  const accessToken = await A.createSession(u.id);
  res.json({ ok: true, accessToken, user: userOut(u) });
}

router.post('/registration', async (req, res, next) => {
  const b = req.body || {};
  const name = clean(b.name, 120);
  const email = A.normEmail(b.email);
  const phone = A.normPhone(b.phone);
  const birth = /^\d{4}-\d{2}-\d{2}$/.test(String(b.birthDate || '')) ? b.birthDate : null;
  if (!name || !email || !phone) return fail(res, 400, 'bad-input');
  if (String(b.password || '').length < A.MIN_PASSWORD) return fail(res, 400, 'short-password');
  try {
    const taken = await pool.query(
      `SELECT lower(email) = $1 AS e, phone = $2 AS p FROM users
        WHERE password_hash IS NOT NULL AND (lower(email) = $1 OR phone = $2) LIMIT 1`, [email, phone]);
    if (taken.rows.length) return fail(res, 409, taken.rows[0].e ? 'email-taken' : 'phone-taken');
    const hash = await A.hashPassword(b.password);
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, phone, birth_date, lang, password_hash, role)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, email, phone, birth, clean(b.lang, 5) || null, hash, A.isAdminContact(phone, email) ? 'admin' : 'student']);
    await A.givePlans(rows[0].id);
    await session(res, rows[0]);
  } catch (e) {
    if (e.code === '23505') return fail(res, 409, /phone/.test(e.constraint || '') ? 'phone-taken' : 'email-taken');
    next(e);
  }
});

router.post('/auth/login', async (req, res, next) => {
  const b = req.body || {};
  const email = A.normEmail(b.email || (String(b.login || '').includes('@') ? b.login : ''));
  const phone = email ? null : A.normPhone(b.phone || b.login);
  if ((!email && !phone) || !b.password) return fail(res, 400, 'bad-input');
  try {
    const { rows } = await pool.query(
      `SELECT * FROM users WHERE password_hash IS NOT NULL AND ${email ? 'lower(email) = $1' : 'phone = $1'} LIMIT 1`, [email || phone]);
    const u = rows[0];
    if (!u || !(await A.checkPassword(b.password, u.password_hash))) return fail(res, 401, 'bad-login');
    if (u.role !== 'admin' && A.isAdminContact(u.phone, u.email)) {
      await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [u.id]);
      u.role = 'admin';
    }
    await session(res, u);
  } catch (e) { next(e); }
});

router.post('/auth/logout', A.requireUser, async (req, res, next) => {
  try { await A.dropSession(req.token); res.json({ ok: true }); } catch (e) { next(e); }
});

router.get('/user/me', A.requireUser, (req, res) => res.json(userOut(req.user)));

router.post('/user/set-password', A.requireUser, async (req, res, next) => {
  const pw = String(req.body?.password || '');
  if (pw.length < A.MIN_PASSWORD) return fail(res, 400, 'short-password');
  try {
    await pool.query('UPDATE users SET password_hash = $2 WHERE id = $1', [req.user.id, await A.hashPassword(pw)]);
    // other devices sign in again
    await pool.query('DELETE FROM sessions WHERE user_id = $1 AND token_hash <> encode(sha256($2::bytea), \'hex\')', [req.user.id, req.token]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
