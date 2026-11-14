// Builds content/diagnostic.json from the admin panel's diagnostic forms (content/source/tests/DG-*.json).
//
// Only forms whose every Listening clip has a recording are used: a form without them would
// have the browser's voice read the transcript instead of real audio. Each clip gets the
// URL the site serves it from (/media/…), and its file is added to content/media.txt so the
// deploy's media service downloads it.
//
//   node scripts/build-diagnostic.js
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'content');
const SRC = path.join(ROOT, 'source', 'tests');
const MEDIA_HOST = 'https://files.justtostudy.kz/';
const MEDIA_DIR = 'production/ielts/media/';

const forms = [], skipped = [], files = new Set();
for (const f of fs.readdirSync(SRC).filter((x) => /^DG-.+\.json$/.test(x)).sort()) {
  const doc = JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8')).document;
  const clips = doc.listening.slots.flatMap((s) => s.clips);
  if (!clips.length || clips.some((c) => !c.audio?.src)) { skipped.push(doc.id); continue; }
  for (const c of clips) {
    c.audio.url = '/media/' + MEDIA_DIR + c.audio.src;
    files.add(MEDIA_HOST + MEDIA_DIR + c.audio.src);
  }
  forms.push(doc);
}
if (!forms.length) throw new Error('No diagnostic form has recordings for all its Listening clips.');

fs.writeFileSync(path.join(ROOT, 'diagnostic.json'), JSON.stringify({ forms }, null, 1) + '\n');

const listFile = path.join(ROOT, 'media.txt');
const raw = fs.readFileSync(listFile, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
const list = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
const added = [...files].filter((u) => !list.includes(u));
if (added.length) fs.writeFileSync(listFile, [...list, ...added].sort().join(eol) + eol);

console.log(`forms: ${forms.map((x) => x.id).join(', ')}` + (skipped.length ? ` (without recordings, left out: ${skipped.join(', ')})` : ''));
console.log(`recordings: ${files.size}, new in media.txt: ${added.length}`);
