/* ==========================================================================
   The platform's API: accounts and the student's data (/app-api) and the
   staff area (/staff-api). Runs behind the site's server.js, which forwards
   both paths here when API_ORIGIN is set (see docker-compose.yaml).
   ========================================================================== */
'use strict';

const express = require('express');
const { migrate } = require('./db');
const staff = require('./staff');
const account = require('./account');
const student = require('./student');

const PORT = Number(process.env.PORT) || 3000;
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '512kb' }));

app.get(['/staff-api/health', '/app-api/health'], (req, res) => res.json({ ok: true }));
app.use('/app-api', account);
app.use('/app-api', student);
app.use('/staff-api', staff);

app.use((req, res) => res.status(404).json({ ok: false, reason: 'not-found', message: 'Not found' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[api]', err);
  res.status(500).json({ ok: false, reason: 'server' });
});

migrate()
  .then(() => app.listen(PORT, () => console.log('[api] listening on', PORT)))
  .catch((e) => { console.error('[db] migration failed', e); process.exit(1); });
