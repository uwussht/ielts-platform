// «Mock-тесты» — ai-tutor By (tab mocks): hero, last attempt, available mocks with section strip,
// freshness tabs, history table; list mode via ieltsMockList=1.
(function () {
  const { h, icon } = DOM;
  const SEC = ['listening', 'reading', 'writing', 'speaking'];
  const state = { fresh: 'fresh' };
  const trackName = I18n.trackName;
  const dateL = (d) => (d ? new Date(d).toLocaleDateString(DOM.locale(), { day: 'numeric', month: 'long' }) : '');
  const added = (m) => (m.createdAt ? t('ieltsPractice.added', { date: Hub.fmtDate(m.createdAt, true) }) : '');

  const Bf = (x) => (x.status === 'aborted' ? 'aborted' : x.status === 'in_progress' ? 'in_progress' : x.partial ? 'checking' : x.overall == null ? 'incomplete' : 'done');
  const CHIP = { done: 'ok', submitted: 'ok', checking: 'info', in_progress: 'warn', aborted: '', not_started: '', incomplete: '' };
  const CHIP_IC = { done: 'check', submitted: 'check', aborted: 'close', not_started: 'clock' };
  const chip = (s) => h('span', { class: 'badge' + (CHIP[s] ? ' badge--' + CHIP[s] : '') }, icon(CHIP_IC[s] || 'clock', 'ic12'), t('ieltsMt.status.' + s));

  const SEC_MAP = { done: 'done', practiced: 'done', checking: 'checking', failed: 'bad', missing: 'bad' };
  function strip(sections = {}) {
    const n = SEC.filter((s) => ['done', 'practiced'].includes(sections[s])).length;
    return h('div', { class: 'mtsec', 'aria-label': t('ieltsMt.sections') },
      h('span', { class: 'mtsec__sum small muted' }, t('ieltsMt.secDone', { n, total: 4 })),
      h('ul', { class: 'plain mtsec__list' }, SEC.map((s) => {
        const v = sections[s], k = SEC_MAP[v] || 'todo';
        return h('li', { class: 'mtsec__s is-' + k }, Hub.plate(s, 28),
          h('span', null, h('b', null, Hub.SKILL_NAME[s]), h('small', null, k === 'done' && icon('check', 'ic12'), t('ieltsMt.sec.' + (['done', 'practiced', 'checking', 'failed', 'missing'].includes(v) ? v : 'pending')))));
      })));
  }
  const sessionHref = (id, view) => Router.href({ screen: 'ielts-mock', sessionId: String(id), view: view || null });
  const mockHref = (id) => Router.href({ screen: 'ielts-mock', mockId: id });
  const mockAction = (m) => (m.status === 'in_progress' && m.sessionId
    ? h('a', { class: 'btn btn--primary btn--sm', href: sessionHref(m.sessionId) }, t('ieltsMt.continue'))
    : h('a', { class: 'btn btn--secondary btn--sm', href: mockHref(m.id) }, t('ieltsMt.more')));
  function histAction(x) {
    const s = Bf(x);
    if (s === 'aborted') return h('span', { class: 'muted' }, '—');
    const label = s === 'done' || s === 'incomplete' ? t('ieltsMt.col.review') : s === 'in_progress' ? t('ieltsMt.continue') : t('ieltsMt.col.state');
    return h('a', { class: 'link', href: sessionHref(x.id, s === 'in_progress' || s === 'checking' ? null : 'result') }, label, ' →');
  }

  function freshTabs(mocks, freshDays, rerender) {
    if (!mocks.some((m) => m.fresh === false)) return null;
    const nf = mocks.filter((m) => m.fresh !== false).length, no = mocks.length - nf;
    return h('div', { class: 'row' },
      Hub.seg([['fresh', `${t('ieltsMt.fresh.fresh')} · ${nf}`], ['old', `${t('ieltsMt.fresh.old')} · ${no}`]], state.fresh, (v) => { state.fresh = v; rerender(); }, { small: true, label: t('ieltsMt.fresh.label') }),
      h('span', { class: 'xs muted' }, t('ieltsMt.fresh.hint', { n: freshDays || 30 })));
  }

  function view(data, tr, listMode, rerender) {
    const module = tr === 'general' ? 'general' : 'academic';
    const mocks = data.mocks || [];
    const H = (data.history || []).filter((x) => !x.module || x.module === module);
    const lastDone = H.find((x) => x.status === 'submitted');
    const hasOld = mocks.some((m) => m.fresh === false);
    const tab = state.fresh === 'fresh' && hasOld && !mocks.some((m) => m.fresh !== false) ? 'old' : state.fresh;
    const shown = hasOld ? mocks.filter((m) => (tab === 'old' ? m.fresh === false : m.fresh !== false)) : mocks;
    const head = Hub.pageHead({ title: t('ieltsMt.title'), sub: t('ieltsMt.sub', { track: trackName(tr) }) });

    if (listMode) {
      return h('div', { class: 'stack' },
        h('a', { class: 'link', href: Router.href({ screen: 'ielts', ieltsTab: 'mocks' }) }, '← ' + t('ieltsMt.title')), head,
        h('h2', null, t('ieltsMt.available')), freshTabs(mocks, data.freshDays, rerender),
        shown.length ? h('div', { class: 'mtl' }, shown.map((m) => h('article', { class: 'card stack-sm' },
          h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, h('span', { class: 'plate plate--mock', style: { width: '44px', height: '44px' } }, icon('mock')),
            h('span', { class: 'grow' }, h('b', null, m.title), ' ', chip(m.status)), mockAction(m)),
          h('div', { class: 'row small muted' }, icon('clock', 'ic16'), t('ieltsMt.hero.time'), m.createdAt && ' · ' + added(m)),
          strip(m.sections)))) : h('p', { class: 'muted' }, t('ieltsMt.empty')),
        H.length > 0 && [h('h2', null, t('ieltsMt.history')), h('div', { class: 'mtl' }, H.map((x) => h('article', { class: 'card stack-sm' },
          h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, h('span', { class: 'plate plate--mock', style: { width: '40px', height: '40px' } }, icon('mock')),
            h('span', { class: 'grow' }, h('b', null, x.title), ' ', chip(Bf(x))), histAction(x)),
          h('dl', { class: 'mtl__result' }, h('dt', null, t('ieltsMt.col.date')), h('dd', null, dateL(x.finishedAt || x.startedAt)),
            h('dt', null, t('ieltsMt.col.score')), h('dd', { class: x.overall == null ? 'muted' : 'num' }, x.overall != null ? Number(x.overall).toFixed(1) : '—')))))]);
    }

    const open = data.open;
    return h('div', { class: 'stack' }, head,
      h('div', { class: 'split mt-top' },
        h('section', { class: 'hero stack mt-hero' },
          h('span', { class: 'badge badge--brand', style: { justifySelf: 'start' } }, t('ieltsMt.hero.badge')),
          h('h2', { class: 'mt-hero__title' }, t('ieltsMt.hero.title')),
          h('p', { class: 'mt-flow' }, SEC.map((s, i) => [i > 0 && icon('chevronR', 'ic16'), Hub.SKILL_NAME[s]])),
          h('p', { class: 'row', style: { gap: '8px', margin: 0 } }, icon('clock', 'ic16'), h('b', null, t('ieltsMt.hero.time'))),
          h('p', { class: 'small', style: { color: 'var(--hero-muted)', margin: 0 } }, t('ieltsMt.hero.fine')),
          (open || mocks.length > 0) && h('div', null, open
            ? h('a', { class: 'btn btn--primary btn--lg', href: sessionHref(open.id) }, t('ieltsMt.hero.continue', { name: open.title }), icon('arrowR'))
            : h('a', { class: 'btn btn--primary btn--lg', href: Router.href({ screen: 'ielts', ieltsTab: 'mocks', ieltsMockList: '1' }) }, t('ieltsMt.hero.pick'), icon('arrowR')))),
        h('aside', { class: 'card stack-sm' }, h('h2', null, t('ieltsMt.last.title')),
          lastDone ? [
            h('span', { class: 'small muted' }, `${lastDone.title} · ${dateL(lastDone.finishedAt)}`),
            h('div', { class: 'row', style: { alignItems: 'baseline' } }, h('b', { class: 'mt-band num' }, lastDone.overall != null ? Number(lastDone.overall).toFixed(1) : '—'),
              h('span', { class: 'small muted' }, lastDone.overall != null ? t('ieltsMt.last.platform') : lastDone.partial ? t('ieltsMt.last.checking') : t('ieltsMt.last.incomplete'))),
            h('div', { class: 'mt-skills' }, (lastDone.sections || []).map((s) => h('span', { class: 'mt-skill' }, h('small', null, { listening: 'L', reading: 'R', writing: 'W', speaking: 'S' }[s.name] || s.name), h('b', { class: 'num' }, s.band != null ? Number(s.band).toFixed(1) : '—')))),
            h('a', { class: 'link', href: sessionHref(lastDone.id, 'result') }, t('ieltsMt.last.review'), ' →')]
            : h('p', { class: 'muted small' }, t('ieltsMt.last.none')))),
      h('h2', null, t('ieltsMt.available')), freshTabs(mocks, data.freshDays, rerender),
      shown.length ? h('div', { class: 'mt-cards' }, shown.map((m) => h('article', { class: 'card stack-sm' },
        h('div', { class: 'row', style: { flexWrap: 'nowrap', alignItems: 'flex-start' } }, h('span', { class: 'plate plate--mock', style: { width: '44px', height: '44px' } }, icon('mock')),
          h('span', { class: 'grow stack-sm' }, h('b', null, m.title), h('span', { class: 'row', style: { gap: '6px' } }, chip(m.status), m.createdAt && h('small', { class: 'muted' }, added(m)))),
          mockAction(m)),
        strip(m.sections)))) : h('p', { class: 'muted' }, t('ieltsMt.empty')),
      H.length > 0 && [h('h2', null, t('ieltsMt.history')),
        h('div', { class: 'card table-wrap' }, h('table', { class: 'table' },
          h('thead', null, h('tr', null, ['test', 'date', 'status', 'score', 'review'].map((c) => h('th', { scope: 'col' }, t('ieltsMt.col.' + c))))),
          h('tbody', null, H.map((x) => h('tr', null, h('td', null, h('b', null, x.title)), h('td', null, dateL(x.finishedAt || x.startedAt)), h('td', null, chip(Bf(x))),
            h('td', null, h('b', { class: 'num' }, x.overall != null ? Number(x.overall).toFixed(1) : '—')), h('td', null, histAction(x)))))))]);
  }

  Screens['tab:mocks'] = {
    title: () => t('ieltsMt.title'),
    async render(p) {
      const tr = App.track();
      const data = await Api.mocks(tr === 'general' ? 'general' : 'academic');
      const host = h('div');
      const rerender = () => host.replaceChildren(view(data, tr, p.ieltsMockList === '1', rerender));
      rerender();
      return host;
    },
  };
})();
