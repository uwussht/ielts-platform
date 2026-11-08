// «Практика IELTS» — ai-tutor learn tab: catalog (WI), skill pages (Wz), practice lists (WM),
// level groups (WT), recommended-level line (W$). Task pages are dispatched to the skill screens.
(function () {
  const { h, icon } = DOM;
  const Wo = ['listening', 'reading', 'writing', 'speaking'];
  const Wc = {
    listening: [{ key: 'full', view: 'listening-full' }, { key: 'parts', view: 'listening-tasks' }, { key: 'types', view: 'listening-types' }, { key: 'dictation', view: 'listening-dictation' }, { key: 'spelling', view: 'listening-spelling' }],
    reading: [{ key: 'types', view: 'types' }, { key: 'full', view: 'reading-full' }, { key: 'texts', view: 'texts' }, { key: 'drills', view: 'drills' }],
    writing: [{ key: 'task1', view: 'writing-task1' }, { key: 'task2', view: 'writing-task2' }],
    speaking: [{ key: 'part1', view: 'speaking-part1' }, { key: 'part2', view: 'speaking-part2' }, { key: 'part3', view: 'speaking-part3' }, { key: 'shadowing', view: 'speaking-shadowing' }],
  };
  const Wd = { types: 7, drill: 5, passage: 20, section: 20, test: 60, part: 10, dictation: 8, spelling: 6, task1: 20, task2: 40, part1: 5, part2: 4, part3: 5, shadowing: 5 };
  const Wk = { task1: 20, part1: 5, shadowing: 5, dictation: 8, spelling: 6 };
  const Wm = new Set(['test', 'task1', 'task2', 'part1', 'part2', 'part3']);
  const Ww = { 'reading:types': 'types', 'reading:drill': 'drills', 'reading:passage': 'texts', 'reading:test': 'reading-full', 'listening:dictation': 'listening-dictation', 'listening:spelling': 'listening-spelling', 'listening:part': 'listening-tasks', 'writing:task1': 'writing-task1', 'writing:task2': 'writing-task2', 'speaking:part1': 'speaking-part1', 'speaking:part2': 'speaking-part2', 'speaking:part3': 'speaking-part3', 'speaking:shadowing': 'speaking-shadowing' };
  const AR = ['skimming', 'scanning', 'ng', 'paraphrase', 'headings', 'keyword', 'timing', 'gt'];
  const Wj = Hub.SKILL_NAME;
  const trackName = I18n.trackName;

  // ---------- data ----------
  async function loadLists() {
    const res = await Promise.all(Wo.map((s) => Api.tests(s).then((r) => (Array.isArray(r) ? r : r?.items || r?.tests || [])).catch(() => [])));
    const L = Object.fromEntries(Wo.map((s, i) => [s, res[i]]));
    const band = Object.fromEntries(Wo.map((s) => [s, L[s].find((x) => Number.isFinite(x.studentBand))?.studentBand ?? null]));
    return { L, levelInfo: { band } };
  }
  const track = () => App.track();
  const Wa = (items, tr) => items.filter((x) => !x.module || x.module === 'both' || x.module === tr);

  // ---------- row model ----------
  const Wr = (b) => (Number.isInteger(+b) ? (+b).toFixed(1) : String(+b));
  const Wu = (x) => (x?.timeLimitSec ? Math.round(x.timeLimitSec / 60) : Wd[x?.kind] || 10);
  function Wh(items) {
    if (!items.length) return 'soon';
    const n = items.filter((x) => x.attemptCount > 0).length;
    return n === items.length ? 'done' : n ? 'started' : 'new';
  }
  const Wi = (x) => (Number.isFinite(x?.bandMin) && Number.isFinite(x?.bandMax) ? (x.bandMin === x.bandMax ? `Band ${Wr(x.bandMin)}` : `Band ${Wr(x.bandMin)}–${Wr(x.bandMax)}`) : null);
  function Wp(items) {
    const b = items.filter((x) => Number.isFinite(x.bandMin));
    return b.length ? Wi({ bandMin: Math.min(...b.map((x) => x.bandMin)), bandMax: Math.max(...b.map((x) => x.bandMax ?? x.bandMin)) }) : null;
  }
  function Wl(items) {
    if (!items.length) return 'any';
    const lv = items.map((x) => x.level || 'any');
    return lv.some((l) => l === 'fit' || l === 'any') ? 'fit' : lv.includes('above') ? 'above' : 'below';
  }
  const Wb = (key) => ({ tab: 'learn', view: 'practice-list', list: key });
  const Wg = (x, skill, view, mode = 'practice') => ({
    id: x.id, skill, title: x.title, minutes: skill === 'listening' && x.kind === 'test' && !x.timeLimitSec ? 40 : Wu(x), mode, status: Wh([x]), band: Wi(x),
    level: x.kind === 'test' ? 'fit' : x.level, added: (Wm.has(x.kind) && x.createdAt) || null,
    open: x.kind === 'dictation' || x.kind === 'spelling' ? { run: { testId: x.id, kind: x.kind } } : { tab: 'learn', view, testId: x.id },
  });
  function Wx(items, tr) {
    const R = Wa(items, tr);
    return AR.filter((id) => id !== 'gt' || tr === 'general').map((id) => {
      const tests = R.filter((x) => x.kind === 'drill' && x.category === id);
      const s = tests.find((x) => !(x.attemptCount > 0)) || tests[0];
      return { id: 'drill:' + id, skill: 'reading', drill: id, titleKey: `ieltsReading.drill.${id}.name`, minutes: Wu(s) || 5, mode: 'practice', status: Wh(tests), band: Wp(tests), level: Wl(tests), open: s ? Wb('reading:drill:' + id) : null };
    });
  }
  function Wf(skill, tab, L, tr) {
    const it = L[skill] || [];
    if (skill === 'reading') {
      const R = Wa(it, tr);
      if (tab === 'types') {
        return RL.AE.map((f) => {
          const g = R.filter((x) => x.kind === 'types' && x.category === f.id);
          if (!g.length) return null;
          const demo = g.find((x) => x.role === 'demo'), mini = g.find((x) => x.role === 'mini'), prac = g.filter((x) => x.role === 'practice');
          const first = demo || prac[0] || mini;
          return { id: 'type:' + f.id, skill, title: RL.AL(f.id), minutes: Wu(first) || 7, mode: 'practice', status: Wh(g), band: Wp(g), level: Wl(g), open: first ? Wb('reading:types:' + f.id) : null };
        }).filter(Boolean);
      }
      if (tab === 'drills') return Wx(it, tr);
      if (tab === 'full') return R.filter((x) => x.kind === 'test').map((x) => Wg(x, skill, 'texts', 'exam'));
      if (tab === 'texts') return R.filter((x) => x.kind === 'passage' || x.kind === 'section').map((x) => Wg(x, skill, 'texts', 'exam'));
    }
    if (skill === 'listening') {
      const map = { full: ['test', 'listening-tasks', 'exam'], parts: ['part', 'listening-tasks'], types: ['types', 'listening-types'], dictation: ['dictation', 'listening-dictation'], spelling: ['spelling', 'listening-spelling'] }[tab];
      return map ? it.filter((x) => x.kind === map[0]).map((x) => Wg(x, skill, map[1], map[2] || 'practice')) : [];
    }
    if (skill === 'writing') return Wa(it, tr).filter((x) => x.kind === tab).map((x) => Wg(x, skill, 'writing-' + tab, 'ai'));
    if (skill === 'speaking') return it.filter((x) => x.kind === tab).map((x) => Wg(x, skill, 'speaking-' + tab, tab === 'shadowing' ? 'practice' : 'ai'));
    return [];
  }
  const Wy = (skill, L, tr) => Wc[skill].reduce((s, d) => s + Wf(skill, d.key, L, tr).length, 0);
  const WC = (r) => r.status !== 'soon' && !!r.open;
  function Wv(items, skill, kind, tr) {
    const it = (skill === 'writing' ? Wa(items, tr) : items).filter((x) => x.kind === kind);
    if (!it.length) return [];
    const r = it.find((x) => !(x.attemptCount > 0)) || it[0];
    return [{ id: 'short:' + kind, skill, titleKey: 'ieltsPractice.short.' + kind, minutes: Wk[kind] || Wu(r), mode: kind === 'task1' || kind === 'part1' ? 'ai' : 'practice', count: it.length, status: Wh(it), band: Wp(it), level: Wl(it), open: Wb(`${skill}:${kind}`) }];
  }

  // ---------- open ----------
  function openHref(open) {
    if (!open) return null;
    if (open.run) return Router.href({ screen: 'ielts-dictation', ieltsTest: open.run.testId, kind: open.run.kind, mode: 'practice' });
    return Hub.routeHref(open);
  }

  // ---------- rendering ----------
  const rowTitle = (r) => r.title || t(r.titleKey);
  function WA(r, compact) {
    const disabled = r.status === 'soon' || !r.open;
    const href = disabled ? null : openHref(r.open);
    if (compact) {
      const body = [Hub.plate(r.skill, 36), h('span', { class: 'prow__body' }, h('b', null, rowTitle(r)), h('span', { class: 'prow__meta' }, Hub.minutes(r.minutes), ' · ', Hub.stChip(r.status))), icon('chevronR', 'ic16')];
      return h('li', null, disabled ? h('div', { class: 'prow is-compact is-soon', 'aria-disabled': 'true' }, body) : h('a', { class: 'prow is-compact', href }, body));
    }
    const added = r.added ? ' · ' + t('ieltsPractice.added', { date: Hub.fmtDate(r.added, true) }) : '';
    return h('li', { class: 'prow' + (disabled ? ' is-soon' : '') },
      Hub.plate(r.skill, 48),
      h('span', { class: 'prow__body' }, h('b', null, rowTitle(r)), h('span', { class: 'prow__meta' }, `${Hub.minutes(r.minutes)} · ${t('ieltsPractice.mode.' + r.mode)}${added}`)),
      (r.band || r.level) && h('span', { class: 'bandchip is-' + (r.level || 'any'), title: r.level === 'above' ? t('ieltsLevel.stretch') : null }, r.band || t('ieltsLevel.anyLevel')),
      Hub.stChip(r.status),
      !disabled && h('a', { class: 'btn btn--secondary btn--sm', href }, r.status === 'started' ? t('ieltsPlan.continue') : t('ieltsPlanV.open')));
  }
  function WT(rows) {
    const fit = rows.filter((r) => r.level !== 'below' && r.level !== 'above'), above = rows.filter((r) => r.level === 'above'), below = rows.filter((r) => r.level === 'below');
    return h('div', { class: 'stack' },
      fit.length > 0 && h('section', { class: 'lvgroup' }, h('h3', { class: 'lvgroup__title is-fit' }, `${t('ieltsLevel.recommended')} · ${fit.length}`), h('ul', { class: 'prows' }, fit.map((r) => WA(r)))),
      above.length > 0 && h('section', { class: 'lvgroup' }, h('h3', { class: 'lvgroup__title is-above' }, `${t('ieltsLevel.harder')} · ${above.length}`), h('ul', { class: 'prows' }, above.map((r) => WA(r)))),
      below.length > 0 && h('section', { class: 'lvgroup is-unsuitable' }, h('h3', { class: 'lvgroup__title is-below' }, `${t('ieltsLevel.unsuitable')} · ${below.length}`),
        h('p', { class: 'small muted' }, t('ieltsLevel.unsuitableHint')), h('ul', { class: 'prows' }, below.map((r) => WA(r)))));
  }
  function levelLine(skill, levelInfo) {
    const b = levelInfo.band[skill];
    return h('p', { class: 'levelbar' }, icon('target', 'ic16'),
      b != null ? h('span', null, h('b', null, t('ieltsLevel.recommendedRange', { range: `${Wr(b)}–${Wr(Math.min(9, b + 1))}` })), ' · ' + t('ieltsLevel.your', { skill: Wj[skill], band: Wr(b) }))
        : h('span', null, t('ieltsLevel.none')));
  }
  function search(value, placeholder, onInput) {
    const input = h('input', { type: 'search', class: 'search__input', placeholder, 'aria-label': placeholder, value });
    input.addEventListener('input', () => onInput(input.value));
    return h('label', { class: 'search' + (value ? ' is-active' : '') }, icon('search', 'ic16'), input);
  }
  const crumbs = (...parts) => h('nav', { class: 'crumbs', 'aria-label': t('ieltsPractice.crumbs') },
    parts.filter(Boolean).map((p, i) => [i > 0 && icon('chevronR', 'ic12'), p.href ? h('a', { class: 'link', href: p.href }, p.label) : h('span', { 'aria-current': 'page' }, p.label)]));
  const learnHref = (view, extra = {}) => Router.href({ screen: 'ielts', ieltsTab: 'learn', ieltsView: view || null, ...extra });

  // live-filtered list: rebuilds only the results region so the search box keeps focus
  function liveList(initial, build) {
    const region = h('div');
    const paint = (q) => region.replaceChildren(build(q));
    paint(initial);
    return { region, paint };
  }

  // ---------- catalog WI ----------
  const catState = { f: 'reading' };
  function catalog({ L }) {
    const tr = track();
    const all = () => { const seen = new Set(); return Wo.flatMap((s) => Wc[s].flatMap((d) => Wf(s, d.key, L, tr))).filter((r) => (seen.has(r.id) ? false : seen.add(r.id))).filter(WC); };
    const shortRows = (f) => (f === 'reading' ? Wx(L.reading, tr)
      : f === 'listening' ? [...Wv(L.listening, 'listening', 'dictation'), ...Wv(L.listening, 'listening', 'spelling')]
        : f === 'speaking' ? [...Wv(L.speaking, 'speaking', 'part1'), ...Wv(L.speaking, 'speaking', 'shadowing')]
          : [...Wv(L.writing, 'writing', 'task1', tr), { id: 'writing-guide', skill: 'writing', titleKey: 'ieltsPractice.writingGuide', minutes: 10, mode: 'theory', status: 'new', open: { tab: 'learn', view: 'writing-guide' } }]).filter(WC);

    const shortHost = h('div');
    function paintShort() {
      const rows = shortRows(catState.f);
      shortHost.replaceChildren(rows.length ? h('ul', { class: 'shortgrid' }, rows.map((r) => WA(r, true)))
        : Hub.empty({ icon: 'clock', title: t('ieltsPractice.emptySkill', { skill: Wj[catState.f] }), text: t('ieltsPractice.emptySkillText') }));
    }
    paintShort();
    const filterSeg = h('div');
    const paintSeg = () => filterSeg.replaceChildren(Hub.seg(['reading', 'listening', 'writing', 'speaking'].map((s) => [s, Wj[s]]), catState.f, (v) => { catState.f = v; paintSeg(); paintShort(); }, { label: t('ieltsPractice.skill'), small: true }));
    paintSeg();

    const browse = h('div', { class: 'stack' },
      h('section', { class: 'stack-sm' },
        h('header', { class: 'psec__head' }, h('div', null, h('h2', null, t('ieltsPractice.catalog')), h('span', { class: 'small muted' }, t('ieltsPractice.catalogSub')))),
        h('div', { class: 'skillgrid' }, Wo.map((s) => h('a', { class: 'skillcard', href: learnHref('skill-' + s) },
          Hub.plate(s, 56), h('b', null, Wj[s]), h('span', { class: 'small muted' }, t('ieltsPractice.skillSub.' + s)),
          h('span', { class: 'link' }, Wy(s, L, tr) > 0 ? t('ieltsPlanV.open') : t('ieltsPractice.st.soon'), icon('arrowR', 'ic16')))))),
      h('section', { class: 'stack-sm' },
        h('header', { class: 'psec__head' }, h('div', null, h('h2', null, t('ieltsPractice.short')), h('span', { class: 'small muted' }, t('ieltsPractice.shortSub', { track: trackName(tr) }))),
          h('span', { class: 'psec__filter' }, h('span', { class: 'small muted' }, t('ieltsPractice.skill')), filterSeg)),
        shortHost),
      h('a', { class: 'extra card', href: Router.href({ screen: 'ielts', ieltsTab: 'vocab' }) },
        h('span', { class: 'plate plate--writing', style: { width: '52px', height: '52px' } }, icon('vocab')),
        h('span', { class: 'grow' }, h('b', null, 'IELTS Vocabulary'), h('small', { class: 'muted', style: { display: 'block' } }, t('ieltsPractice.vocabSub')),
          h('span', { class: 'link' }, t('ieltsPractice.vocabOpen'), icon('arrowR', 'ic16')))));

    const { region, paint } = liveList('', (q) => {
      const s = q.trim().toLowerCase();
      if (!s) return browse;
      const res = all().filter((r) => rowTitle(r).toLowerCase().includes(s));
      return res.length ? h('section', { class: 'stack-sm' }, h('h2', null, t('ieltsPractice.found', { n: res.length })), h('ul', { class: 'prows' }, res.map((r) => WA(r))))
        : Hub.empty({ icon: 'search', title: t('ieltsPractice.noneTitle'), text: t('ieltsPractice.noneText', { q }),
          action: h('button', { class: 'btn btn--primary', type: 'button', onclick: () => { box.querySelector('input').value = ''; paint(''); } }, t('ieltsPractice.resetFilters')) });
    });
    const box = search('', t('ieltsPractice.search'), (v) => { box.classList.toggle('is-active', !!v); paint(v); });
    return h('div', { class: 'stack practice' },
      Hub.pageHead({ title: t('ieltsHub.tab.learn'), sub: t('ieltsPractice.sub') }), box, region);
  }

  // ---------- skill page Wz ----------
  function skillOf(view) {
    const m = /^skill-(\w+)$/.exec(view || '');
    if (m && Wc[m[1]]) return { skill: m[1], tab: Wc[m[1]][0].key };
    for (const s of Wo) { const d = Wc[s].find((x) => x.view === view); if (d) return { skill: s, tab: d.key }; }
    return null;
  }
  function skillPage({ L, levelInfo }, skill, tab) {
    const tr = track();
    const def = Wc[skill].find((x) => x.key === tab) || Wc[skill][0];
    const rows = Wf(skill, def.key, L, tr).filter(WC);
    const total = Wy(skill, L, tr);
    const sub = t('ieltsPractice.skillPageSub.' + skill) + (skill === 'reading' || skill === 'writing' ? ' · ' + trackName(tr) : '');
    const head = [crumbs({ label: t('ieltsHub.tab.learn'), href: learnHref() }, { label: Wj[skill] }), Hub.pageHead({ title: Wj[skill], sub }), levelLine(skill, levelInfo)];
    if (!total) {
      return h('div', { class: 'stack practice' }, head, Hub.empty({ icon: 'target', title: t('ieltsPractice.emptySkill', { skill: Wj[skill] }), text: t('ieltsPractice.emptySkillText'),
        action: h('a', { class: 'btn btn--secondary', href: learnHref('skill-reading') }, t('ieltsPractice.toReading')) }));
    }
    const { region, paint } = liveList('', (q) => {
      const s = q.trim().toLowerCase();
      const vis = s ? rows.filter((r) => rowTitle(r).toLowerCase().includes(s)) : rows;
      if (vis.length) return WT(vis);
      return s ? Hub.empty({ icon: 'search', title: t('ieltsPractice.noneTitle'), text: t('ieltsPractice.noneTextIn', { q, skill: Wj[skill] }),
        action: h('button', { class: 'btn btn--secondary', type: 'button', onclick: () => { box.querySelector('input').value = ''; paint(''); } }, t('ieltsPractice.clearSearch')) })
        : Hub.empty({ icon: 'clock', title: t('ieltsPractice.emptyTab'), text: t('ieltsPractice.emptySkillText') });
    });
    const box = search('', t('ieltsPractice.searchIn', { skill: Wj[skill] }), (v) => { box.classList.toggle('is-active', !!v); paint(v); });
    return h('div', { class: 'stack practice' }, head, box,
      Hub.seg(Wc[skill].map((d) => [d.key, t(`ieltsPractice.tab.${skill}.${d.key}`)]), def.key, (k) => Router.patch({ ieltsView: Wc[skill].find((d) => d.key === k).view, ieltsTest: null }), { small: true }),
      region,
      (skill === 'writing' || skill === 'speaking') && h('div', { class: 'chips' },
        h('a', { class: 'btn btn--secondary btn--sm', href: learnHref(skill + '-works') }, icon(skill, 'ic16'), skill === 'writing' ? t('ieltsLearn.writing.works') : t('ieltsSpeaking.works')),
        h('a', { class: 'btn btn--ghost btn--sm', href: learnHref(skill + '-guide') }, icon('bulb', 'ic16'), skill === 'writing' ? t('ieltsWriting.p.guide.title') : t('ieltsSpeaking.strategy'))),
      (skill === 'reading' || skill === 'writing') && h('p', { class: 'pnote' }, icon('about', 'ic16'), t(tr === 'general' ? 'ieltsPractice.trackNoteGt' : 'ieltsPractice.trackNoteAc')));
  }

  // ---------- practice list WM ----------
  function practiceList({ L, levelInfo }, key) {
    const tr = track();
    const [skill, kind, cat] = String(key).split(':');
    if (!Wo.includes(skill)) return Hub.empty({ title: t('ieltsLevel.empty') });
    const base = skill === 'reading' || skill === 'writing' ? Wa(L[skill], tr) : L[skill];
    const items = base.filter((x) => (kind === 'passage' ? x.kind === 'passage' || x.kind === 'section' : x.kind === kind) && (!cat || x.category === cat));
    const mode = skill === 'writing' || (skill === 'speaking' && kind !== 'shadowing') ? 'ai' : 'practice';
    const rows = items.map((x) => Wg(x, skill, Ww[`${skill}:${kind}`], mode));
    const title = kind === 'drill' && cat ? t(`ieltsReading.drill.${cat}.name`) : kind === 'types' && cat ? RL.AL(cat) || cat
      : t('ieltsPractice.short.' + kind) || Wj[skill];
    return h('div', { class: 'stack practice' },
      crumbs({ label: t('ieltsHub.tab.learn'), href: learnHref() }, { label: Wj[skill], href: learnHref('skill-' + skill) }, { label: title }),
      Hub.pageHead({ title, sub: Wj[skill] }), levelLine(skill, levelInfo),
      rows.length ? WT(rows) : Hub.empty({ icon: 'clock', title: t('ieltsLevel.empty') }));
  }

  // ---------- dispatcher (panel routing §1.5) ----------
  const VIEW_SKILL = (view, testId, L) => {
    if (/^speaking-/.test(view || '')) return 'speaking';
    if (/^writing-/.test(view || '')) return 'writing';
    if (/^listening-/.test(view || '')) return 'listening';
    for (const s of Wo) if (testId && (L[s] || []).some((x) => String(x.id) === String(testId))) return s;
    return 'reading';
  };
  Screens['tab:learn'] = {
    title: () => t('ieltsHub.tab.learn'),
    async render(p) {
      const view = p.ieltsView, testId = p.ieltsTest;
      // views without a test (guides, works lists, single work) are owned by the writing/speaking modules
      if (/-work$/.test(view || '') && p.ieltsWork && Screens['learn:' + view]) return Screens['learn:' + view].render(p);
      if (!testId && Screens['learn:' + view]) return Screens['learn:' + view].render(p);
      const data = await loadLists();
      if (testId) {
        const skill = VIEW_SKILL(view, testId, data.L);
        if (Screens[`learn:${skill}-task`]) return Screens[`learn:${skill}-task`].render(p, data);
        return RL.taskCard(p, { skill, back: { tab: 'learn', view } });
      }
      if (view === 'practice-list' && p.ieltsList) return practiceList(data, p.ieltsList);
      const so = skillOf(view);
      if (so) return skillPage(data, so.skill, so.tab);
      return catalog(data);
    },
  };
  window.Practice = { loadLists, Wc, Wf, skillOf, WA, WT, levelLine, crumbs, learnHref };
})();
