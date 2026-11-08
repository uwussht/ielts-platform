// Demo fixtures — anonymised copies of real ai-tutor response shapes, dates relative to today.
(function () {
  const iso = (d) => d.toISOString().slice(0, 10);
  const now = new Date(); now.setUTCHours(0, 0, 0, 0);
  const TODAY = iso(now);
  const add = (n) => { const d = new Date(now); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  // programme started on a Monday two weeks + a few days ago → current calendar week 3
  const dow = (now.getUTCDay() + 6) % 7;
  const START = add(-14 - dow);
  const WEEKS = 16;
  const day = (w, i) => { const d = new Date(START + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + (w - 1) * 7 + i); return iso(d); };

  const PATTERN = [
    [{ sec: 'reading', kind: 'type', sub: 'tfng', n: 1, minutes: 15 }, { sec: 'vocab', kind: 'vocab', sub: 'awl-1', n: 20, minutes: 10 }],
    [{ sec: 'listening', kind: 'listen', sub: 'form', n: 1, minutes: 15 }, { sec: 'writing', kind: 'guide', sub: 't2.opinion', n: 1, minutes: 10 }],
    [{ sec: 'speaking', kind: 'p1', sub: 'hometown', n: 1, minutes: 10 }, { sec: 'reading', kind: 'drill', sub: 'scan', n: 1, minutes: 10 }],
    [{ sec: 'writing', kind: 't2', sub: 'opinion', n: 1, minutes: 40 }],
    [{ sec: 'listening', kind: 'dc', sub: 'numbers', n: 1, minutes: 10 }, { sec: 'speaking', kind: 'p2', sub: 'person', n: 1, minutes: 15 }],
  ];
  let id = 1000;
  const tasks = [];
  for (let w = 1; w <= WEEKS; w++) {
    PATTERN.forEach((list, i) => {
      const date = day(w, i);
      list.forEach((x) => {
        const past = date < TODAY, isToday = date === TODAY;
        const done = past && !(w === 3 && i === dow - 1 && x.sec === 'writing') && !(w === 3 && x.kind === 'drill');
        tasks.push({ id: ++id, key: `w${w}d${i}${x.kind}`, date, movedFrom: null, programmeWeek: w, calendarWeek: w, ...x, got: done ? x.n : 0,
          origin: 'programme', control: null, mode: 'self_study', extra: {}, completionRule: x.sec === 'vocab' ? 'self_report' : 'auto',
          status: done ? 'completed' : isToday && x.sec === 'reading' ? 'in_progress' : 'planned', overdue: past && !done });
      });
    });
    tasks.push({ id: ++id, key: `w${w}ctl`, date: day(w, 5), programmeWeek: w, calendarWeek: w, sec: 'control', kind: 'checkpoint', sub: null, n: 1, got: 0, minutes: 30,
      origin: 'weekly_control', control: 'weekly', mode: 'self_study', extra: { weekStart: day(w, 0), weekEnd: day(w, 6) }, completionRule: 'auto',
      status: day(w, 5) < TODAY ? 'completed' : 'planned', overdue: false });
  }
  // a teacher homework task today
  tasks.push({ id: ++id, key: 'hw1', date: TODAY, programmeWeek: 3, calendarWeek: 3, sec: 'writing', kind: 't1', sub: 'line', n: 1, got: 0, minutes: 25, origin: 'teacher', control: null,
    mode: 'homework', extra: { title: 'Task 1: line graph', note: 'Обрати внимание на overview во втором абзаце.', dueDate: add(2), createdByName: 'Айгерим' }, completionRule: 'auto', status: 'planned', overdue: false });

  const done = tasks.filter((x) => x.status === 'completed').length;
  const enrollment = { status: 'active', studyMode: 'self_study', lessonFormat: null, programmeKey: 'start-core',
    programmeNames: ['IELTS Start', 'IELTS Core 6.5', 'IELTS Sprint 7.0'], programmeName: 'IELTS Start → IELTS Core 6.5 → IELTS Sprint 7.0',
    stages: [], startBand: 4.5, targetBand: 7, startDate: START, endDate: day(WEEKS, 6), calendarWeeks: WEEKS, programmeWeeks: WEEKS };
  const weekOf = (w) => tasks.filter((x) => x.calendarWeek === w);
  const todays = tasks.filter((x) => x.date === TODAY || (x.overdue && x.calendarWeek === 3));
  const programme = { enrollment, deadline: { state: 'none', daysRemaining: null }, tasks: todays.filter((x) => x.origin !== 'weekly_control'),
    recommended: [], weeklyControl: weekOf(3).find((x) => x.origin === 'weekly_control'), currentWeek: 3 };

  const dashboard = {
    xp: 1240, xpToday: 40, level: 4, levelXp: 240, levelSize: 400, streak: { current: 5, best: 9 }, targetBand: 7, examDate: null,
    bands: { listening: 5.5, reading: 5, writing: 5, speaking: 5.5 }, overall: 5.5, dynamics: 0.5, forecast: 6.5, forecastPoints: [],
    journey: { baseline: { score: 4.5, source: 'diagnostic', preliminary: false, estimate: false, attemptId: 1, date: START }, checking: false,
      current: { score: 5.5, source: 'sections', attemptId: 2, date: add(-2), sections: 4, estimate: false }, target: 7, gap: 1.5 },
    growthZone: { skill: 'reading', kind: 'type', key: 'tfng', correct: 3, total: 7, band: 5, evidenceAttemptId: 3, testKind: 'types' },
    programme, plan: { date: TODAY, tasks: [], budget: 45, reduced: false, doneMinutes: 15 }, roadmap: null,
  };
  const planRes = { today: TODAY, currentWeek: 3, completion: { done, total: tasks.length, percent: Math.round((done / tasks.length) * 100) },
    recommended: [], enrollment, tasks,
    weekTitles: Object.fromEntries(Array.from({ length: WEEKS }, (_, i) => [i + 1, { ru: ['Основы формата', 'Скорость чтения', 'Структура эссе', 'Беглость речи'][i % 4], en: ['Format basics', 'Reading speed', 'Essay structure', 'Fluency'][i % 4] }])) };

  const profile = { track: 'academic', targetBand: 7, examDate: null, bands: { overall: 5.5 }, onboarded: true, diagnosticDone: true, route: 'self' };
  const me = { ieltsAccount: true, purchased: true, access: true, studyMode: 'self_study', track: 'academic', programmeName: enrollment.programmeName, onboarded: true, diagnosticDone: true };

  function markDone({ m, body, mem }) {
    const t = tasks.find((x) => x.id === Number(m[1]));
    if (t) { t.status = body?.done ? 'completed' : 'planned'; t.got = body?.done ? t.n : 0; }
    return { ok: true };
  }
  function move({ m, body }) {
    const t = tasks.find((x) => x.id === Number(m[1]));
    if (t && body?.date) { t.movedFrom = t.date; t.date = body.date; }
    return { ok: true };
  }

  // ---------- test catalogs (same shape as GET /mobile/ielts/tests?skill=) ----------
  const LEVELS = ['fit', 'fit', 'above', 'fit', 'below'];
  let seq = 0;
  function item(o) {
    const i = seq++, lv = o.level || LEVELS[i % LEVELS.length];
    const b = lv === 'above' ? 6.5 : lv === 'below' ? 4 : 5.5;
    const tried = o.attemptCount ?? (i % 7 === 0 ? 1 : 0);
    return { module: 'both', category: null, role: null, difficulty: 5, words: null, timeLimitSec: null, questionCount: 6, maxScore: 6, topic: null, questionTypes: [], textTitles: [],
      lastAttempt: tried ? { id: 9000 + i, mode: 'practice', rawScore: 4, maxScore: 6, band: 5.5, finishedAt: add(-3) + 'T10:00:00', status: 'done' } : null, bestAttempt: null,
      attemptCount: tried, bandMin: o.noBand ? null : b - 0.5, bandMax: o.noBand ? null : b + 0.5, level: lv, studentBand: 5, imageUrl: null, createdAt: add(-20 + (i % 15)) + 'T09:00:00', ...o };
  }
  const TOPICS = ['Urban trees', 'Ocean currents', 'Early aviation', 'Sleep and memory', 'Coffee trade', 'Desert farming', 'Language learning', 'Bridge design'];
  const READING = [
    ...RLTYPES().flatMap((cat) => [item({ id: `TY-${cat}-demo`, kind: 'types', category: cat, role: 'demo', module: 'academic', title: `${cat} — demo`, attemptCount: 1 }),
      ...[1, 2, 3].map((n) => item({ id: `TY-${cat}-${n}`, kind: 'types', category: cat, role: 'practice', module: 'academic', title: `${cat} — practice ${n}` })),
      item({ id: `TY-${cat}-mini`, kind: 'types', category: cat, role: 'mini', module: 'academic', title: `${cat} — mini` })]),
    ...['skimming', 'scanning', 'ng', 'paraphrase', 'headings', 'keyword', 'timing'].flatMap((c) => [1, 2, 3].map((n) => item({ id: `DR-${c}-${n}`, kind: 'drill', category: c, module: 'academic', title: `${c} ${n}`, questionCount: 4 }))),
    ...[1, 2, 3].map((n) => item({ id: `DR-gt-${n}`, kind: 'drill', category: 'gt', module: 'general', title: `GT ${n}` })),
    ...TOPICS.slice(0, 6).map((tp, n) => item({ id: `RD-AC-P${n + 1}`, kind: 'passage', category: 'passage', module: 'academic', title: tp, questionCount: 13, maxScore: 13, words: 850 })),
    ...TOPICS.slice(0, 3).map((tp, n) => item({ id: `RD-GT-S${n + 1}`, kind: 'section', category: 'passage', module: 'general', title: tp + ' (GT)', questionCount: 13, maxScore: 13 })),
    ...[1, 2, 3].map((n) => item({ id: `RT-AC-${n}`, kind: 'test', category: 'full', module: 'academic', title: `Academic Reading Test ${n}`, timeLimitSec: 3600, questionCount: 40, maxScore: 40, level: 'fit' })),
    ...[1, 2].map((n) => item({ id: `RT-GT-${n}`, kind: 'test', category: 'full', module: 'general', title: `General Reading Test ${n}`, timeLimitSec: 3600, questionCount: 40, maxScore: 40, level: 'fit' })),
  ];
  function RLTYPES() { return ['tfng', 'ynng', 'multiple_choice', 'matching_headings', 'matching_information', 'sentence_completion', 'summary_completion', 'note_table_flow_chart', 'short_answer']; }
  const LISTENING = [
    ...[1, 2, 3, 4].flatMap((p) => [1, 2, 3].map((n) => item({ id: `LP-${p}-${n}`, kind: 'part', category: 'part' + p, title: ['Booking a holiday', 'Museum tour', 'Group project', 'Lecture on bees'][p - 1] + ' ' + n, questionCount: 10, maxScore: 10 }))),
    ...[1, 2, 3].map((n) => item({ id: `LT-${n}`, kind: 'test', title: `Listening Test ${n}`, questionCount: 40, maxScore: 40, level: 'fit' })),
    ...['Joining a sports centre', 'Renting a flat', 'A library card'].map((tp, n) => item({ id: `DC-0${n + 1}`, kind: 'dictation', title: tp, noBand: true, level: 'any' })),
    ...['Street names', 'Phone numbers', 'Dates and prices'].map((tp, n) => item({ id: `SP-0${n + 1}`, kind: 'spelling', title: tp, noBand: true, level: 'any' })),
  ];
  const WRITING = [
    ...['line', 'bar', 'pie', 'table', 'process', 'map'].flatMap((c) => [1, 2].map((n) => item({ id: `W1-AC-${c}-${n}`, kind: 'task1', category: c, module: 'academic', title: `${c[0].toUpperCase() + c.slice(1)} chart ${n}`, timeLimitSec: 1200 }))),
    ...['formal', 'semi_formal', 'informal'].flatMap((c) => [1, 2].map((n) => item({ id: `W1-GT-${c}-${n}`, kind: 'task1', category: c, module: 'general', title: `${c.replace('_', '-')} letter ${n}`, timeLimitSec: 1200 }))),
    ...['opinion', 'discussion', 'problem_solution', 'adv_disadv', 'two_part'].flatMap((c) => [1, 2].map((n) => item({ id: `W2-${c}-${n}`, kind: 'task2', category: c, title: ['Remote work', 'City cars', 'Online learning', 'Tourism', 'Public art'][n % 5] + ` (${c.replace('_', ' ')})`, timeLimitSec: 2400 }))),
  ];
  const SPEAKING = [
    ...['hometown', 'music', 'work_study', 'food', 'sport', 'travel'].map((c) => item({ id: `S1-${c}`, kind: 'part1', category: c, topic: c, title: c.replace('_', ' / ').replace(/^./, (x) => x.toUpperCase()) })),
    ...['person', 'experience', 'place', 'object', 'event', 'habit'].map((c) => item({ id: `S2-${c}`, kind: 'part2', category: c, topic: c, title: `Describe a ${c}` })),
    ...['education', 'technology', 'environment', 'work', 'travel', 'society'].map((c) => item({ id: `S3-${c}`, kind: 'part3', category: c, topic: c, title: c.replace(/^./, (x) => x.toUpperCase()) })),
    ...['daily_routine', 'commute', 'weekends'].map((c) => item({ id: `SH-${c}`, kind: 'shadowing', category: c, topic: c, title: c.replace('_', ' ').replace(/^./, (x) => x.toUpperCase()), noBand: true, level: 'any' })),
  ];
  const CATALOG = { reading: READING, listening: LISTENING, writing: WRITING, speaking: SPEAKING };

  // ---------- progress (GET /mobile/ielts/progress) ----------
  const T = (d, h = 10) => add(d) + `T${String(h).padStart(2, '0')}:00:00`;
  const progress = {
    completion: { done, total: tasks.length, percent: Math.round((done / tasks.length) * 100) },
    skills: {
      listening: { source: 'full', date: add(-4), band: 5.5, delta: 1, checking: false },
      reading: { source: 'full', date: add(-6), band: 5, delta: 0.5, checking: false },
      writing: { source: 'work', date: add(-2), band: 5, delta: 0, checking: false },
      speaking: { source: 'diagnostic', date: START, band: 5.5, estimate: true, delta: null, checking: false },
    },
    series: [
      { date: START, overall: 4.5, source: 'diagnostic', skill: 'diagnostic' },
      { date: add(-12), overall: 5, source: 'full', skill: 'reading' },
      { date: add(-6), overall: 5, source: 'full', skill: 'reading' },
      { date: add(-4), overall: 5.5, source: 'full', skill: 'listening' },
    ],
    errors: [
      { kind: 'trap', key: 'NG_vs_False', skill: 'reading', count: 6 },
      { kind: 'trap', key: 'spelling', skill: 'listening', count: 4 },
      { kind: 'criterion', key: 'grammaticalRange', skill: 'writing', band: 5, count: 2 },
    ],
    recent: [
      { id: 501, title: 'Remote work (opinion)', skill: 'writing', source: 'work', finishedAt: T(-2), band: 5, status: 'done' },
      { id: 502, title: 'Listening Test 1', skill: 'listening', source: 'full', finishedAt: T(-4), band: 5.5, status: 'done' },
      { id: 503, title: 'Describe a person', skill: 'speaking', source: 'work', finishedAt: T(-5), band: null, status: 'pending_ai' },
      { id: 504, title: 'Academic Reading Test 1', skill: 'reading', source: 'full', finishedAt: T(-6), band: 5, status: 'done' },
      ...Array.from({ length: 16 }, (_, i) => ({ id: 600 + i, title: `tfng — practice ${(i % 3) + 1}`, skill: i % 2 ? 'listening' : 'reading', source: 'partial', finishedAt: T(-7 - i), band: null, status: 'done' })),
      { id: 1, title: 'Диагностика', skill: 'diagnostic', source: 'diagnostic', finishedAt: START + 'T09:00:00', band: 4.5, status: 'done' },
    ],
  };

  // ---------- mocks (GET /mobile/ielts/mocks?module=) ----------
  const mocksRes = (module) => {
    const P = module === 'general' ? 'GT' : 'AC';
    return {
      mocks: [1, 2, 3, 4].map((n) => ({ id: `MOCK-${P}-0${n}`, title: `Mock 0${n}`, module, number: n, createdAt: T(n === 4 ? -45 : -10 + n),
        fresh: n !== 4, status: n === 1 ? 'submitted' : n === 2 ? 'in_progress' : 'not_started', sessionId: n === 1 ? 71 : n === 2 ? 72 : null,
        sections: n === 1 ? { listening: 'done', reading: 'done', writing: 'done', speaking: 'checking' } : n === 2 ? { listening: 'done', reading: 'pending' } : {} })),
      history: [
        { id: 72, mockId: `MOCK-${P}-02`, title: 'Mock 02', module, status: 'in_progress', startedAt: T(-1), finishedAt: null, overall: null, partial: false, sections: [] },
        { id: 71, mockId: `MOCK-${P}-01`, title: 'Mock 01', module, status: 'submitted', startedAt: T(-8, 9), finishedAt: T(-8, 12), overall: 5.5, partial: false,
          sections: [{ name: 'listening', band: 5.5 }, { name: 'reading', band: 5 }, { name: 'writing', band: 5 }, { name: 'speaking', band: 6 }] },
      ],
      open: { id: 72, title: 'Mock 02' }, freshDays: 30,
    };
  };

  // ---------- test documents (original demo content) ----------
  const READ_DOC = {
    kind: 'passage', skill: 'reading', passage: 1, title: 'Bees on the rooftops',
    topic: { ru: 'О чём текст: почему горожане держат пчёл на крышах и что это даёт городу.', en: 'Why city dwellers keep bees on rooftops and what it means for the city.', kk: 'Қала тұрғындары неге шатырларда ара ұстайды.' },
    texts: [{ label: null, title: 'Bees on the rooftops', paragraphs: [
      { label: 'A', text: 'Twenty years ago, a beehive on an office roof would have been treated as a safety problem. Today several large cities publish guides that explain how to keep bees above a car park or a hotel kitchen, and the number of registered urban hives has grown every year since 2010.' },
      { label: 'B', text: 'The first reason is simple: city bees often produce more honey than country bees. Parks, gardens and street trees flower at different times, so food is available from early spring until late autumn, while farmland may offer a single crop that blooms for only a few weeks.' },
      { label: 'C', text: 'Not everyone is convinced. Ecologists point out that honeybees compete with wild bees for the same flowers, and in some districts there may simply be too many hives for the available plants. A study in one European capital found that wild bee numbers fell where hives were most crowded.' },
      { label: 'D', text: 'For this reason, newer schemes ask beekeepers to plant as well as to harvest. A company that installs a hive is expected to add flowering plants nearby, and some cities now limit the number of hives per square kilometre.' },
    ] }],
    groups: [
      { id: 'G1', type: 'matching_headings', range: [1, 2], instruction: 'Questions 1–2. Choose the correct heading for paragraphs B and C from the list below.',
        headings: [{ key: 'i', text: 'A longer season for food' }, { key: 'ii', text: 'Rules for new hives' }, { key: 'iii', text: 'A cost to wild insects' }, { key: 'iv', text: 'Honey prices in cities' }],
        items: [{ id: 'Q1', prompt: 'Paragraph B' }, { id: 'Q2', prompt: 'Paragraph C' }] },
      { id: 'G2', type: 'tfng', range: [3, 5], instruction: 'Questions 3–5. Do the following statements agree with the information given in the text?',
        items: [{ id: 'Q3', prompt: 'The number of registered urban hives has risen every year since 2010.' }, { id: 'Q4', prompt: 'City honey usually sells for a higher price than country honey.' }, { id: 'Q5', prompt: 'Farmland always provides food for bees for a longer period than cities.' }] },
      { id: 'G3', type: 'summary_completion', range: [6, 7], title: 'New rules', summary: 'Newer schemes ask beekeepers to 6 ____ as well as to harvest, and some cities limit the number of hives per square 7 ____.', instruction: 'Questions 6–7. Complete the summary. Choose ONE WORD ONLY from the text.',
        items: [{ id: 'Q6', prompt: 'beekeepers are asked to 6 ____ as well as to harvest' }, { id: 'Q7', prompt: 'a limit on hives per square 7 ____' }] },
      { id: 'G4', type: 'multiple_choice_single', range: [8, 8], instruction: 'Question 8. Choose the correct letter, A, B or C.',
        items: [{ id: 'Q8', prompt: 'What did the study in a European capital find?', options: [{ key: 'A', text: 'Wild bees produced more honey than honeybees.' }, { key: 'B', text: 'Wild bees declined where hives were crowded.' }, { key: 'C', text: 'Hotels kept the largest number of hives.' }] }] },
    ],
  };
  const READ_KEY = {
    Q1: { answer: ['i'], quote: 'food is available from early spring until late autumn', textAnchor: { paragraph: 'B' }, explanation: { ru: 'Абзац B объясняет, что в городе цветение длится дольше — пчёлы находят еду весь сезон.' } },
    Q2: { answer: ['iii'], quote: 'honeybees compete with wild bees', textAnchor: { paragraph: 'C' }, explanation: { ru: 'Абзац C — о вреде для диких пчёл: конкуренция за цветы.' } },
    Q3: { answer: ['TRUE'], quote: 'has grown every year since 2010', textAnchor: { paragraph: 'A' }, explanation: { ru: '«has grown every year since 2010» — прямой перефраз утверждения.' } },
    Q4: { answer: ['NOT GIVEN'], explanation: { ru: 'О ценах на мёд в тексте ничего не сказано.' }, trap: 'NG_vs_False' },
    Q5: { answer: ['FALSE'], quote: 'a single crop that blooms for only a few weeks', textAnchor: { paragraph: 'B' }, explanation: { ru: 'Текст говорит обратное: на полях цветение короче.' } },
    Q6: { answer: ['plant'], quote: 'ask beekeepers to plant as well as to harvest', textAnchor: { paragraph: 'D' }, explanation: { ru: 'Слово из текста: plant.' } },
    Q7: { answer: ['kilometre'], acceptable: ['kilometer'], quote: 'per square kilometre', textAnchor: { paragraph: 'D' }, explanation: { ru: 'per square kilometre.' } },
    Q8: { answer: ['B'], quote: 'wild bee numbers fell where hives were most crowded', textAnchor: { paragraph: 'C' }, explanation: { ru: 'Число диких пчёл упало там, где ульев было больше всего.' }, trap: 'distractor' },
  };
  const LISTEN_LINES = [
    { speaker: 'ANNA', text: 'Good morning, Riverside Sports Centre, Anna speaking. How can I help?' },
    { speaker: 'MARK', text: 'Hi, I would like to join the swimming club. My name is Mark Fenton, that is F-E-N-T-O-N.' },
    { speaker: 'ANNA', text: 'Thank you, Mark. And how old are you?' },
    { speaker: 'MARK', text: 'I am twenty-four.' },
    { speaker: 'ANNA', text: 'Lovely. Sessions are on Tuesday and Thursday evenings. Membership is thirty-two pounds a month.' },
    { speaker: 'MARK', text: 'Great. Do I need to bring anything?' },
    { speaker: 'ANNA', text: 'Just a towel. Goggles are provided, but we do ask everyone to wear a swimming cap.' },
  ];
  const LISTEN_DOC = {
    kind: 'part', skill: 'listening', title: 'Part 1: joining a swimming club',
    parts: [{ id: 'P1', number: 1, context: 'A man phones a sports centre to join a swimming club.', audio: { url: null, tts: true, durationSec: 40 }, voices: ['ANNA — receptionist (BrE, female)', 'MARK — caller (BrE, male)'], transcript: LISTEN_LINES,
      groups: [
        { id: 'LG1', type: 'form_completion', range: [1, 3], title: 'Riverside Sports Centre — membership form', instruction: 'Complete the form below. Write ONE WORD AND/OR A NUMBER for each answer.',
          items: [{ id: 'L1', prompt: 'Surname: ____' }, { id: 'L2', prompt: 'Age: ____' }, { id: 'L3', prompt: 'Monthly fee: £ ____' }] },
        { id: 'LG2', type: 'multiple_choice_single', range: [4, 5], instruction: 'Choose the correct letter, A, B or C.',
          items: [{ id: 'L4', prompt: 'When are the sessions?', options: [{ key: 'A', text: 'Monday and Wednesday' }, { key: 'B', text: 'Tuesday and Thursday' }, { key: 'C', text: 'Weekends only' }] },
            { id: 'L5', prompt: 'What must every swimmer wear?', options: [{ key: 'A', text: 'goggles' }, { key: 'B', text: 'a swimming cap' }, { key: 'C', text: 'a wristband' }] }] },
      ] }],
  };
  const LISTEN_KEY = {
    L1: { answer: ['Fenton'], line: 1, explanation: { ru: 'Фамилию продиктовали по буквам: F-E-N-T-O-N.' }, trap: 'spelling' },
    L2: { answer: ['24'], acceptable: ['twenty-four'], line: 3, explanation: { ru: 'I am twenty-four.' } },
    L3: { answer: ['32'], acceptable: ['thirty-two'], line: 4, explanation: { ru: 'thirty-two pounds a month' }, trap: 'number_trap' },
    L4: { answer: ['B'], line: 4, explanation: { ru: 'Tuesday and Thursday evenings.' } },
    L5: { answer: ['B'], line: 6, explanation: { ru: 'Очки выдают, а шапочку должны носить все — дистрактор A.' }, trap: 'distractor' },
  };
  const DICT_ITEMS = ['I would like to book a table for four people.', 'The library closes at half past eight on Fridays.', 'Please bring a photo and your student card.'];
  const DICT_DOC = (kind) => ({ kind, skill: 'listening', title: kind === 'spelling' ? 'Street names' : 'Joining a sports centre',
    groups: [{ id: 'DG', type: kind, instruction: 'Listen and type the sentence exactly as you hear it.', items: DICT_ITEMS.map((s, i) => ({ id: `D${i + 1}`, prompt: i % 2 ? 'KATE' : 'TOM', audio: { url: null } })) }] });
  const norm = (s) => String(s || '').toLowerCase().replace(/[‘’]/g, "'").replace(/[.,!?;:"]/g, '').replace(/\s+/g, ' ').trim();
  function docFor(id) {
    const meta = Object.values(CATALOG).flat().find((x) => x.id === id) || { id, kind: 'passage', title: READ_DOC.title };
    const kind = meta.kind;
    if (kind === 'dictation' || kind === 'spelling') return { meta, doc: { ...DICT_DOC(kind), id, title: meta.title }, key: Object.fromEntries(DICT_ITEMS.map((s, i) => [`D${i + 1}`, { answer: [s] }])) };
    if (LISTENING.includes(meta)) return { meta, doc: { ...structuredClone(LISTEN_DOC), id, title: meta.title }, key: LISTEN_KEY };
    return { meta, doc: { ...structuredClone(READ_DOC), id, title: meta.title || READ_DOC.title, kind: kind === 'test' ? 'test' : 'passage', timeLimitSec: kind === 'test' ? 3600 : 1200 }, key: READ_KEY };
  }
  function checkOne(key, itemId, given) {
    const k = key[itemId] || {};
    const ok = [...(k.answer || []), ...(k.acceptable || [])].map(norm);
    if (/^D\d/.test(itemId)) {
      const want = norm(k.answer?.[0]).split(' '), got = norm(given).split(' ');
      const units = want.map((w, i) => ({ text: w, status: got[i] === w ? 'ok' : got[i] && got[i].slice(0, 3) === w.slice(0, 3) ? 'spelling' : got[i] ? 'wrong' : 'missing', given: got[i] }));
      const okN = units.filter((u) => u.status === 'ok').length;
      return { itemId, correct: okN === want.length, words: { units, extra: got.slice(want.length), accuracy: okN / want.length, ok: okN, total: want.length }, reveal: { answer: k.answer, spoken: k.answer?.[0] } };
    }
    const g = Array.isArray(given) ? given.join(',') : given;
    const correct = ok.includes(norm(g));
    const spellingOnly = !correct && ok.some((a) => a.length > 3 && norm(g).length === a.length && [...a].filter((c, i) => c !== norm(g)[i]).length === 1);
    return { itemId, correct, spellingOnly, trap: correct ? null : k.trap || null, reveal: { answer: k.answer, acceptable: k.acceptable, explanation: k.explanation, quote: k.quote, textAnchor: k.textAnchor } };
  }
  // demo attempts survive reloads so review links keep working
  const attempts = (() => { try { return JSON.parse(localStorage.getItem('ielts_demo_attempts') || '{}'); } catch { return {}; } })();
  let attemptSeq = Math.max(800, ...Object.keys(attempts).map(Number));
  for (const a of Object.values(attempts)) { const meta = Object.values(CATALOG).flat().find((x) => x.id === a.testId); if (meta) { meta.attemptCount = (meta.attemptCount || 0) + 1; meta.lastAttempt = { ...a.attempt }; } }
  function submit({ m, body }) {
    const { meta, doc, key } = docFor(decodeURIComponent(m[1]));
    const ids = (doc.parts ? doc.parts.flatMap((p) => p.groups) : doc.groups).flatMap((g) => g.items.map((i) => i.id));
    const items = ids.map((id) => ({ ...checkOne(key, id, body?.answers?.[id] ?? ''), timeSec: body?.questionSec?.[id] ?? null, score: 0 }));
    const words = items.filter((x) => x.words);
    const raw = words.length ? words.reduce((s, x) => s + x.words.ok, 0) : items.filter((x) => x.correct).length;
    const max = words.length ? words.reduce((s, x) => s + x.words.total, 0) : ids.length;
    const id = ++attemptSeq;
    const band = !words.length && max ? Math.min(9, Math.max(3, Math.round((3 + (raw / max) * 5.5) * 2) / 2)) : null;
    attempts[id] = { testId: meta.id, attempt: { id, mode: body?.mode || 'practice', finishedAt: new Date().toISOString(), rawScore: raw, maxScore: max, timeSec: body?.timeSec || 0, band },
      document: withKey(doc, key), answers: body?.answers || {}, result: { items, highlights: body?.highlights || [] } };
    meta.attemptCount = (meta.attemptCount || 0) + 1;
    meta.lastAttempt = { ...attempts[id].attempt };
    try { localStorage.setItem('ielts_demo_attempts', JSON.stringify(attempts)); } catch {}
    return { attempt: attempts[id].attempt };
  }
  function withKey(doc, key) {
    const d = structuredClone(doc);
    for (const g of d.parts ? d.parts.flatMap((p) => p.groups) : d.groups) for (const it of g.items) Object.assign(it, key[it.id] || {});
    return d;
  }

  window.DEMO_DATA = {
    today: TODAY,
    routes: [
      { method: 'GET', re: /^\/user\/me$/, data: { id: 0, name: 'Демо Ученик', firstName: 'Демо', lastName: 'Ученик', email: 'demo@example.com' } },
      { method: 'GET', re: /^\/mobile\/ielts\/plan\/me$/, data: me },
      { method: 'GET', re: /^\/mobile\/ielts\/dashboard$/, data: () => structuredClone(dashboard) },
      { method: 'GET', re: /^\/mobile\/ielts\/plan$/, data: () => structuredClone(planRes) },
      { method: 'PUT', re: /^\/mobile\/ielts\/plan\/tasks\/(\d+)\/done$/, data: markDone },
      { method: 'PUT', re: /^\/mobile\/ielts\/plan\/tasks\/(\d+)\/date$/, data: move },
      { method: 'GET', re: /^\/mobile\/ielts\/profile$/, data: profile },
      { method: 'GET', re: /^\/mobile\/ielts\/progress$/, data: progress },
      { method: 'GET', re: /^\/mobile\/ielts\/mocks$/, data: ({ q }) => mocksRes(q.get('module') || 'academic') },
      { method: 'GET', re: /^\/mobile\/ielts\/tests\/([^/]+)\/transcript$/, data: ({ m }) => { const { doc } = docFor(decodeURIComponent(m[1])); return (doc.parts || []).map((p) => ({ number: p.number, transcript: p.transcript })); } },
      { method: 'POST', re: /^\/mobile\/ielts\/tests\/([^/]+)\/check$/, data: ({ m, body }) => checkOne(docFor(decodeURIComponent(m[1])).key, body.itemId, body.given) },
      { method: 'POST', re: /^\/mobile\/ielts\/tests\/([^/]+)\/attempts$/, data: submit },
      { method: 'GET', re: /^\/mobile\/ielts\/tests\/([^/]+)$/, data: ({ m }) => { const { meta, doc } = docFor(decodeURIComponent(m[1])); return { test: structuredClone({ ...meta, questionTypes: [...new Set((doc.parts ? doc.parts.flatMap((p) => p.groups) : doc.groups).map((g) => g.type))] }), document: doc }; } },
      { method: 'GET', re: /^\/mobile\/ielts\/attempts\/(\d+)$/, data: ({ m }) => { const a = attempts[m[1]]; if (!a) { const e = new Error('Демо: попытка не найдена'); e.status = 404; throw e; } return structuredClone(a); } },
      { method: 'GET', re: /^\/mobile\/ielts\/tests$/, data: ({ q }) => structuredClone(CATALOG[q.get('skill')] || []) },
      { method: 'PUT', re: /^\/mobile\/ielts\/profile$/, data: ({ body }) => { Object.assign(profile, body); return profile; } },
    ],
    local: {},
    _: { CATALOG, attempts, nextId: () => ++attemptSeq, persist: () => { try { localStorage.setItem('ielts_demo_attempts', JSON.stringify(attempts)); } catch {} } },
  };
})();
