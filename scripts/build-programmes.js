// Builds content/programmes.json from the admin export in content/source/programmes/<key>.json
// (the curriculum ai-tutor runs: weeks, titles in ru/kk/en, items, checkpoints, length by mode).
//   node scripts/build-programmes.js
// Each task keeps the shape the plan screens use: { sec, kind, sub, n, minutes }; a week's tasks are
// grouped by lesson (extra.lesson), as on the site.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'content');
const SRC = path.join(DIR, 'source', 'programmes');
const OUT = path.join(DIR, 'programmes.json');
// display order
const ORDER = ['P55', 'P65', 'P75', 'P85', 'P90', 'R', 'SS', 'SLR', 'SW'];
// admin study-mode keys → ours
const MODES = { self_study: 'self', '2x30': '2x30', '3x30': '3x30', '2x60': '2x60', '3x60': '3x60' };
// checkpoint kinds → week milestones
const MILESTONE = { month: 'monthTest', mid: 'midMock', final: 'finalMock', reading: 'control.reading', writing: 'control.writing', speaking: 'control.speaking', listening: 'control.listening' };
const BAND = { P55: '5.5', P65: '6.0–6.5', P75: '7.0–7.5', P85: '8.0–8.5', P90: '9.0' };

const keys = fs.readdirSync(SRC).map((f) => f.replace(/\.json$/, ''));
keys.sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));
const programmes = keys.map((key) => {
  const p = JSON.parse(fs.readFileSync(path.join(SRC, key + '.json'), 'utf8'));
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
fs.writeFileSync(OUT, JSON.stringify({ programmes }, null, 1) + '\n');
console.log(programmes.map((p) => `${p.id}: ${p.weeks} weeks, ${p.weekList.reduce((s, w) => s + w.sessions.flat().length, 0)} tasks`).join('\n'));
