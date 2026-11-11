/* ==========================================================================
   Database: the connection pool and the schema.

   Everything the platform knows about its people: accounts (password and
   sign-in sessions), the role and plans, the student's profile, every test
   attempt with its answers and result, recorded speaking answers, the
   student's own state (plan marks, vocabulary, mock sessions) and the
   official IELTS results waiting for confirmation.

   Migration 1 was written when accounts lived on ai-tutor (users.ext_id);
   from migration 2 on the platform has its own accounts.

   Schema changes are numbered migrations, applied once each and in order
   when the API starts. Never edit one that has shipped: add the next number.
   ========================================================================== */
'use strict';

const { Pool, types } = require('pg');

// DATE columns (exam dates, access end dates) stay 'YYYY-MM-DD' strings: as JS Dates they
// become local midnight and toISOString() would hand back the day before east of UTC.
types.setTypeParser(1082, (v) => v);

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

  /* 2: own accounts and the student's data. */
  `ALTER TABLE users ALTER COLUMN ext_id DROP NOT NULL;
   ALTER TABLE users ADD COLUMN password_hash TEXT;
   ALTER TABLE users ADD COLUMN birth_date DATE;
   ALTER TABLE users ADD COLUMN lang TEXT;
   ALTER TABLE users ADD COLUMN profile JSONB NOT NULL DEFAULT '{}';
   CREATE UNIQUE INDEX users_email_login_idx ON users (lower(email)) WHERE email IS NOT NULL AND password_hash IS NOT NULL;
   CREATE UNIQUE INDEX users_phone_login_idx ON users (phone) WHERE phone IS NOT NULL AND password_hash IS NOT NULL;
   CREATE TABLE sessions (
     token_hash    TEXT PRIMARY KEY,
     user_id       INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
     created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
     last_used_at  TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE INDEX sessions_user_idx ON sessions (user_id);
   CREATE TABLE attempts (
     id           SERIAL PRIMARY KEY,
     user_id      INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
     test_id      TEXT NOT NULL,
     skill        TEXT NOT NULL,
     kind         TEXT,
     title        TEXT NOT NULL DEFAULT '',
     mode         TEXT NOT NULL DEFAULT 'practice',
     status       TEXT NOT NULL DEFAULT 'done' CHECK (status IN ('done', 'pending_review')),
     band         NUMERIC(2,1),
     raw_score    INTEGER,
     max_score    INTEGER,
     time_sec     INTEGER,
     answers      JSONB NOT NULL DEFAULT '{}',
     result       JSONB NOT NULL DEFAULT '{}',
     finished_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
     reviewed_by  INTEGER REFERENCES users (id) ON DELETE SET NULL,
     reviewed_at  TIMESTAMPTZ
   );
   CREATE INDEX attempts_user_idx ON attempts (user_id, finished_at DESC);
   CREATE INDEX attempts_review_idx ON attempts (status, finished_at) WHERE status = 'pending_review';
   CREATE TABLE attempt_audio (
     id          SERIAL PRIMARY KEY,
     attempt_id  INTEGER NOT NULL REFERENCES attempts (id) ON DELETE CASCADE,
     item_id     TEXT NOT NULL,
     duration    REAL,
     mime        TEXT NOT NULL DEFAULT 'audio/wav',
     data        BYTEA NOT NULL
   );
   CREATE INDEX attempt_audio_attempt_idx ON attempt_audio (attempt_id);
   CREATE TABLE user_state (
     user_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
     key         TEXT NOT NULL,
     value       JSONB NOT NULL,
     updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (user_id, key)
   )`,
  // 3: sign-up as on the SAT platform (first and last name, consent) and
  // course access: none / trial / full until a date (the last day included).
  // Accounts made before this keep using the course: they get full access.
  `ALTER TABLE users ADD COLUMN first_name TEXT;
   ALTER TABLE users ADD COLUMN last_name TEXT;
   ALTER TABLE users ADD COLUMN consent_at TIMESTAMPTZ;
   ALTER TABLE users ADD COLUMN last_login_at TIMESTAMPTZ;
   ALTER TABLE users ADD COLUMN access_type TEXT NOT NULL DEFAULT 'none' CHECK (access_type IN ('none', 'trial', 'full'));
   ALTER TABLE users ADD COLUMN access_until DATE;
   ALTER TABLE users ADD COLUMN access_set_by INTEGER REFERENCES users (id) ON DELETE SET NULL;
   ALTER TABLE users ADD COLUMN access_set_at TIMESTAMPTZ;
   UPDATE users SET access_type = 'full' WHERE password_hash IS NOT NULL;
   UPDATE users SET first_name = split_part(name, ' ', 1),
                    last_name = NULLIF(substr(name, length(split_part(name, ' ', 1)) + 2), '')
    WHERE name IS NOT NULL`,
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
