// Screen: Staff (?screen=staff) — for teachers, curators, managers and admins, as SAT's #/staff.
// One table of students, each row everything about one student: who they are, when they started,
// their route and bands (start → now → goal), the exam date, the official IELTS results they reported
// with confirm / send back for the ones waiting, their plans and their role.
// A filter shows only the students with a result to confirm. Needs the staff API (server/);
// without it the screen says so.
(function () {
  const { h, icon } = DOM;
  const S = () => Api.staff;
  const fmt = (d) => (d ? Hub.fmtDate(String(d).slice(0, 10)) : '—');
  const bandStr = (v) => (v == null ? '—' : Number(v).toFixed(1));
  const opt = (k, fallback) => (I18n.has(k) ? t(k) : fallback);
  let query = '';
  let onlyPending = false;

  /** The message for a reason the server gave, or the general one. */
  const errText = (reason) => opt('staff.err.' + (reason || 'server'), t('staff.err.server'));
  const failToast = (r) => DOM.toast(errText(r?.reason));

  // ---------- dialogs ----------
  function rejectDialog(onSend) {
    DOM.dialog((close) => {
      const box = h('textarea', { class: 'input', rows: 3, id: 'staff-reject', maxlength: 500 });
      const send = () => { const v = box.value.trim(); if (!v) { box.setAttribute('aria-invalid', 'true'); box.focus(); return; } close(); onSend(v); };
      return h('div', { class: 'stack' },
        h('h2', null, t('staff.reject')),
        h('label', { class: 'stack-sm' }, h('span', { class: 'muted small' }, t('staff.rejectPrompt')), box),
        h('div', { class: 'row staff-dlg__actions' },
          h('button', { class: 'btn btn--ghost', type: 'button', onclick: close }, t('ieltsReading.cancel')),
          h('button', { class: 'btn btn--primary', type: 'button', onclick: send }, t('staff.reject'))));
    });
  }
  function confirmDialog({ title, body, ok, danger }, onYes) {
    DOM.dialog((close) => h('div', { class: 'stack' },
      h('h2', null, title),
      h('p', { class: 'muted' }, body),
      h('div', { class: 'row staff-dlg__actions' },
        h('button', { class: 'btn btn--ghost', type: 'button', onclick: close }, t('ieltsReading.cancel')),
        h('button', { class: 'btn ' + (danger ? 'btn--danger' : 'btn--primary'), type: 'button', onclick: () => { close(); onYes(); } }, ok))));
  }

  // ---------- cells ----------
  function statusBadge(sc) {
    const kind = { pending: 'warn', confirmed: 'ok', rejected: 'danger' }[sc.status];
    return DOM.statusBadge(kind, t('staff.status.' + sc.status));
  }

  /** One official result, with confirm / send back while it waits. */
  function scoreLine(sc, reload) {
    const decide = (status, comment) => S().decide(sc.id, status, comment).then((r) => {
      if (!r.ok) return failToast(r);
      DOM.toast(t('staff.saved')); reload();
    });
    const parts = ['listening', 'reading', 'writing', 'speaking'].filter((k) => sc[k] != null)
      .map((k) => `${Hub.SKILL_NAME[k][0]} ${bandStr(sc[k])}`).join(' · ');
    return h('div', { class: 'staff-score' + (sc.status === 'pending' ? ' is-pending' : '') },
      h('div', { class: 'staff-score__top' },
        h('span', { class: 'small' }, t('staff.score.' + sc.source)),
        h('b', { class: 'num' }, bandStr(sc.overall)),
        statusBadge(sc)),
      h('span', { class: 'xs muted' }, [parts, fmt(sc.date)].filter(Boolean).join(' · ') + (sc.status === 'rejected' && sc.comment ? ` · «${sc.comment}»` : '')),
      sc.status === 'pending' && App.can('scores') && h('div', { class: 'row' },
        h('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: () => decide('confirmed') }, t('staff.confirm')),
        h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => rejectDialog((c) => decide('rejected', c)) }, t('staff.reject'))));
  }

  function plansCell(u) {
    const editable = App.can('plans');
    return h('div', { class: 'stack-sm' }, IELTS_CONFIG.plans.map((pl) => {
      const cb = h('input', { type: 'checkbox', checked: u.plans.includes(pl.id), disabled: !editable });
      cb.addEventListener('change', () => {
        const next = IELTS_CONFIG.plans.map((x) => x.id).filter((x) => (x === pl.id ? cb.checked : u.plans.includes(x)));
        S().setPlans(u.id, next).then((r) => {
          if (!r.ok) { cb.checked = !cb.checked; return failToast(r); }
          u.plans = r.plans; DOM.toast(t('staff.saved'));
        });
      });
      return h('label', { class: 'staff-check' }, cb, h('span', { class: 'small' }, t(`examPricing.ielts.${pl.id}.title`)));
    }));
  }

  function roleCell(u) {
    if (!App.can('roles')) return h('span', { class: 'small' }, t('staff.role.' + u.role));
    const self = State.staff?.id === u.id;
    const sel = h('select', { class: 'input input--sm staff-role', 'aria-label': t('staff.col.role'), disabled: self },
      IELTS_CONFIG.staffRoles.map((r) => h('option', { value: r, selected: u.role === r }, t('staff.role.' + r))));
    sel.addEventListener('change', () => S().setRole(u.id, sel.value).then((r) => {
      if (!r.ok) { sel.value = u.role; return failToast(r); }
      u.role = sel.value; DOM.toast(t('staff.saved'));
    }));
    return sel;
  }

  /** Admins only, and never one's own account, after a confirmation that names the person. */
  function deleteButton(u, reload) {
    if (!App.can('roles') || State.staff?.id === u.id) return null;
    return h('button', { class: 'btn btn--ghost btn--sm staff-delete', type: 'button',
      onclick: () => confirmDialog({ title: t('staff.deleteTitle'), body: t('staff.deleteBody', { name: u.name || '—', phone: u.phone || '—' }), ok: t('staff.delete'), danger: true },
        () => S().remove(u.id).then((r) => { if (!r.ok) return failToast(r); DOM.toast(t('staff.deleted')); reload(); })) },
    icon('trash'), t('staff.delete'));
  }

  function routeCell(u) {
    const route = u.route ? opt('ieltsOb.route.' + u.route, u.route) : null;
    const track = u.track ? I18n.trackName(u.track) : null;
    if (!route && !u.programme && !track) return h('span', { class: 'muted' }, '—');
    return h('div', null,
      h('div', { class: 'small' }, u.programme || route || '—'),
      h('div', { class: 'xs muted' }, [u.programme ? route : null, track].filter(Boolean).join(' · ')));
  }

  function bandsCell(u) {
    if (u.currentBand == null && u.targetBand == null) return h('span', { class: 'muted' }, '—');
    return h('div', { class: 'staff-bands' },
      h('span', { class: 'xs muted', title: t('ieltsGoal.start') }, bandStr(u.startBand)), h('span', { class: 'xs muted', 'aria-hidden': 'true' }, '→'),
      h('b', { class: 'num', title: t('ieltsGoal.now') }, bandStr(u.currentBand)), h('span', { class: 'xs muted', 'aria-hidden': 'true' }, '→'),
      h('span', { class: 'num staff-bands__goal', title: t('ieltsGoal.goal') }, bandStr(u.targetBand)));
  }

  function examCell(u) {
    if (!u.examDate) return h('span', { class: 'muted' }, '—');
    const n = DOM.daysBetween(new Date(), u.examDate);
    return h('div', null, h('div', { class: 'small' }, fmt(u.examDate)),
      h('div', { class: 'xs ' + (n < 0 ? 'muted' : n <= 14 ? 'staff-soon' : 'muted') }, n < 0 ? t('staff.examPassed') : t('app.daysLeft', { n })));
  }

  // ---------- the table ----------
  function studentsTable(host) {
    const table = h('div', { class: 'table-wrap staff-table-wrap' });
    const search = h('input', { class: 'input staff-search', type: 'search', value: query, placeholder: t('staff.search'), 'aria-label': t('staff.search') });
    const pending = h('button', { class: 'chip', type: 'button', 'aria-pressed': String(onlyPending) }, t('staff.onlyPending'));
    pending.addEventListener('click', () => { onlyPending = !onlyPending; pending.setAttribute('aria-pressed', String(onlyPending)); load(); });
    let timer;
    search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { query = search.value.trim(); load(); }, 300); });
    const count = h('span', { class: 'muted small staff-count' });
    host.append(h('div', { class: 'row staff-tools' }, search, pending, count), table);

    function load() {
      S().users(query).then((res) => {
        if (!res.ok) { table.replaceChildren(h('p', { class: 'muted' }, errText(res.reason))); return; }
        const users = res.users.filter((u) => !onlyPending || u.scores.some((sc) => sc.status === 'pending'));
        const waiting = res.users.reduce((n, u) => n + u.scores.filter((sc) => sc.status === 'pending').length, 0);
        count.textContent = t('staff.count', { n: users.length }) + (waiting ? ' · ' + t('staff.waiting', { n: waiting }) : '');
        if (!users.length) { table.replaceChildren(Hub.empty ? Hub.empty({ icon: 'users', title: t(onlyPending ? 'staff.noScores' : 'staff.noStudents') }) : h('p', { class: 'empty' }, t(onlyPending ? 'staff.noScores' : 'staff.noStudents'))); return; }
        const cols = ['name', 'start', 'route', 'bands', 'exam', 'results', 'plans', 'role'];
        table.replaceChildren(h('table', { class: 'table staff-table' },
          h('thead', null, h('tr', null, cols.map((k) => h('th', { scope: 'col' }, t('staff.col.' + k))))),
          h('tbody', null, users.map((u) => {
            const shown = u.scores.filter((sc) => sc.status !== 'confirmed' || sc === u.scores.find((x) => x.status === 'confirmed'));
            return h('tr', null,
              h('td', { 'data-label': t('staff.col.name') },
                h('div', { class: 'staff-who' }, h('div', { class: 'avatar', 'aria-hidden': 'true' }, DOM.initials(u.name)),
                  h('div', null, h('b', null, u.name || '—'),
                    h('div', { class: 'xs muted' }, u.phone || ''), u.email && h('div', { class: 'xs muted' }, u.email)))),
              h('td', { class: 'small', 'data-label': t('staff.col.start') }, fmt(u.createdAt)),
              h('td', { 'data-label': t('staff.col.route') }, routeCell(u)),
              h('td', { 'data-label': t('staff.col.bands') }, bandsCell(u)),
              h('td', { 'data-label': t('staff.col.exam') }, examCell(u)),
              h('td', { 'data-label': t('staff.col.results') }, shown.length ? h('div', { class: 'stack-sm' }, shown.map((sc) => scoreLine(sc, load))) : h('span', { class: 'muted' }, '—')),
              h('td', { 'data-label': t('staff.col.plans') }, u.role === 'student' ? plansCell(u) : h('span', { class: 'muted small' }, t('staff.staffMember'))),
              h('td', { 'data-label': t('staff.col.role') }, h('div', { class: 'stack-sm' }, roleCell(u), deleteButton(u, load))));
          }))));
      });
    }
    load();
  }

  Screens.staff = {
    title: () => t('staff.title'),
    async render() {
      const head = Hub.pageHead({ title: t('staff.title'), sub: t('staff.sub'), eyebrow: t('staff.nav.group') });
      if (!State.staff) {
        const r = await Api.staff.me();
        if (r.ok) State.staff = r.user;
      }
      if (!App.can('staff')) {
        return h('div', { class: 'stack' }, head,
          h('div', { class: 'card empty' },
            h('div', { class: 'empty__icon' }, icon('users')),
            h('h3', null, t('staff.noAccess')),
            h('p', { class: 'muted' }, t(State.staff ? 'staff.noAccessNote' : 'staff.noServerNote'))));
      }
      const wrap = h('div', { class: 'stack staff' }, head);
      studentsTable(wrap);
      return wrap;
    },
  };
})();
