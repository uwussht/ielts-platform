/* ==========================================================================
   Who is calling. The IELTS app signs in against the ai-tutor backend and
   holds its Bearer token; this API checks that token by asking the same
   backend for /user/me, then finds (or creates) the matching row here.

   Roles and what each may do in the staff area:
     student   nothing
     teacher   sees the students table
     curator   + confirms or sends back official results
     manager   + sets a student's plans
     admin     everything: roles, and deleting a student's staff record
   ========================================================================== */
'use strict';

const crypto = require('crypto');
const { pool } = require('./db');

const AI_API = String(process.env.AI_TUTOR_API || 'https://prod-server.justtostudy.kz').replace(/\/+$/, '');
/* Phones listed here are made admins on their first call: the way the first
   administrator gets in. Comma-separated, any spelling. */
const ADMIN_PHONES = String(process.env.ADMIN_PHONES || '').split(',').map(normPhone).filter(Boolean);
/* Plan ids, the same as `plans` in js/config.js, and the ones a new student starts with. */
const PLANS = list(process.env.PLANS || 'self,coach,intensive');
const DEFAULT_PLANS = list(process.env.DEFAULT_PLANS || 'self').filter((p) => PLANS.includes(p));

const ROLES = ['student', 'teacher', 'curator', 'manager', 'admin'];
const PERMS = {
  staff: ['teacher', 'curator', 'manager', 'admin'],
  plans: ['manager', 'admin'],
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
  if (d.length < 10 || d.length > 15) return null;
  return '+' + d;
}

/* A token is checked against ai-tutor at most once a minute. */
const seen = new Map();
const TTL = 60e3;

async function aiUser(token) {
  const key = crypto.createHash('sha256').update(token).digest('hex');
  const hit = seen.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.user;
  const res = await fetch(AI_API + '/user/me', { headers: { Authorization: 'Bearer ' + token } });
  if (!res.ok) return null;
  const u = await res.json().catch(() => null);
  if (!u || u.id == null) return null;
  const user = {
    extId: String(u.id),
    phone: normPhone(u.phone),
    email: u.email ? String(u.email).toLowerCase() : null,
    name: String(u.name || [u.firstName, u.lastName].filter(Boolean).join(' ') || '').trim().slice(0, 120),
  };
  seen.set(key, { at: Date.now(), user });
  if (seen.size > 5000) seen.delete(seen.keys().next().value);
  return user;
}

/** The row for this ai-tutor account, created on the first call. */
async function upsert(ai) {
  const admin = !!(ai.phone && ADMIN_PHONES.includes(ai.phone));
  const { rows } = await pool.query(
    `INSERT INTO users (ext_id, phone, email, name, role)
     VALUES ($1, $2, $3, $4, CASE WHEN $5 THEN 'admin' ELSE 'student' END)
     ON CONFLICT (ext_id) DO UPDATE SET
       phone = EXCLUDED.phone,
       email = EXCLUDED.email,
       name = CASE WHEN EXCLUDED.name <> '' THEN EXCLUDED.name ELSE users.name END,
       role = CASE WHEN $5 THEN 'admin' ELSE users.role END,
       last_seen_at = now()
     RETURNING *, (xmax = 0) AS inserted`,
    [ai.extId, ai.phone, ai.email, ai.name, admin]);
  const r = rows[0];
  if (r.inserted && DEFAULT_PLANS.length) {
    await pool.query(
      'INSERT INTO user_plans (user_id, plan) SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING',
      [r.id, DEFAULT_PLANS]);
  }
  return r;
}

/** Express middleware: req.user is this API's row for the caller. */
async function requireUser(req, res, next) {
  try {
    const m = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
    if (!m) return res.status(401).json({ ok: false, reason: 'no-token' });
    const ai = await aiUser(m[1].trim());
    if (!ai) return res.status(401).json({ ok: false, reason: 'bad-token' });
    req.user = await upsert(ai);
    next();
  } catch (e) { next(e); }
}

function requirePerm(perm) {
  return (req, res, next) => (can(req.user.role, perm) ? next() : res.status(403).json({ ok: false, reason: 'forbidden' }));
}

module.exports = { requireUser, requirePerm, can, permsOf, normPhone, ROLES, PERMS, PLANS };
