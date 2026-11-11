/* ==========================================================================
   The test bank as the API sees it: content/index.json (lists by skill and
   the mocks), content/tests/<id>.json (documents) and content/keys/<id>.json
   (answer keys). CONTENT_DIR points at the folder (the Docker image copies it
   to /app/content; in the repository it is ../../content).
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const DIR = process.env.CONTENT_DIR || path.join(__dirname, '..', '..', 'content');
const check = require('./check').create(DIR);
// media URLs inside documents point at the original file host; the site serves them under /media/
const MEDIA_HOST = 'https://files.justtostudy.kz/';
const SKILLS = ['reading', 'listening', 'writing', 'speaking', 'vocab'];

let INDEX = null;
let META = null;
function index() {
  if (!INDEX) {
    INDEX = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));
    META = new Map();
    for (const skill of SKILLS) for (const m of INDEX.lists[skill] || []) META.set(m.id, { ...m, skill });
    for (const m of INDEX.mocks || []) META.set(m.id, { ...m, skill: 'mock', kind: 'mock' });
  }
  return INDEX;
}
/** List entry of a test, with its skill. */
function meta(id) { index(); return META.get(id) || null; }
function list(skill) { return index().lists[skill] || []; }
function mocks() { return index().mocks || []; }

const DOCS = new Map();
/** { test, document } as the app reads it, media on /media/. */
function doc(id) {
  if (!DOCS.has(id)) {
    let d = null;
    try { d = JSON.parse(fs.readFileSync(path.join(DIR, 'tests', check.safeId(id) + '.json'), 'utf8').split(MEDIA_HOST).join('/media/')); } catch {}
    if (DOCS.size > 300) DOCS.delete(DOCS.keys().next().value);
    DOCS.set(id, d);
  }
  const d = DOCS.get(id);
  return d && structuredClone(d);
}

const groupsOf = (d) => (d?.parts ? d.parts.flatMap((p) => p.groups || []) : d?.groups || []);
const itemsOf = (d) => groupsOf(d).flatMap((g) => (g.items || []).map((it) => ({ ...it, groupType: g.type })));

/** The document with each item's key merged in (for the review after a test). */
function withKeys(document, testId) {
  const keys = check.keysOf(testId) || {};
  for (const g of groupsOf(document)) for (const it of g.items || []) Object.assign(it, keys[it.id] || {});
  return document;
}

/* Official conversion tables (correct answers out of 40 → band). */
const LISTENING = [[39, 9], [37, 8.5], [35, 8], [32, 7.5], [30, 7], [26, 6.5], [23, 6], [18, 5.5], [16, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5], [0, 0]];
const READING_AC = [[39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5], [23, 6], [19, 5.5], [15, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5], [0, 0]];
const READING_GT = [[40, 9], [39, 8.5], [37, 8], [36, 7.5], [34, 7], [32, 6.5], [30, 6], [27, 5.5], [23, 5], [19, 4.5], [15, 4], [12, 3.5], [9, 3], [6, 2.5], [0, 0]];
/** A band for a reading or listening result; shorter tests are scaled to 40 questions. */
function bandOf(skill, module, raw, max) {
  if (!max || max < 10 || !['reading', 'listening'].includes(skill)) return null;
  const table = skill === 'listening' ? LISTENING : module === 'general' ? READING_GT : READING_AC;
  const n = Math.round((raw / max) * 40);
  return table.find(([min]) => n >= min)[1];
}

/** Checks every question of a test. */
function grade(testId, answers = {}) {
  const d = doc(testId);
  if (!d) return null;
  const m = meta(testId) || {};
  const items = itemsOf(d.document).map((it) => {
    const given = answers[it.id] ?? '';
    const r = check.checkItem(testId, it.id, given) || { itemId: it.id, correct: false, reveal: null };
    return { ...r, type: it.type || it.groupType || null, given };
  });
  const byWords = items.filter((x) => x.words);
  const raw = byWords.length ? byWords.reduce((s, x) => s + x.words.ok, 0) : items.filter((x) => x.correct).length;
  const max = byWords.length ? byWords.reduce((s, x) => s + x.words.total, 0) : items.length;
  const skill = m.skill || d.document.skill || 'reading';
  const module = m.module || d.document.module || 'academic';
  return { skill, kind: m.kind || d.document.kind || null, title: m.title || d.document.title || testId, module,
    items, raw, max, band: byWords.length ? null : bandOf(skill, module, raw, max) };
}

module.exports = { DIR, check, index, meta, list, mocks, doc, itemsOf, groupsOf, withKeys, grade, bandOf };
