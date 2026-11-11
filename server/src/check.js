/* ==========================================================================
   Answer checking against the test bank's keys (content/keys/<testId>.json,
   built by scripts/build-content.py). No dependencies: the site's server.js
   uses it for the per-question check, the API for whole attempts.

   Result of one item, the shape the app reads:
     { itemId, correct, spellingOnly, trap, reveal{answer, acceptable, explanation, quote, ...} }
   Dictation and spelling (DC-, SPL-) are checked word by word:
     { itemId, correct, words{units, extra, accuracy, ok, total}, reveal }
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

function create(contentDir) {
  const safeId = (id) => String(id).replace(/[^A-Za-z0-9._-]/g, '_');
  const KEYS = new Map();
  function keysOf(id) {
    if (!KEYS.has(id)) {
      let k = null;
      try { k = JSON.parse(fs.readFileSync(path.join(contentDir, 'keys', safeId(id) + '.json'), 'utf8')); } catch {}
      KEYS.set(id, k);
    }
    return KEYS.get(id);
  }

  const norm = (s) => String(s ?? '').toLowerCase().replace(/[‘’`]/g, "'").replace(/[“”]/g, '"').replace(/[.,!?;:"]/g, '').replace(/\s+/g, ' ').trim();
  // one letter wrong, swapped or missing in a word longer than 3 letters
  function nearMiss(a, b) {
    if (a.length < 4 || Math.abs(a.length - b.length) > 1) return false;
    let i = 0, j = 0, edits = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
    }
    return edits + (a.length - i) + (b.length - j) <= 1;
  }
  function words(answer, given) {
    const want = norm(answer).split(' ').filter(Boolean), got = norm(given).split(' ').filter(Boolean);
    const units = want.map((w, i) => ({ text: w, given: got[i], status: got[i] === w ? 'ok' : got[i] && nearMiss(w, got[i]) ? 'spelling' : got[i] ? 'wrong' : 'missing' }));
    const ok = units.filter((u) => u.status === 'ok').length;
    return { units, extra: got.slice(want.length), accuracy: want.length ? ok / want.length : 0, ok, total: want.length };
  }
  const isWords = (testId) => /^(DC|SPL)-/.test(testId);

  function checkItem(testId, itemId, given) {
    const keys = keysOf(testId);
    const k = keys?.[itemId];
    if (!k) return null;
    const reveal = { answer: k.answer, acceptable: k.acceptable, explanation: k.explanation, quote: k.quote, textAnchor: k.textAnchor, spoken: k.spoken, line: k.line, audioStart: k.audioStart, audioEnd: k.audioEnd };
    if (isWords(testId)) {
      const best = [...(k.answer || []), ...(k.acceptable || [])].map((a) => words(a, given)).sort((a, b) => b.accuracy - a.accuracy)[0] || words('', given);
      return { itemId, correct: best.ok === best.total && !best.extra.length, words: best, reveal: { ...reveal, spoken: k.spoken || k.answer?.[0] } };
    }
    const ok = [...(k.answer || []), ...(k.acceptable || [])].map(norm);
    const list = (Array.isArray(given) ? given : [given]).map(norm).filter(Boolean);
    let correct = list.some((g) => ok.includes(g));
    // "choose two": either order counts, so a letter from the other item of the pair is right too
    if (!correct && k.pairGroup != null) {
      const other = Object.entries(keys).filter(([id, x]) => id !== itemId && x.pairGroup === k.pairGroup).flatMap(([, x]) => (x.answer || []).map(norm));
      correct = list.some((g) => other.includes(g));
    }
    const spellingOnly = !correct && list.some((g) => ok.some((a) => nearMiss(a, g)));
    return { itemId, correct, spellingOnly, trap: correct ? null : k.trap || null, reveal };
  }

  return { keysOf, checkItem, isWords, safeId, norm };
}

module.exports = { create };
