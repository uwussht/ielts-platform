// «План» — ai-tutor Plan tab (Wn): roadmap (2 weeks + weekly control), week view, month view,
// selected-day panel, legend. URL: ieltsPlanView=roadmap|week|month, ieltsPlanAt=<week|YYYY-MM-DD>.
(function () {
  const { h, icon } = DOM;
  const VIEWS = ['roadmap', 'week', 'month'];
  const ST_ICON = { done: 'check', started: 'refresh', missed: 'close', control: 'shield', current: 'target', planned: 'clock' };

  function byDate(tasks) { const o = {}; for (const x of tasks) (o[x.date] = o[x.date] || []).push(x); return o; }
  function dayStatus(tasks, date, today) {
    const ts = tasks.filter((x) => x.origin !== 'weekly_control');
    if (!ts.length) return 'rest';
    if (ts.every((x) => x.status === 'completed')) return 'done';
    if (date === today) return 'current';
    if (date < today) return 'missed';
    if (ts.some((x) => x.status === 'completed' || x.status === 'in_progress')) return 'started';
    return 'planned';
  }
  const longDate = (d, opts = { weekday: 'long', day: 'numeric', month: 'long' }) => Hub.cap(Hub.fmtUTC(d, opts));
  const sumMin = (ts) => 5 * Math.round(ts.filter((x) => x.status !== 'completed').reduce((s, x) => s + (x.minutes || 0), 0) / 5);

  function legend() {
    return h('ul', { class: 'legend', 'aria-label': t('ieltsPlanV.legend') },
      ['done', 'current', 'started', 'planned', 'missed', 'control'].map((k) => h('li', null, h('span', { class: 'legend__ic is-' + k }, icon(ST_ICON[k])), t('ieltsPlanV.st.' + k))));
  }

  async function mark(task) { await Api.markPlanTask(task.id, true).catch(() => null); App.render({ keepScroll: true }); }

  function planTask(task, primary) {
    const done = task.status === 'completed';
    return h('li', { class: 'ttask' + (primary ? ' is-primary' : '') },
      Hub.plate(task.sec, 40),
      h('div', { class: 'grow' }, h('div', { class: 'item__title' }, Hub.taskTitle(task)), Hub.teacherNote(task),
        h('div', { class: 'item__meta' }, h('span', null, Hub.minutes(task.minutes) + (task.n > 1 ? ` · ${task.got || 0}/${task.n}` : '')), Hub.originBadge(task))),
      done ? h('span', { class: 'badge badge--ok' }, icon('check', 'ic12'), t('ieltsPlan.status.completed'))
        : h('div', { class: 'item__side' },
          h('a', { class: 'btn btn--sm ' + (primary ? 'btn--primary' : 'btn--secondary'), href: Hub.routeHref(Hub.taskRoute(task)) }, primary || task.status === 'in_progress' ? t('ieltsPlan.continue') : t('ieltsPlanV.open')),
          task.completionRule === 'self_report' && h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => mark(task) }, t('ieltsPlan.markDone'))));
  }

  function dayPanel({ date, weekN, dayN, tasks, control, today, onPrev, onNext, events }) {
    const list = tasks.filter((x) => x.origin !== 'weekly_control');
    const firstOpen = list.findIndex((x) => x.status !== 'completed');
    return h('aside', { class: 'card stack', 'aria-label': t('ieltsPlanV.dayPanel') },
      h('header', { class: 'row row--between' },
        h('div', null, h('h2', null, weekN && dayN ? t('ieltsPlanV.weekDay', { w: weekN, d: dayN }) : longDate(date)),
          weekN && dayN && h('div', { class: 'small muted' }, longDate(date))),
        onPrev !== undefined && h('div', { class: 'row', style: { gap: '6px' } },
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('ieltsPlanV.prevDay'), disabled: !onPrev, onclick: () => onPrev?.() }, icon('arrowL')),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('ieltsPlanV.nextDay'), disabled: !onNext, onclick: () => onNext?.() }, icon('arrowR')))),
      list.length ? [
        h('div', { class: 'row small', style: { gap: '6px' } }, date === today && h('b', null, t('ieltsPlanV.today')), icon('clock', 'ic16'), t('ieltsPlanV.dayLoad', { n: list.length, min: sumMin(list) })),
        h('ul', { class: 'list plain' }, list.map((x, i) => planTask(x, date <= today && i === firstOpen)))]
        : h('p', { class: 'muted' }, t('ieltsPlan.rest')),
      control && [h('hr', { class: 'divider' }),
        h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, h('span', { class: 'plate plate--control', style: { width: '40px', height: '40px' } }, icon('shield')),
          h('div', { class: 'grow' }, h('b', null, t('ieltsPlan.control.' + (control.control || 'weekly'))), h('div', { class: 'small muted' }, longDate(control.date)))),
        h('div', { class: 'row' }, DOM.statusBadge(control.status === 'completed' ? 'ok' : 'info', t('ieltsPlan.status.' + control.status))),
        h('p', { class: 'small muted' }, t('ieltsPlanV.controlText')),
        h('a', { class: 'link', href: Hub.routeHref(Hub.taskRoute(control)) }, t('ieltsPlanV.seeTask'), ' →')],
      events?.length > 0 && [h('hr', { class: 'divider' }), h('b', null, t('ieltsPlanV.events')),
        h('ul', { class: 'list plain' }, events.map((e) => h('li', { class: 'item' }, h('span', { class: 'plate plate--control', style: { width: '32px', height: '32px' } }, icon('shield')),
          h('div', null, h('b', null, (e.control || 'weekly') === 'weekly' ? t('ieltsToday.control.weekly', { n: e.calendarWeek }) : t('ieltsPlan.control.' + e.control)),
            h('div', { class: 'xs muted' }, longDate(e.date, { weekday: 'short', day: 'numeric', month: 'long' }))))))]);
  }

  // ---------- roadmap B9 ----------
  const roadState = { L: null, sel: null, key: null };
  function roadmap(plan, rerender) {
    const tasks = plan.tasks || [], today = plan.today, r = plan.currentWeek || 1, W = plan.enrollment?.calendarWeeks || 1;
    const init = Math.max(1, Math.min(r - 1, W - 1));
    if (roadState.key !== r) { roadState.key = r; roadState.L = init; roadState.sel = null; }
    const L0 = roadState.L;
    const weeks = [L0, L0 + 1].filter((n) => n <= W).map((n) => {
      const wt = tasks.filter((x) => x.calendarWeek === n);
      const control = wt.find((x) => x.origin === 'weekly_control') || null;
      const dates = [...new Set(wt.filter((x) => x.origin !== 'weekly_control').map((x) => x.date))].sort();
      const days = dates.map((d, i) => ({ n: i + 1, date: d, tasks: wt.filter((x) => x.date === d), status: dayStatus(wt.filter((x) => x.date === d), d, today) }));
      const pws = wt.map((x) => x.programmeWeek).filter((x) => x != null);
      const done = days.length > 0 && days.every((d) => d.status === 'done') && (!control || control.status === 'completed');
      return { n, control, days, programmeWeek: pws.length ? Math.min(...pws) : null, done };
    });
    const dates = weeks.flatMap((w) => [...w.days.map((d) => d.date), ...(w.control ? [w.control.date] : [])]);
    if (!roadState.sel || !dates.includes(roadState.sel)) roadState.sel = dates.find((d) => d >= today) || dates.at(-1) || today;
    const sel = roadState.sel;
    const selWeek = weeks.find((w) => w.days.some((d) => d.date === sel) || w.control?.date === sel) || weeks[0];
    const selDay = selWeek?.days.find((d) => d.date === sel);
    const idx = dates.indexOf(sel);
    const pick = (d) => { roadState.sel = d; rerender(); };
    const tbd = byDate(tasks);
    const titles = plan.weekTitles || {};

    return h('div', { class: 'split plan-road' },
      h('section', { class: 'card stack' },
        h('header', { class: 'row' },
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('ieltsPlanV.prevWeeks'), disabled: L0 <= 1, onclick: () => { roadState.L = L0 - 2 >= 1 ? L0 - 2 : 1; rerender(); } }, icon('arrowL')),
          h('div', { class: 'grow' }, h('h2', null, weeks.length > 1 ? t('ieltsPlanV.weeks', { a: weeks[0].n, b: weeks[1].n }) : t('ieltsPlan.week', { n: L0 })),
            h('div', { class: 'xs muted' }, t('ieltsPlanV.programme', { name: plan.enrollment?.programmeName || '' }))),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('ieltsPlanV.nextWeeks'), disabled: L0 + 1 >= W, onclick: () => { roadState.L = Math.min(L0 + 2, W - 1); rerender(); } }, icon('arrowR')),
          h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => { roadState.L = init; roadState.sel = today; rerender(); } }, icon('target'), t('ieltsPlanV.toToday'))),
        weeks.map((w) => h('div', { class: 'road-week' },
          h('div', { class: 'row row--between' }, h('div', null, h('b', null, t('ieltsPlan.week', { n: w.n })),
            titles[w.programmeWeek] && h('span', { class: 'small muted' }, ' · ' + (titles[w.programmeWeek][I18n.lang] || titles[w.programmeWeek].ru))),
            w.done && DOM.statusBadge('ok', t('ieltsPlanV.weekDone'))),
          h('ol', { class: 'road-lane' },
            w.days.map((d) => h('li', { class: 'road-day is-' + d.status + (d.date === sel ? ' is-sel' : '') },
              d.status === 'current' && h('span', { class: 'road-here' }, t('ieltsPlanV.youAreHere')),
              h('button', { type: 'button', 'aria-pressed': String(d.date === sel), 'aria-label': `${t('ieltsPlanV.day', { n: d.n })}: ${t('ieltsPlanV.st.' + d.status)}`, onclick: () => pick(d.date) },
                h('span', { class: 'road-dot' }, ST_ICON[d.status] && ['done', 'started', 'missed'].includes(d.status) ? icon(ST_ICON[d.status]) : null),
                h('span', { class: 'road-label' }, t('ieltsPlanV.day', { n: d.n }))))),
            w.control && h('li', { class: 'road-day is-flag is-' + w.control.status + (w.control.date === sel ? ' is-sel' : '') },
              h('button', { type: 'button', 'aria-pressed': String(w.control.date === sel), onclick: () => pick(w.control.date) },
                h('span', { class: 'road-dot' }, icon('shield')), h('span', { class: 'road-label' }, t('ieltsToday.control.weekly', { n: w.n }))))))),
        h('p', { class: 'small muted' }, selDay?.status === 'current' ? t('ieltsPlanV.say.mid') : t('ieltsPlanV.say.keep')),
        legend()),
      dayPanel({ date: sel, weekN: selWeek?.n, dayN: selDay?.n, tasks: tbd[sel] || [], control: selWeek?.control, today,
        onPrev: idx > 0 ? () => pick(dates[idx - 1]) : null, onNext: idx >= 0 && idx < dates.length - 1 ? () => pick(dates[idx + 1]) : null }));
  }

  // ---------- week view We ----------
  const weekState = { selId: null };
  function weekView(plan, n, setView, rerender) {
    const tasks = plan.tasks || [], today = plan.today, start = plan.enrollment?.startDate || today;
    const W = plan.enrollment?.calendarWeeks || 1;
    const days = Array.from({ length: 7 }, (_, i) => Hub.addDays(start, (n - 1) * 7 + i));
    const tbd = byDate(tasks);
    const inWeek = tasks.filter((x) => days.includes(x.date));
    const def = inWeek.find((x) => x.status !== 'completed' && x.date >= today);
    const selected = inWeek.find((x) => x.id === weekState.selId) || def || null;
    const st = (x) => (x.status === 'completed' ? 'done' : x.origin === 'weekly_control' ? 'control' : x.date === today ? 'current' : x.overdue ? 'missed' : 'planned');
    let picker = false;
    const actions = h('div', { class: 'row' });
    function paintActions() {
      if (!selected || selected.status === 'completed') return actions.replaceChildren();
      const move = selected.origin !== 'weekly_control' && (selected.mode || 'self_study') === 'self_study';
      actions.replaceChildren(
        h('a', { class: 'btn btn--primary', href: Hub.routeHref(Hub.taskRoute(selected)) }, selected.status === 'in_progress' ? t('ieltsPlan.continue') : t('ieltsPlan.start')),
        move && (picker
          ? h('input', { class: 'input', type: 'date', style: { width: 'auto' }, min: today, value: selected.date, 'aria-label': t('ieltsPlan.moveTo'), autofocus: true,
            onchange: async (e) => { picker = false; await Api.put(`/mobile/ielts/plan/tasks/${selected.id}/date`, { date: e.target.value }).catch(() => null); Api.clearCache(); App.render({ keepScroll: true }); },
            onblur: () => { picker = false; paintActions(); } })
          : h('button', { class: 'btn btn--secondary', type: 'button', onclick: () => { picker = true; paintActions(); actions.querySelector('input')?.focus(); } }, icon('calendar'), t('ieltsPlanV.moveTask'))),
        move && h('small', { class: 'muted' }, t('ieltsPlanV.moveNote')));
    }
    paintActions();
    const d1 = Hub.fmtUTC(days[0], { day: 'numeric' }), d7 = Hub.fmtUTC(days[6], { day: 'numeric', month: 'long' });
    return h('div', { class: 'stack' },
      h('div', { class: 'row' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('ieltsPlanV.prevWeek'), disabled: n <= 1, onclick: () => setView('week', String(n - 1)) }, icon('arrowL')),
        h('h2', null, `${d1}–${d7}`),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('ieltsPlanV.nextWeek'), disabled: n >= W, onclick: () => setView('week', String(n + 1)) }, icon('arrowR')),
        h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => setView('week', null) }, icon('target'), t('ieltsPlanV.thisWeek'))),
      h('div', { class: 'week7' }, days.map((d) => {
        const ts = tbd[d] || [];
        return h('section', { class: 'week7__col' + (d === today ? ' is-today' : '') },
          h('header', null, h('span', null, Hub.cap(Hub.fmtUTC(d, { weekday: 'short' }))), h('b', null, Hub.fmtUTC(d, { day: 'numeric' }), ts.some((x) => x.origin === 'weekly_control') && icon('shield', 'ic12'))),
          h('ul', null, ts.length ? ts.map((x) => h('li', null, h('button', { type: 'button', class: 'wcard is-' + st(x) + (selected?.id === x.id ? ' is-sel' : ''), onclick: () => { weekState.selId = x.id; rerender(); } },
            h('b', null, x.sec === 'control' ? t('ieltsPlanV.control') : x.sec === 'vocab' ? t('ieltsPlan.sec.vocab') : Hub.cap(x.sec)),
            h('span', { class: 'xs' }, Hub.taskTitle(x).split(' · ').slice(1).join(' · ') || Hub.taskTitle(x)),
            h('span', { class: 'xs muted' }, Hub.minutes(x.minutes)))))
            : h('li', { class: 'xs muted' }, t('ieltsPlanV.rest'))));
      })),
      selected && h('section', { class: 'card stack-sm' }, h('h3', null, longDate(selected.date)),
        h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, Hub.plate(selected.sec, 40), h('div', { class: 'grow' }, h('b', null, Hub.taskTitle(selected)), Hub.teacherNote(selected),
          h('div', { class: 'item__meta' }, Hub.originBadge(selected) || h('span', { class: 'badge' }, t('ieltsToday.mode.' + (selected.mode || 'self_study'))), h('span', null, t('ieltsPlanV.minutes', { n: selected.minutes }))))),
        actions),
      legend());
  }

  // ---------- month view Wt ----------
  const monthState = { sel: null };
  function monthView(plan, month, setView, rerender) {
    const tasks = plan.tasks || [], today = plan.today;
    const first = month.slice(0, 7) + '-01';
    const offset = (new Date(first + 'T00:00:00Z').getUTCDay() + 6) % 7;
    const start = Hub.addDays(first, -offset);
    const cells = Array.from({ length: 42 }, (_, i) => { const d = Hub.addDays(start, i); return { date: d, inMonth: d.slice(0, 7) === first.slice(0, 7) }; });
    const tbd = byDate(tasks);
    const sel = monthState.sel || today;
    const selWeek = (tbd[sel] || [])[0]?.calendarWeek;
    const weekCtl = tasks.find((x) => x.calendarWeek === selWeek && x.origin === 'weekly_control');
    let events = tasks.filter((x) => (x.origin === 'weekly_control' || x.kind === 'checkpoint') && x.date >= today && x.status !== 'completed').slice(0, 3);
    if (!events.length && weekCtl) events = [weekCtl];
    const DOW = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const rank = (x) => (Hub.originOf(x) === 'homework' ? 0 : Hub.originOf(x) === 'teacher' ? 1 : 2);
    return h('div', { class: 'stack' },
      h('div', { class: 'row' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('ieltsPlanV.prevMonth'), onclick: () => setView('month', Hub.addMonths(month, -1)) }, icon('arrowL')),
        h('h2', null, Hub.cap(Hub.fmtUTC(first, { month: 'long' })) + ' ' + first.slice(0, 4)),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('ieltsPlanV.nextMonth'), onclick: () => setView('month', Hub.addMonths(month, 1)) }, icon('arrowR')),
        h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => { monthState.sel = today; setView('month', null); } }, icon('target'), t('ieltsPlanV.today'))),
      h('div', { class: 'split' },
        h('div', { class: 'card stack' },
          h('div', { class: 'month', role: 'grid' }, DOW.map((d) => h('span', { class: 'month__dow' }, t('ieltsPlanV.dow.' + d))),
            cells.map((c) => {
              const ts = tbd[c.date] || [];
              const ctl = ts.find((x) => x.origin === 'weekly_control' || x.kind === 'checkpoint');
              const reg = ts.filter((x) => x !== ctl).sort((a, b) => rank(a) - rank(b));
              const show = reg.slice(0, ctl ? 1 : 2);
              const more = reg.length - show.length;
              return h('button', { type: 'button', class: 'month__day' + (c.inMonth ? '' : ' is-out') + (c.date === today ? ' is-today' : '') + (c.date === sel ? ' is-sel' : ''), onclick: () => { monthState.sel = c.date; rerender(); } },
                h('span', { class: 'month__n' }, Number(c.date.slice(8))),
                ctl && h('span', { class: 'mchip is-control' }, (ctl.control || 'weekly') === 'weekly' ? t('ieltsPlanV.controlN', { n: ctl.calendarWeek }) : t('ieltsPlan.control.' + ctl.control)),
                show.map((x) => h('span', { class: 'mchip' + (x.status === 'completed' ? ' is-done' : ''), title: Hub.originOf(x) ? Hub.taskTitle(x) : null }, x.sec === 'vocab' ? t('ieltsPlan.sec.vocab') : Hub.cap(x.sec))),
                more > 0 && h('span', { class: 'mchip is-more' }, t('ieltsPlanV.more', { n: more })));
            })),
          legend()),
        dayPanel({ date: sel, tasks: tbd[sel] || [], control: null, today, events })));
  }

  Screens['tab:plan'] = {
    title: () => t('ieltsHub.tab.plan'),
    async render(p) {
      const plan = await Api.plan();
      const view = VIEWS.includes(p.ieltsPlanView) ? p.ieltsPlanView : 'roadmap';
      const g = plan.enrollment || {};
      const live = g.studyMode === 'live';
      const mode = live ? t('ieltsToday.mode.live') : t('ieltsToday.mode.self');
      const setView = (v, at = null) => Router.patch({ ieltsPlanView: v === 'roadmap' ? null : v, ieltsPlanAt: at }, { keepScroll: true });
      const host = h('div');
      const rerender = () => host.replaceChildren(body());

      if (g.status === 'programme_pending') {
        const reason = g.pendingReason || 'no_diagnostic';
        return Hub.empty({ icon: 'clock', title: t('ieltsPlan.pendingTitle'), text: t('ieltsPlan.pending.' + reason),
          action: reason === 'no_diagnostic' && h('a', { class: 'btn btn--primary', href: Router.href({ screen: 'ielts-diagnostic' }) }, t('ieltsPlan.toDiagnostic')) });
      }
      function body() {
        if (view === 'week') {
          const n = Math.min(Math.max(Number(p.ieltsPlanAt) || plan.currentWeek || 1, 1), g.calendarWeeks || 1);
          return weekView(plan, n, setView, rerender);
        }
        if (view === 'month') return monthView(plan, /^\d{4}-\d{2}-\d{2}$/.test(p.ieltsPlanAt || '') ? p.ieltsPlanAt : plan.today, setView, rerender);
        return roadmap(plan, rerender);
      }
      rerender();
      const rec = plan.recommended?.length ? h('section', { class: 'card stack-sm' }, h('h3', null, t('ieltsPlan.rec.title')),
        h('ul', { class: 'list plain' }, plan.recommended.map((it) => h('li', { class: 'item' }, h('b', { class: 'grow' }, t('ieltsPlan.rec.' + it.key)),
          h('a', { class: 'btn btn--secondary btn--sm', href: Hub.routeHref(Hub.taskRoute({ ...it, recommend: true })) }, t('ieltsPlan.rec.start')))))) : null;
      return h('div', { class: 'stack' },
        Hub.pageHead({ title: t('ieltsPlanV.title.' + view),
          sub: view === 'roadmap' ? `${g.programmeName || ''} · ${t('ieltsPlan.week', { n: plan.currentWeek || 1 })} · ${mode}` : `${g.programmeName || ''} · ${mode}`,
          right: Hub.seg(VIEWS.map((v) => [v, t('ieltsPlan.view.' + v)]), view, (v) => setView(v), { label: t('ieltsPlan.viewLabel') }) }),
        view === 'roadmap' && plan.completion && h('div', { class: 'row', role: 'progressbar', 'aria-valuenow': plan.completion.percent, 'aria-valuemin': 0, 'aria-valuemax': 100 },
          h('div', { class: 'progress grow' }, h('i', { style: { width: plan.completion.percent + '%' } })), h('b', null, t('ieltsPlanV.progress', { p: plan.completion.percent }))),
        rec, host);
    },
  };
})();
