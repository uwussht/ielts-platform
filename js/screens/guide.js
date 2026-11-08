// «Об экзамене» — IELTS reference (ieltsGuideV + exam-info data from ai-tutor).
(function () {
  const { h, icon } = DOM;
  const SKILLS = ['listening', 'reading', 'writing', 'speaking'];
  const PARTS = {
    listening: [['p1', 'text'], ['p2', 'text'], ['p3', 'text'], ['p4', 'text']],
    reading: [['t1', 'track'], ['t2', 'track'], ['t3', 'track']],
    writing: [['task1', 'track'], ['task2', 'text']],
    speaking: [['p1', 'text'], ['p2', 'text'], ['p3', 'text']],
  };
  const SKILL_NAME = { listening: 'Listening', reading: 'Reading', writing: 'Writing', speaking: 'Speaking' };
  const PRACTICE_VIEW = { listening: 'listening', reading: 'reading', writing: 'writing', speaking: 'speaking' };

  let viewTrack = null; // reference-only track switch; doesn't change the programme

  function info() { const I = window.IELTS_EXAM_INFO; return { I, x: I.text[I18n.lang] || I.text.ru }; }
  const fill = (s, v) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m));

  function accordion(title, body, open = false, ic = null) {
    const id = 'acc-' + Math.random().toString(36).slice(2, 8);
    const panel = h('div', { id, class: 'acc__body', hidden: !open }, body);
    const btn = h('button', { class: 'acc__head', type: 'button', 'aria-expanded': String(open), 'aria-controls': id, onclick: () => {
      const o = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!o)); panel.hidden = o;
    } }, h('span', { class: 'acc__title' }, ic && icon(ic, 'ic16'), title), icon('chevronD', 'acc__chev'));
    return h('div', { class: 'acc' }, btn, panel);
  }

  // Quick answers built from the exam-info module (inline accordions, as in ai-tutor).
  function quick(kind, track) {
    const { I, x } = info();
    const trackName = I18n.trackName(track);
    const list = (arr) => h('ul', { class: 'bul' }, arr.map((s) => h('li', null, s)));
    let body;
    if (kind === 'band') {
      const tbl = (rows) => h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('thead', null, h('tr', null, h('th', null, x.band.raw), h('th', null, x.band.band))),
        h('tbody', null, rows.map(([a, b, band]) => h('tr', null, h('td', null, a === b ? a : `${a}–${b}`), h('td', { class: 'num' }, DOM.band(band)))))));
      body = [h('p', null, x.band.intro), h('p', null, x.band.lr),
        h('div', { class: 'grid-2' },
          h('div', null, h('h3', null, 'Listening'), tbl(I.bandTables.listening)),
          h('div', null, h('h3', null, fill(x.band.reading, { track: trackName })), tbl(track === 'general' ? I.bandTables.readingGT : I.bandTables.readingAC))),
        h('p', { class: 'xs muted' }, x.approx), h('p', null, x.band.ws), h('p', { class: 'small' }, x.band.wCrit), h('p', { class: 'small' }, x.band.sCrit)];
    } else if (kind === 'diff') {
      const rows = ['purpose', 'listening', 'reading', 'readingScore', 'writing1', 'writing2', 'speaking'];
      body = [h('p', null, x.diff.intro), h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('thead', null, h('tr', null, h('th', null, x.diff.col.what), h('th', null, I18n.trackName('academic')), h('th', null, I18n.trackName('general')))),
        h('tbody', null, rows.map((k) => { const r = x.diff[k]; return h('tr', null, h('td', null, h('strong', null, r.name)), r.same ? h('td', { colspan: 2 }, r.same) : [h('td', null, r.ac), h('td', null, r.gt)]); })))),
        h('p', { class: 'small muted' }, fill(x.diff.mine, { track: trackName }))];
    } else if (kind === 'reg') {
      body = [h('p', null, x.reg.intro),
        h('div', { class: 'row' },
          h('a', { class: 'btn btn--secondary btn--sm', href: I.links.idp, target: '_blank', rel: 'noopener' }, 'IDP ↗'),
          h('a', { class: 'btn btn--secondary btn--sm', href: I.links.britishCouncil, target: '_blank', rel: 'noopener' }, 'British Council ↗')),
        h('h3', null, x.reg.stepsTitle), h('ol', { class: 'bul' }, Object.keys(x.reg.step).map((k) => h('li', null, fill(x.reg.step[k], { track: trackName })))),
        h('p', { class: 'small muted' }, x.reg.noPrices),
        h('h3', null, x.reg.formatsTitle), h('p', null, h('strong', null, x.reg.cd.title), ' — ', x.reg.cd.text), h('p', null, h('strong', null, x.reg.paper.title), ' — ', x.reg.paper.text),
        h('p', null, h('strong', null, x.reg.osr.title), ' — ', x.reg.osr.text)];
    } else if (kind === 'day') {
      const d = x.day;
      body = Object.entries(d).map(([k, v]) => typeof v === 'string' ? (/Title$/.test(k) ? h('h3', null, v) : h('p', null, v))
        : Array.isArray(v) ? list(v) : h('div', { class: 'stack-sm' }, Object.values(v).map((s) => typeof s === 'string' ? h('p', null, '• ' + s) : null)));
    }
    return [].concat(body);
  }

  Screens['tab:info'] = {
    title: () => t('app.nav.about'),
    render(p) {
      const track = viewTrack || State.track;
      const skill = SKILLS.includes(p.skill) ? p.skill : 'listening';
      const { x } = info();
      const trk = track === 'general' ? 'gt' : 'ac';

      const faqView = p.skill === 'faq';
      const card = (key, title, sub, plate) => h('button', { class: 'gpick', type: 'button', 'aria-pressed': String(faqView ? key === 'faq' : key === skill),
        onclick: () => Router.patch({ skill: key }, { replace: true, keepScroll: true }) }, plate, h('span', { class: 'gpick__txt' }, h('b', null, title), h('small', null, sub)));
      const QICON = { band: 'target', diff: 'globe', reg: 'calendar', day: 'check' };

      let body;
      if (faqView) {
        body = [h('h2', null, t('ieltsGuideV.faq')),
          h('div', { class: 'gacc' }, ['band', 'diff', 'reg', 'day'].map((k) => accordion(t('ieltsGuideV.q.' + k), h('div', { class: 'stack' }, quick(k, track)), false, QICON[k])),
            accordion(t('ieltsGuideV.faqMore'), h('div', { class: 'gacc' }, Object.values(x.faq).map((f) => accordion(f.q, h('p', null, f.a)))), false, 'about'))];
      } else {
        const both = PARTS[skill].every(([, mode]) => mode !== 'track');
        const crit = t('ieltsGuideV.crit.' + skill).split('|');
        body = [h('h2', null, SKILL_NAME[skill], h('span', { class: 'gtrack' }, ' · ' + (both ? t('ieltsGuideV.bothTracks') : I18n.trackName(track)))),
          h('ol', { class: 'gparts' }, PARTS[skill].map(([id, mode], i) => {
            const base = `ieltsGuideV.part.${skill}.${id}`;
            return h('li', null, h('span', { class: 'gparts__n num', 'aria-hidden': 'true' }, i + 1),
              h('span', null, h('b', null, t(base + '.name')), h('small', null, mode === 'track' ? t(`${base}.${trk}`) : t(base + '.text'))));
          })),
          h('div', { class: 'gacc' },
            accordion(t('ieltsGuideV.critTitle'), h('ul', { class: 'bul' }, crit.map((c) => h('li', null, c))), true, 'progress'),
            accordion(t('ieltsGuideV.timeTitle'), h('p', null, t('ieltsGuideV.time.' + skill)), false, 'clock')),
          h('div', null, h('a', { class: 'btn btn--primary', href: Router.href({ screen: 'ielts', ieltsTab: 'learn', ieltsView: PRACTICE_VIEW[skill] }) },
            t('ieltsGuideV.toPractice', { skill: SKILL_NAME[skill] }), icon('arrowR')))];
      }

      return h('div', { class: 'stack guide' },
        h('div', { class: 'ghead' },
          h('div', null, h('div', { class: 'ph__eyebrow' }, App.navGroup('info')), h('h1', { class: 'ph__title' }, t('ieltsGuideV.title')), h('p', { class: 'muted' }, t('ieltsGuideV.sub'))),
          h('div', { class: 'ghead__track' },
            h('div', { class: 'seg', role: 'group', 'aria-label': t('ieltsHub.trackLabel') },
              ['academic', 'general'].map((tr) => h('button', { type: 'button', 'aria-pressed': String(track === tr), onclick: () => { viewTrack = tr; App.render({ keepScroll: true }); } }, I18n.trackName(tr)))),
            h('span', { class: 'xs muted' }, icon('about', 'ic12'), ' ', t('ieltsGuideV.trackNote')))),
        h('div', { class: 'gpicks', role: 'group', 'aria-label': t('ieltsGuideV.skills') },
          SKILLS.map((s) => card(s, SKILL_NAME[s], t('ieltsGuideV.skillSub.' + s), Hub.plate(s, 40))),
          card('faq', t('ieltsGuideV.faq'), t('ieltsGuideV.quick'), h('span', { class: 'plate', style: { width: '40px', height: '40px' }, 'aria-hidden': 'true' }, icon('about')))),
        h('section', { class: 'card stack' }, body),
        h('p', { class: 'xs muted' }, icon('about', 'ic12'), ' ', x.disclaimer));
    },
  };
})();
