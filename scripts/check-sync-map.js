// Checks server/src/sync-map.js against the copy of the bank in content/: every test in
// content/source/tests (the admin export) is converted and compared with content/tests,
// keys, transcripts, models and its index.json entry.
//   node scripts/check-sync-map.js
'use strict';
const fs = require('fs');
const path = require('path');
const M = require('../server/src/sync-map');

const DIR = path.join(__dirname, '..', 'content');
const read = (...p) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, ...p), 'utf8')); } catch { return undefined; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const idx = read('index.json');
const entries = new Map();
for (const [skill, list] of Object.entries(idx.lists)) for (const e of list) entries.set(e.id, e);
const mocks = new Map(idx.mocks.map((m) => [m.id, m]));

const bad = {}, ok = {};
const note = (what, id, detail) => { (bad[what] ||= []).push(detail ? `${id}: ${detail}` : id); };
const pass = (what) => { ok[what] = (ok[what] || 0) + 1; };
// fields the old copy took from ai-tutor's student API that the admin bank cannot give
const PER_STUDENT = new Set(['createdAt', 'level', 'imageUrl']);

for (const f of fs.readdirSync(path.join(DIR, 'source', 'tests'))) {
  const id = f.slice(0, -5);
  const a = read('source', 'tests', f), have = read('tests', f);
  if (!have) continue;
  same(M.studentDoc(a.document), have.document) ? pass('doc') : note('doc', id);
  same(M.keysOf(a.document), read('keys', f) ?? null) ? pass('keys') : note('keys', id);
  const tr = read('transcripts', f);
  if (tr !== undefined || M.transcriptOf(a.document)) same(M.transcriptOf(a.document) ?? [], tr ?? []) ? pass('transcript') : note('transcript', id);
  const md = read('models', f);
  if (md !== undefined || M.modelOf(a.document)) same(M.modelOf(a.document), md ?? null) ? pass('model') : note('model', id, md === undefined ? 'not in the old copy' : 'differs');
  if (mocks.has(id)) {
    const want = mocks.get(id), got = M.mockEntry(a.test, a.document);
    const diff = Object.keys(want).filter((k) => k !== 'fresh' && k !== 'createdAt' && !same(want[k], got[k]));
    diff.length ? note('mock entry', id, diff.join(',')) : pass('mock entry');
  } else if (entries.has(id)) {
    const want = entries.get(id), got = M.listEntry(a.test, a.document);
    const keys = new Set([...Object.keys(want), ...Object.keys(got)]);
    const diff = [...keys].filter((k) => !PER_STUDENT.has(k) && !same(want[k] ?? null, got[k] ?? null));
    diff.length ? diff.forEach((k) => note('entry.' + k, id, `${JSON.stringify(want[k])?.slice(0, 90)} ≠ ${JSON.stringify(got[k])?.slice(0, 90)}`)) : pass('entry');
  }
}
console.log('match:', ok);
for (const [k, v] of Object.entries(bad)) console.log(`DIFFERS ${k}: ${v.length}`, v.slice(0, 3));
