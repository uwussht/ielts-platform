// Builds content/programmes.json from the admin export in content/source/programmes/<key>.json
// (the curriculum ai-tutor runs: weeks, titles in ru/kk/en, items, checkpoints, length by mode).
//   node scripts/build-programmes.js
// The conversion itself is shared with the sync from the admin bank (server/src/sync-map.js).
const fs = require('fs');
const path = require('path');
const { programmesOf } = require('../server/src/sync-map');

const DIR = path.join(__dirname, '..', 'content');
const SRC = path.join(DIR, 'source', 'programmes');
const OUT = path.join(DIR, 'programmes.json');

const views = fs.readdirSync(SRC).map((f) => JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8')));
const { programmes } = programmesOf(views);
fs.writeFileSync(OUT, JSON.stringify({ programmes }, null, 1) + '\n');
console.log(programmes.map((p) => `${p.id}: ${p.weeks} weeks, ${p.weekList.reduce((s, w) => s + w.sessions.flat().length, 0)} tasks`).join('\n'));
