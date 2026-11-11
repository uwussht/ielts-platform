/* ==========================================================================
   Sign-up and sign-in, under /app-api, as on the SAT platform:

     POST /registration        { firstName, lastName, phone, password, email?, consent: true, lang? } → session
     POST /auth/login          { phone, password } → session
     POST /auth/logout         ends this session
     GET  /user/me             the caller, with their course access
     POST /user/set-password   { password }

   A session is { ok, accessToken, user }. Errors are { ok:false, reason }:
     400 bad-phone, bad-name, bad-email, bad-password-length, no-consent
     401 no-account, bad-password
     409 exists (the phone has an account), email-taken
     429 too-many
   ========================================================================== */
'use strict';

const express = require('express');
const { pool } = require('./db');
const A = require('./auth');

const router = express.Router();
const fail = (res, status, reason) => res.status(status).json({ ok: false, reason, message: reason });
const clean = (s, max) => String(s || '').trim().replace(/\s+/g, ' ').slice(0, max);
const MAX_PASSWORD = 200;

function userOut(u) {
  const name = u.name || [u.first_name, u.last_name].filter(Boolean).join(' ');
  return {
    id: u.id, name,
    firstName: u.first_name || name.split(' ')[0] || '',
    lastName: u.last_name || name.split(' ').slice(1).join(' '),
    email: u.email, phone: u.phone, role: u.role, lang: u.lang || null,
    access: A.accessOfUser(u),
  };
}
async function session(res, u, status = 200) {
  const accessToken = await A.createSession(u.id);
  res.status(status).json({ ok: true, accessToken, user: userOut(u) });
}
async function promoteIfAdmin(u) {
  if (u.role === 'admin' || !A.isAdminContact(u.phone, u.email)) return u;
  await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [u.id]);
  return { ...u, role: 'admin' };
}

router.post('/registration', async (req, res, next) => {
  const b = req.body || {};
  const phone = A.normPhone(b.phone);
  const password = String(b.password || '');
  const firstName = clean(b.firstName, 60);
  const lastName = clean(b.lastName, 60);
  const rawEmail = clean(b.email, 120);
  const email = rawEmail ? A.normEmail(rawEmail) : null;
  if (!firstName || !lastName) return fail(res, 400, 'bad-name');
  if (!phone) return fail(res, 400, 'bad-phone');
  if (password.length < A.MIN_PASSWORD || password.length > MAX_PASSWORD) return fail(res, 400, 'bad-password-length');
  if (rawEmail && !email) return fail(res, 400, 'bad-email');
  if (b.consent !== true) return fail(res, 400, 'no-consent');
  if (A.rateLimited('reg:' + req.ip)) return fail(res, 429, 'too-many');
  try {
    const taken = await pool.query(
      `SELECT phone = $1 AS p FROM users
        WHERE password_hash IS NOT NULL AND (phone = $1 OR ($2::text IS NOT NULL AND lower(email) = $2)) LIMIT 1`, [phone, email]);
    if (taken.rows.length) return fail(res, 409, taken.rows[0].p ? 'exists' : 'email-taken');
    const hash = await A.hashPassword(password);
    const { rows } = await pool.query(
      `INSERT INTO users (first_name, last_name, name, email, phone, lang, password_hash, role, consent_at, last_login_at)
       VALUES ($1, $2, $1 || ' ' || $2, $3, $4, $5, $6, $7, now(), now()) RETURNING *`,
      [firstName, lastName, email, phone, clean(b.lang, 5) || null, hash, A.isAdminContact(phone, email) ? 'admin' : 'student']);
    await A.givePlans(rows[0].id);
    await session(res, rows[0], 201);
  } catch (e) {
    if (e.code === '23505') return fail(res, 409, /email/.test(e.constraint || '') ? 'email-taken' : 'exists');
    next(e);
  }
});

router.post('/auth/login', async (req, res, next) => {
  const b = req.body || {};
  const phone = A.normPhone(b.phone);
  const password = String(b.password || '');
  if (!phone) return fail(res, 400, 'bad-phone');
  if (A.rateLimited('login:' + req.ip + ':' + phone)) return fail(res, 429, 'too-many');
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE password_hash IS NOT NULL AND phone = $1 LIMIT 1', [phone]);
    if (!rows.length) return fail(res, 401, 'no-account');
    if (!(await A.checkPassword(password, rows[0].password_hash))) return fail(res, 401, 'bad-password');
    const u = await promoteIfAdmin(rows[0]);
    await pool.query('UPDATE users SET last_login_at = now() WHERE id = $1', [u.id]);
    await session(res, u);
  } catch (e) { next(e); }
});

router.post('/auth/logout', A.requireUser, async (req, res, next) => {
  try { await A.dropSession(req.token); res.json({ ok: true }); } catch (e) { next(e); }
});

router.get('/user/me', A.requireUser, (req, res) => res.json(userOut(req.user)));

router.post('/user/set-password', A.requireUser, async (req, res, next) => {
  const pw = String(req.body?.password || '');
  if (pw.length < A.MIN_PASSWORD || pw.length > MAX_PASSWORD) return fail(res, 400, 'bad-password-length');
  try {
    await pool.query('UPDATE users SET password_hash = $2 WHERE id = $1', [req.user.id, await A.hashPassword(pw)]);
    // other devices sign in again
    await pool.query('DELETE FROM sessions WHERE user_id = $1 AND token_hash <> encode(sha256($2::bytea), \'hex\')', [req.user.id, req.token]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
