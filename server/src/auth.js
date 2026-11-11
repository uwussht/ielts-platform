/* ==========================================================================
   Accounts and who is calling.

   A student signs up with their name, phone and password (email optional),
   as on the SAT platform, signs in with phone and password and gets a
   session token (random, kept here only as its SHA-256). The app sends it as
   "Authorization: Bearer <token>" to /app-api and /staff-api.

   Roles and what each may do in the staff area:
     student   nothing
     teacher   sees the students table and the test bank, checks writing and speaking
     curator   + confirms or sends back official results
     manager   + sets a student's plans and course access
     admin     everything: roles, and deleting a student

   Course access, as on the SAT platform: a new student has none until a
   manager gives a trial (a week by default) or full access, open-ended or
   until a date (the last day included). Staff always have access.
   ========================================================================== */
'use strict';

const crypto = require('crypto');
const { promisify } = require('util');
const { pool } = require('./db');

const scrypt = promisify(crypto.scrypt);

/* Phones and emails listed here are made admins when they sign up or sign in:
   the way the first administrator gets in. Comma-separated, any spelling. */
const ADMIN_PHONES = String(process.env.ADMIN_PHONES || '').split(',').map(normPhone).filter(Boolean);
const ADMIN_EMAILS = String(process.env.ADMIN_EMAILS || '').split(',').map(normEmail).filter(Boolean);
/* Plan ids, the same as `plans` in js/config.js, and the ones a new student starts with. */
const PLANS = list(process.env.PLANS || 'self,coach,intensive');
const DEFAULT_PLANS = list(process.env.DEFAULT_PLANS || 'self').filter((p) => PLANS.includes(p));

const ROLES = ['student', 'teacher', 'curator', 'manager', 'admin'];
const PERMS = {
  staff: ['teacher', 'curator', 'manager', 'admin'],
  review: ['teacher', 'curator', 'manager', 'admin'],
  plans: ['manager', 'admin'],
  access: ['manager', 'admin'],
  scores: ['curator', 'admin'],
  roles: ['admin'],
};
const can = (role, perm) => (PERMS[perm] || []).includes(role);
const permsOf = (role) => Object.keys(PERMS).filter((p) => can(role, p));

function list(s) { return String(s).split(',').map((x) => x.trim()).filter(Boolean); }

/** One spelling per number: "8 701 234 56 78" and "+7 (701) 234-56-78" are the same. */
function normPhone(raw) {
  let d = String(raw || '').replace(/[^\d+]/g, '');
  const plus = d.startsWith('+');
  d = d.replace(/\D/g, '');
  if (!plus && d.length === 11 && d.startsWith('8')) d = '7' + d.slice(1);
  if (!plus && d.length === 10) d = '7' + d;
  if (d.length < 7 || d.length > 15) return null;
  return '+' + d;
}
function normEmail(raw) {
  const e = String(raw || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}
const isAdminContact = (phone, email) => !!((phone && ADMIN_PHONES.includes(phone)) || (email && ADMIN_EMAILS.includes(email)));

/* ------------------------------------------------------------ passwords */

const MIN_PASSWORD = 8;
async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(String(pw), salt, 64);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}
async function checkPassword(pw, stored) {
  const [alg, salt, hash] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const want = Buffer.from(hash, 'base64');
  const got = await scrypt(String(pw), Buffer.from(salt, 'base64'), want.length);
  return crypto.timingSafeEqual(want, got);
}

/* ------------------------------------------------------------- sessions */

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await pool.query('INSERT INTO sessions (token_hash, user_id) VALUES ($1, $2)', [sha(token), userId]);
  return token;
}
async function dropSession(token) { await pool.query('DELETE FROM sessions WHERE token_hash = $1', [sha(token)]); }

/** A new student's plans. */
async function givePlans(userId) {
  if (!DEFAULT_PLANS.length) return;
  await pool.query('INSERT INTO user_plans (user_id, plan) SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING', [userId, DEFAULT_PLANS]);
}

const bearer = (req) => (/^Bearer\s+(.+)$/i.exec(req.get('authorization') || '') || [])[1]?.trim() || null;

/** Express middleware: req.user is the caller's row. */
async function requireUser(req, res, next) {
  try {
    const tok = bearer(req);
    if (!tok) return res.status(401).json({ ok: false, reason: 'no-token', message: 'Unauthorized' });
    const { rows } = await pool.query(
      `UPDATE sessions s SET last_used_at = now() FROM users u
        WHERE s.token_hash = $1 AND u.id = s.user_id RETURNING u.*`, [sha(tok)]);
    if (!rows.length) return res.status(401).json({ ok: false, reason: 'bad-token', message: 'Unauthorized' });
    req.user = rows[0];
    req.token = tok;
    // last_seen_at is for the staff table; once an hour is enough
    if (Date.now() - new Date(rows[0].last_seen_at).getTime() > 36e5) pool.query('UPDATE users SET last_seen_at = now() WHERE id = $1', [rows[0].id]).catch(() => {});
    next();
  } catch (e) { next(e); }
}

const isoDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
// Days (access end dates, a trial's week) are counted in the school's time zone, not UTC.
const TIME_ZONE = process.env.APP_TZ || 'Asia/Almaty';
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const today = () => dayFmt.format(new Date());

/** Can this account use the course today? */
function accessOf(role, type, until) {
  const end = isoDate(until);
  const staff = !!role && role !== 'student';
  const active = staff || ((type === 'trial' || type === 'full') && (!end || end >= today()));
  return { type: type || 'none', until: end, active, staff };
}
const accessOfUser = (u) => accessOf(u.role, u.access_type, u.access_until);

/** After requireUser: the course itself is for accounts with access. */
function requireAccess(req, res, next) {
  const access = accessOfUser(req.user);
  if (!access.active) return res.status(403).json({ ok: false, reason: 'no-access', access });
  next();
}

/** A few wrong passwords are typos; dozens from one address in 15 minutes are not. */
const tries = new Map();
function rateLimited(key, max = 20) {
  const now = Date.now(), windowMs = 15 * 60000;
  const rec = tries.get(key) || { n: 0, since: now };
  if (now - rec.since > windowMs) { rec.n = 0; rec.since = now; }
  rec.n++;
  tries.set(key, rec);
  if (tries.size > 5000) for (const [k, v] of tries) if (now - v.since > windowMs) tries.delete(k);
  return rec.n > max;
}

function requirePerm(perm) {
  return (req, res, next) => (can(req.user.role, perm) ? next() : res.status(403).json({ ok: false, reason: 'forbidden' }));
}

module.exports = {
  requireUser, requirePerm, can, permsOf, normPhone, normEmail, isAdminContact, ROLES, PERMS, PLANS,
  hashPassword, checkPassword, createSession, dropSession, givePlans, MIN_PASSWORD, bearer,
  accessOf, accessOfUser, requireAccess, rateLimited, isoDate, today,
};
