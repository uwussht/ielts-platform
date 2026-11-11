// «Подробный прогресс» — ai-tutor BM (tab progress): filters, overall + 4 skill cards,
// dynamics chart (yellow series, dashed goal line), frequent errors, work history.
(function () {
  const { h, icon } = DOM;
  const Bj = ['listening', 'reading', 'writing', 'speaking'];
  const BN = { listening: 'L', reading: 'R', writing: 'W', speaking: 'S' };
  const BS = [30, 90, 180, 0];
  const BC = ['all', 'diagnostic', 'full', 'work', 'partial'];
  const B_ = Hub.SKILL_NAME;
  const state = { skill: 'all', period: 90, source: 'all', n: 15, sig: '' };
  const est = () => t('ieltsOb.shortEstimateShort');
  const fmtB = (b, estimate) => (b == null ? '—' : (estimate ? '≈' : '') + Number(b).toFixed(1));

  function chart(points, target) {
    if (!points.length) return h('p', { class: 'muted pg-empty' }, t('ieltsProgressV.noSeries'));
    const vals = points.map((p) => p.overall).concat(target != null ? [target] : []);
    const lo = Math.max(1, Math.floor(2 * Math.min(...vals)) / 2 - 0.5), hi = Math.min(9, Math.ceil(2 * Math.max(...vals)) / 2 + 0.5);
    const N = points.length;
    const x = (i) => (N === 1 ? 200 : 20 + (360 * i) / (N - 1));
    const y = (v) => 10 + ((hi - v) / (hi - lo || 1)) * 140;
    const step = hi - lo > 3 ? 1 : 0.5;
    const ticks = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 0.001; v += step) ticks.push(v);
    const S = (tag, a, ...k) => { const el = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [n, v] of Object.entries(a || {})) if (v != null && v !== false) el.setAttribute(n, v); for (const c of k.flat(3)) if (c != null && c !== false) el.append(c); return el; };
    return h('div', { class: 'pg-chart' }, S('svg', { viewBox: '-30 0 440 204', role: 'img', 'aria-label': t('ieltsProgressV.chartAria') },
      ticks.map((v) => [S('line', { x1: 0, x2: 400, y1: y(v), y2: y(v), class: 'pg-grid' }),
        Math.abs(v - (target ?? -9)) > 0.24 && S('text', { x: -8, y: y(v) + 4, 'text-anchor': 'end', class: 'pg-tick' }, v.toFixed(1))]),
      target != null && [S('line', { x1: 0, x2: 400, y1: y(target), y2: y(target), class: 'pg-goal' }),
        S('text', { x: -8, y: y(target) + 4, 'text-anchor': 'end', class: 'pg-tick is-goal' }, Number(target).toFixed(1))],
      S('path', { d: points.map((p, i) => `${i ? 'L' : 'M'}${x(i)} ${y(p.overall)}`).join(' '), class: 'pg-line' }),
      points.map((p, i) => [S('circle', { cx: x(i), cy: y(p.overall), r: 5, class: 'pg-dot' + (p.source === 'diagnostic' ? ' is-diag' : '') }),
        S('text', { x: x(i), y: y(p.overall) - 10, 'text-anchor': 'middle', class: 'pg-val' }, p.overall.toFixed(1)),
        S('text', { x: x(i), y: 182, 'text-anchor': 'middle', class: 'pg-xl' }, t('ieltsProgressV.src.' + p.source)),
        S('text', { x: x(i), y: 196, 'text-anchor': 'middle', class: 'pg-xd' }, Hub.fmtUTC(p.date))])));
  }

  function openAttempt(r) {
    if (r.skill === 'writing') return Router.href({ screen: 'ielts', ieltsTab: 'learn', ieltsView: 'writing-work', ieltsWork: String(r.id) });
    if (r.skill === 'speaking') return Router.href({ screen: 'ielts', ieltsTab: 'learn', ieltsView: 'speaking-work', ieltsWork: String(r.id) });
    if (r.skill === 'diagnostic') return Router.href({ screen: 'ielts-diagnostic-result', attemptId: String(r.id) });
    return Router.href({ screen: 'ielts-reading-review', attemptId: String(r.id), backTab: 'progress' });
  }
  function trainHref(err) {
    if (err.kind === 'criterion') return Hub.routeHref(Hub.growthRoute(err));
    return Hub.routeHref({ tab: 'learn', view: err.skill === 'listening' ? 'listening-tasks' : 'types' });
  }

  function view(data, dash, me, rerender) {
    const loadedAt = data.loadedAt;
    const sig = `${state.skill}|${state.period}|${state.source}`;
    if (sig !== state.sig) { state.sig = sig; state.n = 15; }
    const since = state.period ? loadedAt - state.period * 864e5 : 0;
    const history = (data.recent || []).filter((r) => (state.skill === 'all' || r.skill === state.skill) && (state.source === 'all' || r.source === state.source) && (!state.period || new Date(r.finishedAt) >= since));
    const series = (data.series || []).filter((s) => (state.skill === 'all' || s.skill === state.skill || s.source === 'diagnostic') && (state.source === 'all' || s.source === state.source) && new Date(s.date) >= since);
    const cur = dash?.journey?.current || null;
    const target = dash?.journey?.target ?? dash?.targetBand ?? null;
    const set = (k, v) => { state[k] = v; rerender(); };
    const periodLabel = (n) => (n ? t('ieltsProgressV.days', { n }) : t('ieltsProgressV.allTime'));
    const select = (label, value, opts, key) => h('label', { class: 'pg-select' }, h('span', null, label),
      h('select', { class: 'input input--sm', onchange: (e) => set(key, key === 'period' ? Number(e.target.value) : e.target.value) },
        opts.map(([v, l]) => h('option', { value: v, selected: String(v) === String(value) }, l))));

    return h('div', { class: 'stack pg' },
      h('a', { class: 'link', href: Router.href({ screen: 'ielts', ieltsTab: 'today' }) }, '← ' + t('ieltsHub.tab.today')),
      Hub.pageHead({ title: t('ieltsProgressV.title'), sub: (me?.programmeName ? me.programmeName + ' · ' : '') + t('ieltsProgressV.sub') }),
      h('div', { class: 'pg-filters' },
        h('span', { class: 'small muted' }, t('ieltsProgressV.skill')),
        Hub.seg([['all', t('ieltsPractice.all')], ...Bj.map((s) => [s, BN[s]])], state.skill, (v) => set('skill', v), { small: true, label: t('ieltsProgressV.skill') }),
        select(t('ieltsProgressV.period'), state.period, BS.map((n) => [n, periodLabel(n)]), 'period'),
        select(t('ieltsProgressV.source'), state.source, BC.map((c) => [c, t('ieltsProgressV.srcAll.' + c)]), 'source')),
      data.error ? h('p', { class: 'muted' }, t('ieltsPlan.errorText')) : [
        h('div', { class: 'pg-cards' },
          h('section', { class: 'hero pg-overall' },
            h('span', { class: 'eyebrow' }, t('ieltsProgressV.overall')),
            h('b', { class: 'pg-big num', title: cur?.estimate ? est() : null }, cur ? fmtB(cur.score, cur.estimate) : '—'),
            h('span', { class: 'small', style: { color: 'var(--hero-muted)' } }, cur ? `${t('ieltsGoal.src.' + (cur.source || 'full'))} · ${Hub.fmtUTC(cur.date, { day: 'numeric', month: 'long' })} · ${t('ieltsProgressV.platform')}` : t('ieltsGoal.say.noScore')),
            cur?.estimate && h('small', { class: 'pg-est' }, est()),
            data.completion && [h('div', { class: 'hero-bar' }, h('i', { style: { width: data.completion.percent + '%' } })),
              h('small', { style: { color: 'var(--hero-muted)' } }, t('ieltsProgressV.programmeShare', { p: data.completion.percent }))]),
          Bj.map((s) => {
            const x = data.skills?.[s] || {};
            const d = x.delta;
            return h('section', { class: 'card pg-skill' },
              h('header', { class: 'row', style: { gap: '10px' } }, Hub.plate(s, 36), h('b', null, B_[s])),
              h('b', { class: 'pg-band num', title: x.estimate ? est() : null }, fmtB(x.band, x.estimate)),
              h('span', { class: 'xs muted' }, x.checking && x.band == null ? t('ieltsGoal.checking') : x.source ? `${t('ieltsProgressV.src.' + x.source)} · ${Hub.fmtUTC(x.date)}` : t('ieltsProgressV.noScore')),
              x.estimate && h('small', { class: 'pg-est' }, est()),
              x.checking ? h('span', { class: 'badge badge--info' }, icon('clock', 'ic12'), t('ieltsGoal.checking'))
                : d != null && h('span', { class: 'badge' + (d > 0 ? ' badge--ok' : '') }, d > 0 && icon('target', 'ic12'), d === 0 ? t('ieltsProgressV.same') : t('ieltsProgressV.delta', { d: (d > 0 ? '+' : '') + d.toFixed(1) })));
          })),
        h('div', { class: 'pg-row' },
          h('section', { class: 'card stack-sm' },
            h('header', { class: 'pg-phead' }, h('div', null, h('h2', null, t('ieltsProgressV.dynamics')), h('span', { class: 'small muted' }, t('ieltsProgressV.dynamicsSub'))),
              h('span', { class: 'pg-legend' }, h('i', { class: 'is-diag' }, t('ieltsProgressV.src.diagnostic')), h('i', { class: 'is-full' }, t('ieltsProgressV.src.full')),
                target != null && h('i', { class: 'is-goal' }, t('ieltsProgressV.goal', { b: Number(target).toFixed(1) })))),
            chart(series, target)),
          h('section', { class: 'card stack-sm' }, h('h2', null, t('ieltsProgressV.errors')),
            data.errors?.length ? h('ul', { class: 'plain pg-errors' }, data.errors.map((e) => h('li', null, h('a', { class: 'prow is-compact', href: trainHref(e) },
              Hub.plate(e.skill, 36),
              h('span', { class: 'prow__body' }, h('b', null, e.kind === 'trap' ? t('ieltsReading.trap.' + e.key) || e.key : t('ieltsToday.crit.' + e.key) || e.key),
                h('small', { class: 'muted' }, `${B_[e.skill]} · ` + (e.kind === 'trap' ? t('ieltsProgressV.errCount', { n: e.count }) : t('ieltsProgressV.critBand', { b: Number(e.band).toFixed(1), n: e.count ?? 0 })))),
              icon('chevronR', 'ic16')))))
              : h('p', { class: 'muted' }, t('ieltsProgressV.noErrors')))),
        h('section', { class: 'card stack-sm' },
          h('header', { class: 'pg-phead' }, h('h2', null, t('ieltsProgressV.history')),
            h('span', { class: 'small muted' }, t('ieltsProgressV.shown', { skill: state.skill === 'all' ? t('ieltsProgressV.allSkills') : B_[state.skill], period: periodLabel(state.period) }))),
          history.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table pg-table' }, h('tbody', null, history.slice(0, state.n).map((r) => h('tr', null,
            h('td', { class: 'pg-d' }, Hub.fmtUTC(r.finishedAt)),
            h('td', null, h('b', null, r.title)),
            h('td', null, h('span', { class: 'pg-type is-' + r.source }, t('ieltsProgressV.type.' + r.source))),
            h('td', { class: 'pg-score num' }, r.band != null ? Number(r.band).toFixed(1) + (r.source === 'work' ? ' · ' + t('review.teacherShort') : '') : ['pending_ai', 'grading', 'pending_review'].includes(r.status) ? t('ieltsGoal.checking') : '—'),
            h('td', null, h('a', { class: 'link', href: openAttempt(r) }, r.source === 'work' ? t('ieltsProgressV.openVersion') : r.source === 'partial' ? t('ieltsPlanV.open') : t('ieltsProgressV.openReview'), ' →')))))))
            : h('p', { class: 'muted' }, t('ieltsProgressV.noHistory')),
          history.length > state.n && h('button', { class: 'btn btn--secondary', type: 'button', onclick: () => { state.n += 15; rerender(); } },
            t('ieltsProgressV.more', { n: Math.min(15, history.length - state.n), total: history.length })))]);
  }

  Screens['tab:progress'] = {
    title: () => t('ieltsHub.tab.progress'),
    async render() {
      const [data, dash, me] = await Promise.all([
        Api.progress().then((d) => ({ ...d, loadedAt: Date.now() })).catch(() => ({ error: true, loadedAt: Date.now() })),
        Api.dashboard().catch(() => null), Api.ieltsMe().catch(() => null)]);
      const host = h('div');
      const rerender = () => host.replaceChildren(view(data, dash, me, rerender));
      rerender();
      return host;
    },
  };
})();
