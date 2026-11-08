// «Сегодня» — ai-tutor Today dashboard (Br): programme path, goal/band hero (O2),
// today's tasks (Bt), Зона роста (Bs), Контроль недели (Ba).
(function () {
  const { h, icon } = DOM;
  const SRC = (x) => (String(x?.source || '').startsWith('full_') ? 'full' : x?.source === 'diagnostic' ? 'diagnostic' : 'sections');
  const VARIANTS = { gapSkill: 3, gap: 3, keep: 3, reached: 3, noDate: 2, tomorrow: 2, today: 2, checking: 2 };

  // «Указать дату» flow — as on ai-tutor it opens the onboarding questionnaire (exam date step).
  window.GoalDialog = { open() { Router.go({ screen: 'ielts-onboarding', step: 'date' }); } };

  function startStep(profile) {
    if (!profile) return null;
    const step = !profile.onboarded ? 'onboarding' : profile.bands?.overall == null ? 'diagnostic' : !profile.route ? 'route' : null;
    if (!step) return null;
    const screen = { onboarding: 'ielts-onboarding', diagnostic: 'ielts-diagnostic', route: 'ielts-route' }[step];
    return h('section', { class: 'card card--brand row row--between' },
      h('div', { class: 'grow' }, h('b', null, t(`ieltsOb.start.${step}.title`)), h('p', { class: 'small muted' }, t(`ieltsOb.start.${step}.text`))),
      h('a', { class: 'btn btn--primary', href: Router.href({ screen }) }, t(`ieltsOb.start.${step}.cta`), icon('arrowR')));
  }

  // ---------- [C] goal / band hero ----------
  function goalCard(data, rnd) {
    const m = data.programme, j = data.journey || {};
    const deadline = m?.deadline;
    const base = j.baseline || null, cur = j.current || null, target = j.target ?? data.targetBand ?? null;
    const reached = cur && target != null && cur.score >= target;
    const state = deadline?.state || 'none';
    const isEmpty = !base && !cur;
    const srcLabel = (x) => t('ieltsGoal.src.' + SRC(x));
    const growthSkill = data.growthZone?.skill;

    let k = isEmpty ? 'noScore' : j.checking ? 'checking' : reached ? 'reached' : state === 'tomorrow' ? 'tomorrow' : state === 'today' ? 'today' : state === 'none' ? 'noDate' : state === 'passed' ? 'passed' : cur && target != null ? (growthSkill ? 'gapSkill' : 'gap') : 'keep';
    const n = VARIANTS[k] || 1, hIdx = Math.min(n - 1, Math.floor(rnd * n));
    const vars = { source: cur ? srcLabel(cur) : '', gap: cur && target != null ? (target - cur.score).toFixed(1) : '', skill: Hub.SKILL_NAME[growthSkill] || growthSkill };
    const phrase = t(hIdx === 0 ? `ieltsGoal.say.${k}` : `ieltsGoal.say.${k}.${hIdx + 1}`, vars);

    const fmt = (d) => Hub.fmtDate(d);
    let title, dateEl;
    const editBtn = (label, cls = 'btn btn--secondary btn--sm') => h('button', { class: cls, type: 'button', onclick: (e) => { e.stopPropagation(); GoalDialog.open(); } }, icon('calendar'), label);
    if (reached) { title = t('ieltsGoal.title.reached'); dateEl = h('span', { class: 'muted small' }, `${srcLabel(cur)} · ${fmt(cur.date)}`); }
    else if (state === 'none') { title = t('ieltsGoal.title.noDate'); dateEl = editBtn(t('ieltsGoal.setDate')); }
    else if (state === 'passed') { title = t('ieltsGoal.title.passed'); dateEl = h('span', { class: 'row' }, h('span', { class: 'muted small' }, fmt(deadline.examDate)), editBtn(t('ieltsGoal.updateGoal'))); }
    else {
      title = state === 'today' ? t('ieltsGoal.title.today') : state === 'tomorrow' ? t('ieltsGoal.title.tomorrow') : I18n.tp('ieltsGoal.title.days', deadline.daysRemaining);
      dateEl = h('span', { class: 'row' }, h('span', { class: 'muted small' }, fmt(deadline.examDate)),
        h('button', { class: 'icon-btn icon-btn--hero', type: 'button', 'aria-label': t('ieltsGoal.editDate'), onclick: (e) => { e.stopPropagation(); GoalDialog.open(); } }, icon('writing')));
    }
    const score = (x) => (x ? (x.estimate ? '≈' : '') + Number(x.score).toFixed(1) : '—');
    // position of "now" on the start→target scale
    const lo = base ? base.score : 0, hi = target ?? 9;
    const pct = cur ? Math.max(0, Math.min(100, ((cur.score - lo) / ((hi - lo) || 1)) * 100)) : 0;
    const gained = cur && base ? cur.score - base.score : 0;
    const left = cur && target != null ? Math.max(0, target - cur.score) : null;
    const ticks = []; for (let v = Math.ceil(lo * 2) / 2; v <= hi + 1e-9; v += 0.5) ticks.push(v);

    return h('section', { class: 'hero goal-hero', 'aria-label': t('ieltsGoal.aria') },
      h('p', { class: 'goal-hero__say' }, phrase),
      h('div', { class: 'stack-sm' }, h('h2', null, title), dateEl),
      h('div', { class: 'gscale' + (isEmpty ? ' is-empty' : '') + (reached ? ' is-reached' : '') },
        h('ol', { class: 'gscale__stats' },
          h('li', { class: 'gstat' }, h('small', null, t('ieltsGoal.start')),
            h('b', { class: 'num', title: base?.estimate ? t('ieltsOb.shortEstimateShort') : null }, score(base))),
          h('li', { class: 'gstat gstat--now' }, h('small', { class: j.checking ? 'is-checking' : '' }, isEmpty ? t('ieltsGoal.noScore') : j.checking ? t('ieltsGoal.checking') : t('ieltsGoal.now')),
            h('b', { class: 'num' }, score(cur)),
            gained > 0 && h('span', { class: 'gstat__hint' }, t('ieltsGoal.gained', { n: gained.toFixed(1) }))),
          h('li', { class: 'gstat gstat--goal' }, h('small', null, t('ieltsGoal.goal')),
            h('b', { class: 'num' }, target != null ? Number(target).toFixed(1) : '—'),
            left != null && h('span', { class: 'gstat__hint' }, left > 0 ? t('ieltsGoal.left', { n: left.toFixed(1) }) : t('ieltsGoal.reachedShort')))),
        h('div', { class: 'gscale__track', 'aria-hidden': 'true' },
          h('div', { class: 'hero-bar' }, h('i', { style: { width: pct + '%' } })),
          ticks.map((v, i) => h('span', { class: 'gscale__tick' + (v % 1 ? ' is-half' : ''), style: { left: ((v - lo) / ((hi - lo) || 1)) * 100 + '%' } }, (i === 0 || i === ticks.length - 1 || (v % 1 === 0 && v - lo >= 1 && hi - v >= 1)) && h('small', { class: 'num' }, i === 0 || i === ticks.length - 1 ? v.toFixed(1) : v))),
          !isEmpty && h('span', { class: 'gscale__knob', style: { left: pct + '%' } }))),
      h('div', null, isEmpty
        ? h('a', { class: 'link', href: Router.href({ screen: 'ielts-diagnostic' }) }, t('ieltsGoal.toDiagnostic'), ' →')
        : h('a', { class: 'link', href: Router.href({ screen: 'ielts', ieltsTab: 'progress' }) }, t('ieltsGoal.moreProgress'), ' →')));
  }

  // ---------- [D] today's tasks ----------
  function taskRow(task, primary, reload) {
    const done = task.status === 'completed';
    const kindLabel = ['t1', 't2', 'pair', 'p1', 'p2', 'run'].includes(task.kind) ? t('ieltsToday.ai') : ['guide', 'sg', 'ideas'].includes(task.kind) ? t('ieltsToday.theory') : t('ieltsToday.practice');
    return h('li', { class: 'ttask' + (primary ? ' is-primary' : '') + (done ? ' is-done' : '') },
      Hub.plate(task.sec, 44),
      h('div', { class: 'grow' },
        h('div', { class: 'item__title' }, Hub.taskTitle(task)), Hub.teacherNote(task),
        h('div', { class: 'item__meta' }, h('span', null, `${Hub.minutes(task.minutes)} · ${kindLabel}`),
          task.origin === 'teacher' ? Hub.originBadge(task) : h('span', { class: 'badge' }, t('ieltsToday.mode.' + (task.mode || 'self_study'))),
          task.overdue && !done && h('span', { class: 'badge badge--warn' }, t('ieltsPlan.status.overdue')))),
      done ? h('span', { class: 'badge badge--ok' }, icon('check', 'ic12'), t('ieltsPlan.status.completed'))
        : h('div', { class: 'item__side' },
          task.completionRule === 'self_report' && h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: async () => { await Api.markPlanTask(task.id, true).catch(() => null); reload(); } }, t('ieltsPlan.markDone')),
          h('a', { class: 'btn btn--sm ' + (primary ? 'btn--primary' : 'btn--secondary'), href: Hub.routeHref(Hub.taskRoute(task)) },
            task.status === 'in_progress' || primary ? t('ieltsPlan.continue') : t('ieltsPlan.start'))));
  }
  function recommended(items, noPlan) {
    if (!items?.length) return null;
    return h('section', { class: 'stack-sm' }, h('h3', null, noPlan ? t('ieltsPlan.rec.titleNoPlan') : t('ieltsPlan.rec.title')),
      h('ul', { class: 'list plain' }, items.map((it) => h('li', { class: 'item' }, h('b', { class: 'grow' }, t('ieltsPlan.rec.' + it.key)),
        h('a', { class: 'btn btn--secondary btn--sm', href: Hub.routeHref(Hub.taskRoute({ ...it, recommend: true })) }, t('ieltsPlan.rec.start'), icon('arrowR'))))));
  }
  function todayTasks(m, reload) {
    const tasks = m?.tasks || [];
    const noPlan = !m?.enrollment || m.enrollment.status === 'programme_pending';
    const live = m?.enrollment?.studyMode === 'live';
    const left = tasks.filter((x) => x.status !== 'completed').reduce((s, x) => s + (x.minutes || 0), 0);
    const firstOpen = tasks.findIndex((x) => x.status !== 'completed');
    return h('section', { class: 'card stack', 'aria-labelledby': 'tt-title' },
      h('header', { class: 'section-head', style: { marginBottom: 0 } },
        h('div', null, h('h2', { id: 'tt-title' }, t('ieltsToday.title')),
          !noPlan && h('p', { class: 'small muted' }, t('ieltsToday.summary', { week: m.currentWeek ?? 1, n: tasks.length, min: 5 * Math.round(left / 5) }))),
        !noPlan && h('a', { class: 'link', href: Router.href({ screen: 'ielts', ieltsTab: 'plan' }) }, t('ieltsToday.allPlan'), ' →')),
      noPlan ? h('p', { class: 'muted' }, t('ieltsPlan.pending.' + (m?.enrollment?.pendingReason || 'no_diagnostic')))
        : h('ul', { class: 'list plain' }, tasks.map((x, i) => taskRow(x, !live && i === firstOpen, reload)),
          !tasks.length && !(m.recommended || []).length && h('li', { class: 'muted' }, t('ieltsPlan.allDone'))),
      !tasks.length && recommended(m?.recommended, noPlan),
      h('p', { class: 'notice row' }, icon('clock', 'ic16'), live ? t('ieltsToday.hintLive') : t('ieltsToday.hintSelf')));
  }

  // ---------- [E] growth zone ----------
  function growth(g) {
    let title, text;
    if (!g) { title = t('ieltsToday.growth.noneTitle'); text = t('ieltsToday.growth.noneText'); }
    else if (g.kind === 'criterion') { title = t('ieltsToday.crit.' + g.key) || g.key; text = t('ieltsToday.growth.criterion', { skill: g.skill === 'writing' ? 'Writing' : 'Speaking' }); }
    else { title = RL.typeLabel(g.key) !== g.key ? RL.typeLabel(g.key) : Hub.cap(String(g.key).replace(/_/g, ' ')); text = t('ieltsToday.growth.type', { skill: g.skill === 'reading' ? 'Reading' : 'Listening', correct: g.correct, total: g.total }); }
    return h('section', { class: 'card card--accent stack', 'aria-labelledby': 'gz-title' },
      h('div', { class: 'eyebrow', id: 'gz-title' }, t('ieltsToday.growth.title')),
      h('div', { class: 'row', style: { alignItems: 'flex-start', flexWrap: 'nowrap' } }, Hub.plate(g?.skill || 'writing', 40),
        h('div', { class: 'grow' }, h('h2', null, title), h('p', { class: 'small muted', style: { marginTop: '4px' } }, text))),
      h('div', null, h('a', { class: 'btn btn--secondary', href: Hub.routeHref(Hub.growthRoute(g)) }, t('ieltsToday.growth.train'), icon('arrowR'))));
  }

  // ---------- [F] weekly control ----------
  function weeklyControl(c) {
    if (!c) return null;
    const ui = c.status === 'completed' ? 'done' : ['available', 'in_progress'].includes(c.status) ? 'open' : c.status === 'missed' ? 'late' : 'wait';
    const kind = { done: 'ok', open: 'info', late: 'warn', wait: 'info' }[ui];
    return h('section', { class: 'hero stack', 'aria-label': t('ieltsToday.control.aria') },
      h('div', { class: 'row', style: { flexWrap: 'nowrap', alignItems: 'flex-start' } },
        h('span', { class: 'plate plate--control', style: { width: '44px', height: '44px' } }, icon('shield')),
        h('div', { class: 'grow stack-sm' }, h('h2', null, t('ieltsToday.control.' + (c.control || 'weekly'), { n: c.calendarWeek })),
          h('div', { class: 'row', style: { gap: '8px' } }, DOM.statusBadge(kind, t('ieltsPlan.status.' + c.status)),
            h('span', { class: 'small muted' }, ui === 'wait' ? t('ieltsToday.control.opens', { date: Hub.fmtDate(c.date) }) : t('ieltsToday.control.text'))))),
      c.status !== 'completed' && h('div', null, ui === 'wait'
        ? h('button', { class: 'btn btn--primary', type: 'button', disabled: true }, t('ieltsToday.control.start'))
        : h('div', { class: 'row' }, h('a', { class: 'btn btn--primary', href: Hub.routeHref(Hub.taskRoute(c)) }, c.status === 'in_progress' ? t('ieltsPlan.continue') : t('ieltsToday.control.start')),
          c.completionRule === 'self_report' && h('button', { class: 'btn btn--secondary', type: 'button', onclick: async () => { await Api.markPlanTask(c.id, true).catch(() => null); App.render({ keepScroll: true }); } }, t('ieltsPlan.markDone')))),
      h('p', { class: 'small muted' }, t('ieltsToday.control.note')));
  }

  Screens['tab:today'] = {
    title: () => t('ieltsHub.tab.today'),
    async render(p, ctx) {
      const data = await Hub.loadDashboard();
      const m = data.programme, g = m?.enrollment;
      const live = g?.studyMode === 'live';
      const rnd = Math.random();
      const reload = () => App.render({ keepScroll: true });
      return h('div', { class: 'stack today' },
        Hub.pageHead({ title: t('ieltsHub.tab.today') }),
        startStep(data.profile),
        g?.programmeName && h('div', { class: 'progpath' },
          h('span', { class: 'progpath__path' }, g.programmeName.split('→').map((s, i, a) => [h('span', { class: 'progpath__step' }, s.trim()), i < a.length - 1 && h('span', { class: 'progpath__arrow', 'aria-hidden': 'true' }, '→')])),
          h('span', { class: 'badge badge--brand' }, live ? t('ieltsToday.mode.live') : t('ieltsToday.mode.self'))),
        // ai-tutor order: goal hero full width → tasks | growth zone → weekly control full width
        goalCard(data, rnd),
        h('div', { class: 'split' },
          h('div', { class: 'stack' }, todayTasks(m, reload)),
          h('aside', { class: 'stack' }, growth(data.growthZone))),
        weeklyControl(m?.weeklyControl));
    },
  };
})();
