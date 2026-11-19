/* ==========================================================================
   How a test from the admin bank (GET /admin/ielts/tests/<id>: { test, document,
   mediaUrls }) becomes the platform's files (content/):
     tests/<id>.json        what students get: no answers, no transcripts, no model
                            answers; each picture and recording has its url on the file host
     keys/<id>.json         the answers, read only by the server to check them
     transcripts/<id>.json  Listening scripts, shown after a test
     models/<id>.json       a Writing model answer
     index.json             the entry in the list of its skill (or in the mocks)
   Checked against the 917 tests copied on 2026-11-08 (scripts/check-sync-map.js).
   ========================================================================== */
'use strict';

// students' documents point at the production file host; the site serves the files as /media/
const MEDIA_URL = 'https://files.justtostudy.kz/production/ielts/media/';
// item fields that hold an answer or its explanation
const KEY_FIELDS = ['answer', 'acceptable', 'explanation', 'quote', 'trap', 'keywords', 'textAnchor', 'spoken', 'targetBand', 'line', 'audioStart', 'audioEnd', 'pairGroup'];
// list fields copied as they are from the admin entry
const META_FIELDS = ['id', 'kind', 'module', 'category', 'role', 'title', 'difficulty', 'words', 'timeLimitSec', 'questionCount', 'maxScore'];
// a drill's own fields, listed with it
const DRILL_FIELDS = ['drillKey', 'part', 'types', 'name', 'band', 'minutes', 'aiCheck'];
const LIST_SKILLS = ['reading', 'listening', 'writing', 'speaking', 'vocab'];

const groupsOf = (d) => [...(d?.parts || []).flatMap((p) => p.groups || []), ...(d?.groups || [])];
const itemsOf = (d) => groupsOf(d).flatMap((g) => g.items || []);

/** The document as students get it. */
function studentDoc(document) {
  const d = structuredClone(document);
  delete d.source; delete d.model; delete d.walkthrough;
  for (const p of d.parts || []) delete p.transcript;
  if (Array.isArray(d.questions)) for (const q of d.questions) if (q && typeof q === 'object') delete q.model;
  for (const it of itemsOf(d)) for (const f of KEY_FIELDS) delete it[f];
  (function link(x) {
    if (Array.isArray(x)) return x.forEach(link);
    if (!x || typeof x !== 'object') return;
    if (typeof x.src === 'string' && /^[\w.-]+$/.test(x.src) && !x.url) x.url = MEDIA_URL + x.src;
    Object.values(x).forEach(link);
  })(d);
  return d;
}

/** { itemId: { answer, acceptable, … } }, or null for a test without answers. */
function keysOf(document) {
  const keys = {};
  for (const it of itemsOf(document)) {
    if (!('answer' in it)) continue;
    keys[it.id] = Object.fromEntries(KEY_FIELDS.filter((f) => f in it).map((f) => [f, it[f]]));
  }
  return Object.keys(keys).length ? keys : null;
}

/** Listening scripts by part, or null. */
function transcriptOf(document) {
  const parts = (document.parts || []).filter((p) => p.transcript != null);
  return parts.length ? parts.map((p) => ({ id: p.id, number: p.number, transcript: p.transcript })) : null;
}

/** A Writing model answer, or null. */
const modelOf = (document) => (document.kind === 'task1' || document.kind === 'task2') && document.model ? document.model : null;

const firstText = (v) => (typeof v === 'string' ? v : Array.isArray(v) ? v.map(firstText).find(Boolean) : v && typeof v === 'object' ? firstText(v.en ?? v.text ?? Object.values(v)) : '');
function excerptOf(document) {
  const q = String(firstText(document.question) || '').replace(/\s+/g, ' ').trim();
  if (!q) return null;
  if (q.length <= 140) return q;
  // 140 characters, or back to the last whole word
  const cut = q[140] === ' ' ? q.slice(0, 140) : q.slice(0, q.lastIndexOf(' ', 140));
  return cut.replace(/[\s.,;:]+$/, '') + '…';
}

/** The entry in its skill's list (index.json lists.<skill>), as the student API lists it. */
function listEntry(test, document) {
  const e = Object.fromEntries(META_FIELDS.map((f) => [f, test[f] ?? null]));
  if (e.words == null && typeof document.words === 'number') e.words = document.words;
  const d = test.difficulty;
  // a band range in the document: [min, max] or { min, max }
  const b = Array.isArray(document.band) ? { min: document.band[0], max: document.band[1] } : document.band && typeof document.band === 'object' ? document.band : null;
  Object.assign(e, {
    topic: document.topic ?? null,
    questionTypes: [...new Set(groupsOf(document).map((g) => g.type).filter(Boolean))],
    textTitles: (document.texts || []).map((x) => x.title).filter(Boolean),
    bandMin: d != null ? d - 0.5 : b?.min ?? null,
    bandMax: d != null ? d + 0.5 : b?.max ?? null,
    // the server works out the level from each student's own band; this is only the fallback
    level: d == null && !b ? 'any' : 'fit',
    imageUrl: null,
    createdAt: test.publishedAt || test.updatedAt || null,
  });
  if (test.skill === 'writing' && document.kind !== 'drill') e.excerpt = excerptOf(document);
  if (document.kind === 'drill') for (const f of DRILL_FIELDS) if (f in document) e[f] = document[f];
  return e;
}

/** The entry in index.json mocks. */
const mockEntry = (test, document) => ({ id: test.id, title: test.title, module: test.module, number: document.number ?? null, createdAt: test.publishedAt || test.updatedAt || null });

/* ------------------------------------------------------------ programmes */
// display order
const PROG_ORDER = ['P55', 'P65', 'P75', 'P85', 'P90', 'R', 'SS', 'SLR', 'SW'];
// admin study-mode keys → ours
const MODES = { self_study: 'self', '2x30': '2x30', '3x30': '3x30', '2x60': '2x60', '3x60': '3x60' };
// checkpoint kinds → week milestones
const MILESTONE = { month: 'monthTest', mid: 'midMock', final: 'finalMock', reading: 'control.reading', writing: 'control.writing', speaking: 'control.speaking', listening: 'control.listening' };
const BAND = { P55: '5.5', P65: '6.0–6.5', P75: '7.0–7.5', P85: '8.0–8.5', P90: '9.0' };

/** content/programmes.json from the admin's programme views (GET /admin/ielts/programmes/view/<key>).
 *  Each task keeps the shape the plan screens use: { sec, kind, sub, n, minutes }; a week's tasks
 *  are grouped by lesson (extra.lesson), as on the site. */
function programmesOf(views) {
  const list = [...views].sort((a, b) => (PROG_ORDER.indexOf(a.key) + 1 || 99) - (PROG_ORDER.indexOf(b.key) + 1 || 99));
  const programmes = list.map((p) => {
    const cps = Object.fromEntries((p.checkpoints || []).map((c) => [c.week, MILESTONE[c.kind] || null]));
    const durations = p.calendarWeeks ? Object.fromEntries(Object.entries(MODES).map(([a, b]) => [b, p.calendarWeeks[a] ?? p.programmeWeeks])) : null;
    const weekList = p.weeks.map((w) => {
      const byLesson = new Map();
      for (const it of w.items) {
        const l = it.extra?.lesson ?? 0;
        if (!byLesson.has(l)) byLesson.set(l, []);
        byLesson.get(l).push({ sec: it.sec, kind: it.kind, sub: it.sub ?? null, n: it.n, minutes: it.min, ...(it.extra && Object.keys(it.extra).length ? { extra: it.extra } : {}) });
      }
      return { n: w.n, month: w.month, title: w.title, milestone: cps[w.n] || null, sessions: [...byLesson.values()] };
    });
    return { id: p.key, name: p.name, version: p.version, band: BAND[p.key] || null, weeks: p.programmeWeeks, durations, weekList };
  });
  return { programmes };
}

/** Media file names a test uses (to download what is new). */
const mediaOf = (admin) => Object.keys(admin.mediaUrls || {});

module.exports = { MEDIA_URL, KEY_FIELDS, LIST_SKILLS, studentDoc, keysOf, transcriptOf, modelOf, listEntry, mockEntry, mediaOf, groupsOf, programmesOf };
