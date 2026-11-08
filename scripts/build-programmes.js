// Builds content/programmes.json from content/programmes.src.txt (format described there).
//   node scripts/build-programmes.js
// Each task gets the shape the plan screens already use: { sec, kind, sub, n, minutes }.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'content');
const SRC = path.join(DIR, 'programmes.src.txt');
const OUT = path.join(DIR, 'programmes.json');

// kind → section and minutes per unit
const KINDS = {
  demo: ['reading', 8], type: ['reading', 15], mini: ['reading', 15], drill: ['reading', 12], pm: ['reading', 20], full: ['reading', 60], weak: ['reading', 15],
  guide: ['writing', 10], ideas: ['writing', 15], t1: ['writing', 25], t2: ['writing', 50], pair: ['writing', 75],
  sg: ['speaking', 10], p1: ['speaking', 10], p2: ['speaking', 15], sh: ['speaking', 10], run: ['speaking', 15],
  vocab: ['vocab', 20], dc: ['listening', 10], spl: ['listening', 8], fmt: ['listening', 10],
};
// short question-type names in the source → the type ids used across the app
const TYPES = {
  tfng: 'tfng', ynng: 'ynng', mc: 'multiple_choice', headings: 'matching_headings', info: 'matching_information', features: 'matching_features',
  endings: 'matching_sentence_endings', sentence: 'sentence_completion', summary: 'summary_completion', note: 'note_table_flow_chart',
  diagram: 'diagram_label', short: 'short_answer',
};
const MODES = ['self', '2x30', '3x30', '2x60', '3x60'];
const MILESTONES = /^(monthTest|midMock|finalMock|control\.(reading|writing|speaking|listening))$/;

const fail = (no, msg) => { throw new Error(`programmes.src.txt:${no}: ${msg}`); };

function task(spec, no) {
  const m = /^(\w+)(?:\s+([\w.-]+))?(?:\s*\*(\d+))?$/.exec(spec.trim());
  if (!m) fail(no, `bad task "${spec}"`);
  const [, kind, arg, times] = m;
  if (!KINDS[kind]) fail(no, `unknown kind "${kind}"`);
  const [sec, unit] = KINDS[kind];
  let sub = arg || null, n = times ? +times : 1;
  if (kind === 'p1') { n = +arg; sub = null; if (!n) fail(no, 'p1 needs the number of topics'); }
  if (['demo', 'type', 'mini'].includes(kind)) { sub = TYPES[arg]; if (!sub) fail(no, `unknown question type "${arg}"`); }
  return { sec, kind, sub, n, minutes: unit * n };
}

const programmes = [];
let prog = null, week = null;
fs.readFileSync(SRC, 'utf8').split(/\r?\n/).forEach((raw, i) => {
  const no = i + 1, line = raw.trim();
  if (!line || line.startsWith('#')) return;
  if (line.startsWith('@')) {
    const [id, name, band, weeks, dur] = line.slice(1).split('|').map((s) => s.trim());
    const d = dur ? dur.split(',').map((x) => +x.trim()) : null;
    if (d && d.length !== MODES.length) fail(no, 'durations need 5 numbers');
    prog = { id, name, band: band || null, weeks: +weeks, durations: d && Object.fromEntries(MODES.map((k, j) => [k, d[j]])), weekList: [] };
    programmes.push(prog);
    return;
  }
  if (!prog) fail(no, 'task before a programme');
  if (line.startsWith('=')) {
    const [n, month, title, milestone] = line.slice(1).split('|').map((s) => s.trim());
    if (milestone && !MILESTONES.test(milestone)) fail(no, `unknown milestone "${milestone}"`);
    week = { n: +n, month: +month, themes: title.split(' · ').map((s) => s.trim()), milestone: milestone || null, sessions: [] };
    prog.weekList.push(week);
    return;
  }
  if (!week) fail(no, 'task before a week');
  week.sessions.push(line.split(';').filter((s) => s.trim()).map((s) => task(s, no)));
});

for (const p of programmes) {
  if (p.weekList.length !== p.weeks) throw new Error(`${p.id}: ${p.weekList.length} weeks listed, header says ${p.weeks}`);
  p.weekList.forEach((w, i) => { if (w.n !== i + 1) throw new Error(`${p.id}: week ${w.n} out of order`); });
}
fs.writeFileSync(OUT, JSON.stringify({ programmes }, null, 1) + '\n');
console.log(programmes.map((p) => `${p.id}: ${p.weeks} weeks, ${p.weekList.reduce((s, w) => s + w.sessions.flat().length, 0)} tasks`).join('\n'));
