/* ==========================================================================
   Database: the connection pool and the schema.

   Accounts themselves live on the ai-tutor backend. This database keeps only
   what the staff area adds to them: a role, the plans a student has, the
   official IELTS results waiting for confirmation, and a snapshot of where
   the student is (route, bands, exam date) for the staff table.

   Schema changes are numbered migrations, applied once each and in order
   when the API starts. Never edit one that has shipped: add the next number.
   ========================================================================== */
'use strict';

const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const MIGRATIONS = [
  /* 1: staff data on top of ai-tutor accounts. */
  `CREATE TABLE IF NOT EXISTS users (
     id            SERIAL PRIMARY KEY,
     ext_id        TEXT NOT NULL UNIQUE,
     phone         TEXT,
     email         TEXT,
     name          TEXT NOT NULL DEFAULT '',
     role          TEXT NOT NULL DEFAULT 'student'
                   CHECK (role IN ('student', 'teacher', 'curator', 'manager', 'admin')),
     track         TEXT,
     route         TEXT,
     programme     TEXT,
     start_band    NUMERIC(2,1),
     current_band  NUMERIC(2,1),
     target_band   NUMERIC(2,1),
     exam_date     DATE,
     created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
     last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE INDEX IF NOT EXISTS users_phone_idx ON users (phone);
   CREATE TABLE IF NOT EXISTS user_plans (
     user_id  INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
     plan     TEXT NOT NULL,
     PRIMARY KEY (user_id, plan)
   );
   CREATE TABLE IF NOT EXISTS score_reports (
     id          SERIAL PRIMARY KEY,
     user_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
     source      TEXT NOT NULL DEFAULT 'official' CHECK (source IN ('official', 'mock')),
     overall     NUMERIC(2,1) NOT NULL CHECK (overall BETWEEN 0 AND 9),
     listening   NUMERIC(2,1),
     reading     NUMERIC(2,1),
     writing     NUMERIC(2,1),
     speaking    NUMERIC(2,1),
     taken_on    DATE NOT NULL,
     status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
     comment     TEXT,
     reviewed_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
     reviewed_at TIMESTAMPTZ,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE INDEX IF NOT EXISTS score_reports_user_idx ON score_reports (user_id, taken_on DESC)`,
];

async function tx(fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

async function migrate() {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const { rows } = await pool.query('SELECT version FROM schema_migrations');
  const done = new Set(rows.map((r) => r.version));
  for (let i = 0; i < MIGRATIONS.length; i++) {
    const v = i + 1;
    if (done.has(v)) continue;
    await tx(async (c) => {
      await c.query(MIGRATIONS[i]);
      await c.query('INSERT INTO schema_migrations (version) VALUES ($1)', [v]);
    });
    console.log('[db] migration', v, 'applied');
  }
}

module.exports = { pool, tx, migrate };
