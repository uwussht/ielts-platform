// Demo fixtures for spec D: diagnostic form/path/submit/result, profile route.
// Original short texts in prod-server's diagnostic document shape.
(function () {
  const D = window.DEMO_DATA; if (!D) return;
  const { attempts, nextId, persist } = D._;
  const profile = () => D.routes.find((r) => r.method === 'GET' && String(r.re) === String(/^\/mobile\/ielts\/profile$/)).data;

  // ---------- diagnostic form ----------
  const clip = (id, context, lines, items) => ({ id, context, instruction: 'Write NO MORE THAN TWO WORDS AND/OR A NUMBER for each answer.', audio: null, transcript: lines, items });
  const gap = (id, prompt, answer, inputmode, type = 'form_completion') => ({ id, type, prompt, answer, inputmode });
  const mcq = (id, prompt, options, answer) => ({ id, type: 'multiple_choice_single', prompt, options: options.map((text, i) => ({ key: 'ABCD'[i], text })), answer });
  const FORM = {
    levels: {
      light: { minutes: 20, listening: { slots: [1], take: { 1: 3 }, mode: 'practice', minutes: 5 }, reading: { light: true, minutes: 6 }, writing: { words: 120, minutes: 5 }, speaking: { part1: 2, monologueSec: 60, answerSec: 30, prepSec: 30, minutes: 4 } },
      standard: { minutes: 45, listening: { slots: [1, 2], mode: 'exam', minutes: 10 }, reading: { light: false, minutes: 15 }, writing: { words: 250, minutes: 12 }, speaking: { part1: 3, monologueSec: 120, answerSec: 45, prepSec: 60, minutes: 8 } },
      full: { minutes: 70, listening: { slots: [1, 2], mode: 'exam', minutes: 14 }, reading: { light: false, minutes: 20 }, writing: { words: 250, minutes: 25 }, speaking: { part1: 4, monologueSec: 120, answerSec: 45, prepSec: 60, minutes: 11 } },
    },
    listening: { slots: [
      { slot: 1, clips: [clip('L1a', 'A caller is booking a place on a weekend cooking course.', [
        'Woman: Good morning, Riverside Community Kitchen.', 'Man: Hi, I would like to book the weekend bread course.', 'Woman: Of course. That starts on Saturday the fourteenth at nine thirty.',
        'Man: And how much is it?', 'Woman: Forty-five pounds, and that includes all the flour and an apron.', 'Man: Great. My name is Daniel Brook.'],
      [gap('dl1', 'Course starts at: ____ on Saturday', '9:30|nine thirty|9.30', 'numeric'), gap('dl2', 'Price: £____', '45|forty-five', 'numeric'), gap('dl3', 'Price includes flour and an ____', 'apron')])] },
      { slot: 2, clips: [
        clip('L2a', 'A guide talks to visitors at the start of a museum tour.', ['Guide: Welcome to the harbour museum. The tour lasts about forty minutes.', 'We begin in the ship room, then visit the map gallery.', 'Photography is allowed everywhere except the map gallery, because the old paper is fragile.'],
          [mcq('dl4', 'How long is the tour?', ['20 minutes', '40 minutes', 'one hour'], 'B'), mcq('dl5', 'Where are photos not allowed?', ['the ship room', 'the café', 'the map gallery'], 'C')]),
        clip('L2b', 'A guide talks to visitors at the start of a garden tour.', ['Guide: Welcome to the botanical garden. Our walk takes about forty minutes.', 'We start in the glasshouse and finish by the lake.', 'Please do not take photos inside the glasshouse; the flash harms the young plants.'],
          [mcq('dl4b', 'How long is the walk?', ['20 minutes', '40 minutes', 'one hour'], 'B'), mcq('dl5b', 'Where are photos not allowed?', ['the lake', 'the glasshouse', 'the entrance'], 'B')]),
      ] },
    ] },
    reading: {
      academic: { title: 'The return of urban bees',
        paragraphs: ['## A', 'Over the last decade, rooftop beehives have appeared on offices, hotels and schools in many large cities. Supporters argue that urban hives help pollinate parks and gardens and raise awareness of declining insect numbers.',
          '## B', 'However, some ecologists warn that too many honeybee hives can harm wild bees, which compete for the same flowers. In parts of central London, the number of hives per square kilometre is now higher than in most farmland.',
          '## C', 'Researchers therefore recommend planting more flowering plants before adding new hives. A city, they say, should measure the food available to insects rather than simply count beehives.'],
        headings: [{ key: 'i', text: 'A possible downside of a popular trend' }, { key: 'ii', text: 'The spread of hives in cities' }, { key: 'iii', text: 'A suggested change of approach' }, { key: 'iv', text: 'The cost of keeping bees' }],
        items: [
          { id: 'dr1', type: 'matching_headings', prompt: 'Paragraph A', answer: 'ii', instruction: 'Choose the correct heading for each paragraph.' },
          { id: 'dr2', type: 'matching_headings', prompt: 'Paragraph B', answer: 'i', instruction: 'Choose the correct heading for each paragraph.' },
          { id: 'dr3', type: 'tfng', prompt: 'Urban hives are found only on office buildings.', answer: 'FALSE', instruction: 'Do the statements agree with the information in the passage?' },
          { id: 'dr4', type: 'tfng', prompt: 'Honeybees and wild bees feed on the same flowers.', answer: 'TRUE', instruction: 'Do the statements agree with the information in the passage?' },
          { id: 'dr5', type: 'tfng', prompt: 'Rooftop beekeeping is more profitable than farming.', answer: 'NOT GIVEN', instruction: 'Do the statements agree with the information in the passage?' },
          { id: 'dr6', type: 'sentence_completion', prompt: 'Cities should measure the ____ available to insects.', answer: 'food', instruction: 'Complete the sentence with ONE WORD from the passage.' },
        ],
        lightItems: ['dr1', 'dr3', 'dr4', 'dr6'] },
    },
    writing: { question: 'Some people think that schools should teach practical skills such as cooking and managing money, while others believe academic subjects are more important.\n\nDiscuss both views and give your own opinion.' },
    speaking: { part1: [{ id: 'ds1', text: 'Where do you live, and what do you like about it?' }, { id: 'ds2', text: 'How do you usually spend your weekends?' }, { id: 'ds3', text: 'Do you prefer reading books or watching films? Why?' }, { id: 'ds4', text: 'What kind of music do you enjoy?' }],
      cueCard: { id: 'ds5', topic: 'Describe a skill you would like to learn.', points: ['what the skill is', 'why you want to learn it', 'how you would learn it'], explain: 'and explain how this skill would help you in the future.' } },
  };
  FORM.reading.general = FORM.reading.academic;
  const allItems = () => [...FORM.listening.slots.flatMap((s) => s.clips.flatMap((c) => c.items.map((it) => ({ ...it, skill: 'listening' })))), ...FORM.reading.academic.items.map((it) => ({ ...it, skill: 'reading' }))];
  const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const isRight = (it, v) => String(it.answer).split('|').some((a) => norm(a) === norm(v));
  const toBand = (c, t) => (t ? Math.max(3, Math.min(8.5, Math.round((3 + (c / t) * 5.5) * 2) / 2)) : null);

  function start({ q }) {
    const level = q.get('level') || 'standard', module = q.get('module') || profile().track || 'academic';
    return { formId: 'demo-a1', level, module, code: 'A1', form: structuredClone(FORM) };
  }
  // adaptive: a weak first clip sends slot 2 to the alternative clip
  function path({ body }) {
    const a = body?.answers || {};
    const c1 = ['dl1', 'dl2', 'dl3'].filter((id) => isRight(allItems().find((x) => x.id === id), a[id])).length;
    return { path: { 1: 'L1a', 2: c1 >= 2 ? 'L2a' : 'L2b' } };
  }
  function submit({ body }) {
    const id = nextId(), L = FORM.levels[body.level] || FORM.levels.standard;
    const sl2 = path({ body }).path[2];
    const asked = allItems().filter((it) => (it.skill === 'reading' ? (L.reading.light ? FORM.reading.academic.lightItems.includes(it.id) : true)
      : body.level === 'light' ? ['dl1', 'dl2', 'dl3'].includes(it.id) : ['dl1', 'dl2', 'dl3'].includes(it.id) || FORM.listening.slots[1].clips.find((c) => c.id === sl2).items.some((x) => x.id === it.id)));
    const items = asked.map((it) => ({ itemId: it.id, skill: it.skill, type: it.type, given: body.answers?.[it.id] || '', answer: String(it.answer).split('|')[0], correct: isRight(it, body.answers?.[it.id]),
      trap: it.type === 'tfng' && !isRight(it, body.answers?.[it.id]) ? 'NG_vs_False' : null }));
    const raw = (sk) => { const xs = items.filter((x) => x.skill === sk); return { correct: xs.filter((x) => x.correct).length, total: xs.length }; };
    const byType = {};
    items.forEach((x) => { const b = (byType[x.type] ||= { correct: 0, total: 0 }); b.total++; if (x.correct) b.correct++; });
    const weakTypes = Object.entries(byType).filter(([, v]) => v.correct / v.total < 0.6).map(([k]) => k);
    const rl = raw('listening'), rr = raw('reading');
    const words = String(body.writingText || '').trim().split(/\s+/).filter(Boolean).length, secs = Object.values(body.speakingSec || {});
    const bands = { listening: toBand(rl.correct, rl.total), reading: toBand(rr.correct, rr.total), writing: null, speaking: null, overallPrelim: true };
    bands.overall = Math.round(((bands.listening + bands.reading) / 2) * 2) / 2;
    attempts[id] = { testId: 'DG-A1', skill: 'diagnostic', attempt: { id, finishedAt: new Date().toISOString(), band: bands.overall }, document: null,
      result: { level: body.level, bands, raw: { listening: rl, reading: rr }, writing: words ? { status: 'pending_ai', words } : null,
        speaking: secs.length ? { status: 'pending_ai', answers: secs.length, seconds: secs.reduce((s, x) => s + x, 0) } : null, weakTypes, byType, items } };
    persist();
    return { attempt: { id } };
  }
  function grade(opts) {
    const fd = opts.form, id = fd.get('attemptId'), skill = fd.get('skill'), a = attempts[id];
    if (!a) { const e = new Error('not found'); e.status = 404; throw e; }
    const r = a.result, ws = r[skill];
    const band = skill === 'writing' ? Math.min(7, 4.5 + Math.floor((ws.words || 0) / 80) * 0.5) : 5.5;
    ws.status = 'done';
    ws.criteria = skill === 'writing' ? { taskResponse: band, coherenceCohesion: band, lexicalResource: band - 0.5, grammaticalRange: band }
      : { fluencyCoherence: 5.5, lexicalResource: 5.5, grammaticalRange: 5, pronunciation: 6 };
    r.bands[skill] = band;
    const all = ['listening', 'reading', 'writing', 'speaking'].map((s) => r.bands[s]);
    if (all.every((x) => x != null)) { r.bands.overall = Math.round((all.reduce((s, x) => s + x, 0) / 4) * 2) / 2; r.bands.overallPrelim = false; }
    a.attempt.band = r.bands.overall;
    Object.assign(profile(), { bands: { ...r.bands }, diagnosticDone: true });
    persist();
    return { ok: true };
  }
  const last = () => { const ids = Object.keys(attempts).filter((k) => attempts[k].skill === 'diagnostic').map(Number); return { attemptId: ids.length ? Math.max(...ids) : null }; };

  D.routes.unshift(
    { method: 'GET', re: /^\/mobile\/ielts\/diagnostic$/, data: start },
    { method: 'GET', re: /^\/mobile\/ielts\/diagnostic\/last$/, data: last },
    { method: 'POST', re: /^\/mobile\/ielts\/diagnostic\/path$/, data: path },
    { method: 'POST', re: /^\/mobile\/ielts\/diagnostic$/, data: submit },
    { method: 'PUT', re: /^\/mobile\/ielts\/profile\/route$/, data: ({ body }) => { profile().route = body.route; return profile(); } },
  );
  D.local['/api/ielts/diagnostic/assess'] = grade;

  // ---------- vocabulary ----------
  // the real sets (js/data/demo-vocab.js, copied from the backend)
  const VOC = window.DEMO_VOCAB || { list: [], sets: {} };
  D._.CATALOG.vocab = VOC.list;
  const VKEY = 'ielts_demo_vocab.v2';
  let VP = null; try { VP = JSON.parse(localStorage.getItem(VKEY) || 'null'); } catch {}
  // demo progress as on the test account: 10 words due in Environment, Health and Culture
  const dueIn = (id, n) => Object.fromEntries((VOC.sets[id]?.document.words || []).slice(0, n).map((w) => [String(w.id).toLowerCase(), { box: 1, due: true }]));
  VP ||= { states: { 'ielts-VOC-ENV': dueIn('VOC-ENV', 10), 'ielts-VOC-HEA': dueIn('VOC-HEA', 10), 'ielts-VOC-CUL': dueIn('VOC-CUL', 10) },
    saved: [{ id: 1, word: 'meticulous', translationRu: 'дотошный', translationKz: 'мұқият', example: 'She is meticulous about details.', learned: false, source: 'Reading' },
      { id: 2, word: 'albeit', translationRu: 'хотя и', translationKz: 'дегенмен', example: 'It worked, albeit slowly.', learned: true, source: 'manual' }], seq: 2 };
  const vkeep = () => { try { localStorage.setItem(VKEY, JSON.stringify(VP)); } catch {} };
  const sumOf = (scope) => { const s = Object.values(VP.states[scope] || {}); return { seen: s.length, learned: s.filter((x) => x.learned).length, due: s.filter((x) => x.due).length }; };
  D.routes.unshift(
    { method: 'GET', re: /^\/mobile\/ielts\/tests\/(VOC-[^/]+)$/, data: ({ m }) => { const v = VOC.sets[decodeURIComponent(m[1])]; if (!v) { const e = new Error(t('demo.noData', { path: m[0] })); e.status = 404; throw e; } return structuredClone(v); } },
    { method: 'GET', re: /^\/mobile\/vocab-progress$/, data: ({ q }) => Object.fromEntries(String(q.get('scopes') || '').split(',').filter(Boolean).map((s) => [s, sumOf(s)])) },
    { method: 'GET', re: /^\/mobile\/vocab-progress\/([^/]+)$/, data: ({ m }) => structuredClone(VP.states[decodeURIComponent(m[1])] || {}) },
    { method: 'POST', re: /^\/mobile\/vocab-progress\/([^/]+)$/, data: ({ m, body }) => {
      const sc = (VP.states[decodeURIComponent(m[1])] ||= {});
      for (const r of body?.results || []) { const x = (sc[r.key] ||= { box: 0 }); x.box = r.ok ? Math.min(5, (x.box || 0) + 1) : 1; x.due = false; x.learned = x.box >= 3; }
      vkeep(); return structuredClone(sc);
    } },
    { method: 'GET', re: /^\/mobile\/lesson-vocab\/saved$/, data: () => ({ words: structuredClone(VP.saved) }) },
    { method: 'POST', re: /^\/mobile\/lesson-vocab\/saved\/learned$/, data: ({ body }) => { for (const w of VP.saved) if ((body?.ids || []).includes(w.id)) w.learned = true; vkeep(); return { ok: true }; } },
    { method: 'POST', re: /^\/mobile\/lesson-vocab$/, data: ({ body }) => { VP.saved.push({ id: ++VP.seq, word: body.word, translationRu: body.translationRu || null, translationKz: body.translationKz || null, learned: false, source: body.source }); vkeep(); return { ok: true }; } },
    { method: 'DELETE', re: /^\/mobile\/lesson-vocab\/words\/(\d+)$/, data: ({ m }) => { VP.saved = VP.saved.filter((w) => String(w.id) !== m[1]); vkeep(); return { ok: true }; } },
  );

  // ---------- registration / code login (demo: code 1234; taken@mail.com is "already registered") ----------
  const bad = (msg, status = 400) => { const e = new Error(msg); e.status = status; e.serverMessage = msg; throw e; };
  const session = { accessToken: 'demo', refreshToken: 'demo', userId: 0, name: 'Демо', role: 'STUDENT' };
  D.routes.unshift(
    { method: 'POST', re: /^\/registration\/initiate$/, data: ({ body }) => (body?.email === 'taken@mail.com' ? bad('Пользователь с такой почтой уже существует') : { ok: true }) },
    { method: 'POST', re: /^\/registration\/verify$/, data: ({ body }) => (String(body?.otp) === '1234' ? session : bad('Invalid or expired code')) },
    { method: 'POST', re: /^\/auth\/otp\/request$/, data: ({ body }) => (body?.email === 'none@mail.com' ? bad('User not found', 404) : { ok: true }) },
    { method: 'POST', re: /^\/auth\/otp\/verify$/, data: ({ body }) => (String(body?.otp) === '1234' ? session : bad('Invalid or expired code')) },
    { method: 'POST', re: /^\/user\/set-password$/, data: { ok: true } },
    { method: 'GET', re: /^\/mobile\/content-quota\/usage$/, data: [{ contentType: 'IELTS_READING', limit: 3, used: 1 }, { contentType: 'IELTS_LISTENING', limit: 3, used: 3 }, { contentType: 'IELTS_WRITING', limit: 2, used: 0 }, { contentType: 'IELTS_SPEAKING', limit: 2, used: 1 }] },
  );

  // ---------- mock sessions ----------
  const Bo = ['listening', 'reading', 'writing', 'speaking'];
  const MIN = { listening: 40, reading: 60, writing: 60, speaking: 14 };
  const TESTS = { listening: ['LT-1'], reading: ['RT-AC-1'], writing: ['W1-AC-line-1', 'W2-opinion-1'], speaking: ['S1-hometown', 'S2-person', 'S3-education'] };
  const KEY = 'ielts_demo_mocks';
  const iso = (d) => new Date(d).toISOString();
  const r5 = (x) => Math.round(x * 2) / 2;
  let S = null;
  try { S = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch {}
  const blank = (name) => ({ name, testIds: TESTS[name], attemptIds: [] });
  if (!S) {
    const day = 864e5, now = Date.now();
    const done = (name, band, raw) => ({ ...blank(name), attemptIds: [-1], band, rawScore: raw ?? null, maxScore: raw != null ? 40 : null, state: 'done',
      parts: name === 'writing' ? [{ attemptId: null, status: 'done', criteria: { taskResponse: 5, coherenceCohesion: 5.5, lexicalResource: 5, grammaticalRange: 5 } }]
        : name === 'speaking' ? [{ attemptId: null, status: 'done', criteria: { fluencyCoherence: 6, lexicalResource: 6, grammaticalRange: 5.5, pronunciation: 6 } }] : [] });
    S = { seq: 72, list: {
      71: { id: 71, mockId: 'MOCK-AC-01', title: 'Mock 01', module: 'academic', status: 'submitted', partial: false, overall: 5.5, startedAt: iso(now - 8 * day), finishedAt: iso(now - 8 * day + 3 * 36e5), section: null, draft: null,
        sections: [done('listening', 5.5, 21), done('reading', 5, 18), done('writing', 5), done('speaking', 6)] },
      72: { id: 72, mockId: 'MOCK-AC-02', title: 'Mock 02', module: 'academic', status: 'in_progress', partial: false, overall: null, startedAt: iso(now - day), finishedAt: null, section: null, draft: null,
        sections: [done('listening', 6, 25), blank('reading'), blank('writing'), blank('speaking')] },
    } };
  }
  const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
  function refresh(s) {
    for (const x of s.sections) {
      if (!x.attemptIds.length || x.attemptIds[0] === -1) { if (!x.attemptIds.length) x.state = x.closed || s.status !== 'in_progress' ? 'missing' : 'pending'; continue; }
      const A = x.attemptIds.map((id) => attempts[id]).filter(Boolean);
      if (x.name === 'listening' || x.name === 'reading') {
        const a = A[0]; x.band = a?.attempt.band ?? null; x.rawScore = a?.attempt.rawScore ?? null; x.maxScore = a?.attempt.maxScore ?? null; x.state = 'done'; x.parts = [];
        continue;
      }
      x.parts = x.attemptIds.map((id) => ({ attemptId: id, status: attempts[id]?.result?.status || 'done', criteria: attempts[id]?.result?.criteria || null }));
      const ready = x.parts.every((q) => q.status === 'done');
      x.state = ready ? 'done' : 'checking';
      const b = A.map((a) => a.attempt.band).filter((v) => typeof v === 'number');
      x.band = ready && b.length ? (x.name === 'writing' && b.length === 2 ? r5((b[0] + 2 * b[1]) / 3) : r5(b.reduce((s2, v) => s2 + v, 0) / b.length)) : null;
    }
    const bands = s.sections.map((x) => x.band);
    s.overall = s.status !== 'aborted' && bands.every((v) => typeof v === 'number') ? r5(bands.reduce((a, v) => a + v, 0) / 4) : s.overall ?? null;
    s.partial = s.status !== 'in_progress' && s.status !== 'aborted' && s.sections.some((x) => x.state === 'missing');
    keep();
    return s;
  }
  const out = (s) => ({ ...structuredClone(refresh(s)), serverNow: new Date().toISOString() });
  const get = (id) => { const s = S.list[id]; if (!s) { const e = new Error('Демо: сессия не найдена'); e.status = 404; throw e; } return s; };
  const openOf = () => Object.values(S.list).find((s) => s.status === 'in_progress');
  const mocksRoute = D.routes.find((r) => r.method === 'GET' && String(r.re) === String(/^\/mobile\/ielts\/mocks$/));
  const baseMocks = mocksRoute.data;
  mocksRoute.data = (ctx) => {
    const res = baseMocks(ctx), open = openOf();
    for (const m of res.mocks) {
      const ss = Object.values(S.list).filter((s) => s.mockId === m.id).sort((a, b) => b.id - a.id)[0];
      m.status = ss ? (ss.status === 'in_progress' ? 'in_progress' : 'submitted') : 'not_started'; m.sessionId = ss?.id ?? null;
      m.sections = ss ? Object.fromEntries(refresh(ss).sections.map((x) => [x.name, x.state])) : {};
    }
    res.history = Object.values(S.list).sort((a, b) => b.id - a.id).map((s) => ({ ...out(s), sections: s.sections.map((x) => ({ name: x.name, band: x.band ?? null, state: x.state })) }));
    res.open = open ? { id: open.id, mockId: open.mockId, title: open.title } : null;
    return res;
  };
  D.routes.unshift(
    { method: 'POST', re: /^\/mobile\/ielts\/mocks\/([^/]+)\/sessions$/, data: ({ m }) => {
      if (openOf()) { const e = new Error('open'); e.status = 409; throw e; }
      const id = ++S.seq, mid = decodeURIComponent(m[1]);
      S.list[id] = { id, mockId: mid, title: 'Mock ' + mid.slice(-2), module: /GT/.test(mid) ? 'general' : 'academic', status: 'in_progress', partial: false, overall: null,
        startedAt: new Date().toISOString(), finishedAt: null, section: null, draft: null, sections: Bo.map(blank) };
      return out(S.list[id]);
    } },
    { method: 'GET', re: /^\/mobile\/ielts\/mocks\/sessions\/(\d+)$/, data: ({ m }) => out(get(m[1])) },
    { method: 'POST', re: /^\/mobile\/ielts\/mocks\/sessions\/(\d+)\/sections\/(\w+)\/start$/, data: ({ m }) => {
      const s = get(m[1]); s.section = m[2]; s.sectionDeadline = new Date(Date.now() + MIN[m[2]] * 6e4).toISOString(); s.draft = null; return out(s);
    } },
    { method: 'PUT', re: /^\/mobile\/ielts\/mocks\/sessions\/(\d+)\/sections\/(\w+)\/draft$/, data: ({ m, body }) => { const s = get(m[1]); if (s.section === m[2]) { s.draft = body; keep(); } return { ok: true }; } },
    { method: 'POST', re: /^\/mobile\/ielts\/mocks\/sessions\/(\d+)\/sections\/(\w+)\/finish$/, data: ({ m, body }) => {
      const s = get(m[1]), x = s.sections.find((y) => y.name === m[2]);
      x.attemptIds = (body?.attemptIds || []).filter((v) => v != null).map(String);
      x.closed = true;
      s.section = null; s.sectionDeadline = null; s.draft = null;
      if (s.sections.every((y) => y.attemptIds.length || y.closed)) { s.status = 'submitted'; s.finishedAt = new Date().toISOString(); }
      return out(s);
    } },
    { method: 'POST', re: /^\/mobile\/ielts\/mocks\/sessions\/(\d+)\/abort$/, data: ({ m }) => { const s = get(m[1]); s.status = 'aborted'; s.section = null; s.finishedAt = new Date().toISOString(); return out(s); } },
  );
})();
