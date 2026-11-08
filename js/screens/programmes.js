// «Программы» — the course programmes week by week (content/programmes.json,
// built from content/programmes.src.txt). Task titles and links reuse the plan's.
(function () {
  const { h, icon } = DOM;
  const MODES = ['self', '2x30', '3x30', '2x60', '3x60'];
  const SEC_OF = { reading: 'reading', writing: 'writing', speaking: 'speaking', listening: 'listening', vocab: 'vocab' };

  const tasksOf = (p) => p.weekList.flatMap((w) => w.sessions.flat());
  const totalMin = (list) => list.reduce((s, x) => s + (x.minutes || 0), 0);
  const hours = (min) => Math.round(min / 6) / 10;

  function taskRow(task) {
    return h('li', { class: 'prg-task' },
      Hub.plate(SEC_OF[task.sec] || 'reading', 32),
      h('a', { class: 'prg-task__title', href: Hub.routeHref(Hub.taskRoute(task)) }, Hub.taskTitle(task)),
      h('span', { class: 'prg-task__min small muted' }, Hub.minutes(task.minutes)));
  }

  function weekBlock(w, open) {
    const id = 'prg-w' + w.n;
    const list = w.sessions.flat();
    const panel = h('div', { id, class: 'prg-week__body', hidden: !open },
      w.sessions.map((s, i) => h('section', { class: 'prg-session' },
        w.sessions.length > 1 && h('h4', { class: 'prg-session__title' }, t('prog.session', { n: i + 1 })),
        h('ul', { class: 'prg-tasks' }, s.map(taskRow)))));
    const btn = h('button', { class: 'prg-week__head', type: 'button', 'aria-expanded': String(open), 'aria-controls': id, onclick: () => {
      const o = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!o)); panel.hidden = o;
    } },
      h('span', { class: 'prg-week__num' }, w.n),
      h('span', { class: 'grow prg-week__text' },
        h('span', { class: 'prg-week__kicker' }, t('prog.week', { n: w.n }), ' · ', t('prog.month', { n: w.month })),
        h('b', { class: 'prg-week__title' }, w.themes.join(' · '))),
      w.milestone && h('span', { class: 'badge badge--warn' }, t('prog.ms.' + w.milestone)),
      h('span', { class: 'small muted prg-week__meta' }, Hub.minutes(totalMin(list))),
      icon('chevronD', 'acc__chev'));
    return h('div', { class: 'prg-week card' }, btn, panel);
  }

  function summary(p) {
    const list = tasksOf(p);
    return h('section', { class: 'card stack-sm prg-sum' },
      h('div', { class: 'row row--between prg-sum__top' },
        h('div', { class: 'stack-sm' },
          h('h2', { class: 'prg-sum__name' }, p.name),
          h('div', { class: 'row prg-sum__facts' },
            p.band && h('span', { class: 'badge badge--brand' }, t('prog.band', { band: p.band })),
            h('span', { class: 'badge' }, t('prog.weeksN', { n: p.weeks })),
            h('span', { class: 'badge' }, t('prog.tasksN', { n: list.length })),
            h('span', { class: 'badge' }, t('prog.hoursN', { n: hours(totalMin(list)) }))))),
      h('h3', { class: 'prg-sum__h' }, t('prog.durations')),
      p.durations
        ? h('div', { class: 'prg-modes' }, MODES.map((m) => h('div', { class: 'prg-mode' },
          h('span', { class: 'small muted' }, t('prog.mode.' + m)), h('b', null, t('prog.weeksN', { n: p.durations[m] })))))
        : h('p', { class: 'small muted' }, t('prog.noDurations')),
      p.durations && h('p', { class: 'xs muted' }, t('prog.durationNote')));
  }

  Screens.programmes = {
    title: () => t('app.nav.programmes'),
    async render(p) {
      const head = Hub.pageHead({ title: t('prog.title'), sub: t('prog.sub'), eyebrow: App.navGroup('programmes') });
      let data;
      try { data = await Api.programmes(); } catch (e) { return h('div', { class: 'stack' }, head, DOM.errorBox(e, () => App.render())); }
      const list = data?.programmes || [];
      if (!list.length) return h('div', { class: 'stack' }, head, Hub.empty({ icon: 'plan', title: t('prog.loadError') }));
      const cur = list.find((x) => x.id === p.prog) || list[0];
      const weeks = cur.weekList.map((w, i) => weekBlock(w, i === 0));
      const setAll = (open) => weeks.forEach((el) => {
        el.querySelector('.prg-week__head').setAttribute('aria-expanded', String(open));
        el.querySelector('.prg-week__body').hidden = !open;
      });
      return h('div', { class: 'stack prg' }, head,
        h('div', { class: 'chips', role: 'group', 'aria-label': t('prog.pick') }, list.map((x) =>
          h('a', { class: 'chip', href: Router.href({ screen: 'programmes', prog: x.id }), 'aria-pressed': String(x === cur) }, x.name))),
        summary(cur),
        h('div', { class: 'row prg-tools' },
          h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => setAll(true) }, t('prog.expandAll')),
          h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => setAll(false) }, t('prog.collapseAll'))),
        h('div', { class: 'stack-sm' }, weeks));
    },
  };
})();
