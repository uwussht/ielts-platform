// Shared IELTS hub helpers, ported from ai-tutor: plan-task titles (AJ), task → route (AU),
// skill plates (O6), status chips, origin badges, date formatting.
(function () {
  const { h, icon } = DOM;

  const SKILL_NAME = { listening: 'Listening', reading: 'Reading', writing: 'Writing', speaking: 'Speaking', mock: 'Mock' };
  const SEC_ICON = { writing: 'writing', reading: 'reading', listening: 'listening', speaking: 'speaking', vocab: 'vocab', control: 'shield', mock: 'mock', diagnostic: 'target' };
  const LOCALE = () => DOM.locale();
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

  // fmtDate a$: local date, long or short month (ru short: strip ".", нояб→ноя, сент→сен)
  function fmtDate(ymd, short = false) {
    if (!ymd) return '';
    const d = new Date(String(ymd).length === 10 ? `${ymd}T00:00:00` : ymd);
    if (Number.isNaN(+d)) return '';
    return new Intl.DateTimeFormat(LOCALE(), { day: 'numeric', month: short ? 'short' : 'long' }).format(d);
  }
  function fmtUTC(ymd, opts = { day: 'numeric', month: 'short' }) {
    if (!ymd) return '';
    return new Intl.DateTimeFormat(LOCALE(), { timeZone: 'UTC', ...opts }).format(new Date(`${String(ymd).slice(0, 10)}T00:00:00Z`));
  }
  function addDays(ymd, n) { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function addMonths(ymd, n) { const d = new Date(`${ymd.slice(0, 7)}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); }
  const bandStr = (x) => (x == null || !Number.isFinite(+x) ? '—' : Number.isInteger(+x) ? (+x).toFixed(1) : String(+x));
  const minutes = (n) => t('ieltsHub.minutes', { n });

  // ---------- plan task title AJ ----------
  const term = (group) => (id) => { const k = `ielts.term.${group}.${id}`; return I18n.has(k) ? t(k) : ''; };
  const AG = term('genre'), AY = term('visual'), AK = term('letter'), AX = term('guide'), AC = term('card'), AP = term('spart'), AS = term('gsub');
  const AZ = (s) => cap(String(s || '').replace(/[_-]+/g, ' ').trim());
  function subLabel(kind, sub) {
    if (!sub) return '';
    switch (kind) {
      case 'type': case 'demo': case 'mini': case 'weak': case 'listen': return RL.typeLabel(sub);
      case 'drill': { const k = [sub, sub + 'ning', sub + 'ming'].map((x) => `ieltsReading.drill.${x}.name`).find((k) => I18n.has(k)); return k ? t(k) : AZ(sub); }
      case 't2': case 'pair': return AG(sub) || AZ(sub);
      case 't1': return sub.split('/').map((x) => AY(x) || AK(x) || AZ(x)).join(' · ');
      case 'guide': { const [a, b] = sub.split('.'); return [AX(a) || AZ(a), b && (AG(b) || AY(b) || AK(b) || AS(b) || AZ(b))].filter(Boolean).join(' · '); }
      case 'p2': return AC(sub) || AZ(sub);
      case 'sg': return AP(sub) || AZ(sub);
      case 'vocab': return /^awl-\d+$/i.test(sub) ? t('ielts.term.awl', { n: sub.split('-')[1] }) : AZ(sub);
      default: return AZ(sub);
    }
  }
  function taskTitle(task) {
    if (task.origin === 'weekly_control' || task.kind === 'checkpoint') return t('ieltsPlan.control.' + (task.control || 'weekly'));
    if (task.origin === 'teacher') {
      const s = task.extra?.title || t('ieltsPlan.origin.teacher');
      const pre = task.sec === 'vocab' ? t('ieltsPlan.sec.vocab') : SKILL_NAME[task.sec];
      return pre ? `${pre} · ${s}` : s;
    }
    const secLabel = task.sec === 'vocab' ? t('ieltsPlan.sec.vocab') : SKILL_NAME[task.sec] || task.sec;
    return `${secLabel} · ${t('ieltsPlan.item.' + task.kind, { sub: subLabel(task.kind, task.sub), n: String(task.n) })}`;
  }
  const originOf = (task) => (task.origin !== 'teacher' ? null : task.mode === 'homework' ? 'homework' : 'teacher');
  function originBadge(task, short = false) {
    const o = originOf(task); if (!o) return null;
    const title = task.extra?.createdByName ? t('ieltsPlan.origin.by', { name: task.extra.createdByName }) : null;
    const text = short ? t(`ieltsPlan.origin.${o}Short`) : o === 'homework' ? t('ieltsPlan.origin.homework', { date: fmtDate(task.extra?.dueDate || task.date, true) }) : t('ieltsPlan.origin.teacher');
    return h('span', { class: 'badge badge--info', title }, text);
  }
  const teacherNote = (task) => task.origin === 'teacher' && task.extra?.note ? h('span', { class: 'tnote' }, task.extra.note) : null;

  // ---------- task → route AU ----------
  const AH = { mock: { tab: 'mocks' }, 'reading-full': { tab: 'learn', view: 'reading-full' }, 'listening-full': { tab: 'learn', view: 'listening-full' }, 'writing-task2': { tab: 'learn', view: 'writing-task2' }, 'speaking-part2': { tab: 'learn', view: 'speaking-part2' } };
  const L = (view) => ({ tab: 'learn', view });
  const AB = { type: L('types'), demo: L('types'), mini: L('types'), weak: L('types'), drill: L('drills'), pm: L('texts'), full: { tab: 'mocks' }, guide: L('writing-guide'), ideas: L('writing-guide'),
    t1: L('writing-task1'), t2: L('writing-task2'), pair: L('writing-task2'), p1: L('speaking-part1'), run: L('speaking-part1'), p2: L('speaking-part2'), sg: L('speaking-guide'), sh: L('speaking-shadowing'),
    dc: L('listening-dictation'), spl: L('listening-spelling'), listen: L('listening-tasks'), fmt: L('listening-tasks'), vocab: { screen: 'vocab' } };
  const AW = {
    reading: (k) => (k === 'test' ? 'reading-full' : k === 'types' ? 'types' : k === 'drill' ? 'drills' : 'texts'),
    listening: (k) => (k === 'dictation' ? 'listening-dictation' : k === 'spelling' ? 'listening-spelling' : 'listening-tasks'),
    writing: (k) => (k === 'task1' ? 'writing-task1' : 'writing-task2'),
    speaking: (k) => (k === 'part2' || k === 'part3' ? `speaking-${k}` : 'speaking-part1'),
  };
  function taskRoute(task) {
    if (task.recommend) return AH[task.key] || { tab: 'learn' };
    if (task.origin === 'teacher') {
      const x = task.extra || {};
      if (task.sec === 'mock' && x.testId) return { screen: 'ielts-mock', ieltsMock: x.testId };
      const v = x.testId && AW[task.sec]?.(x.testKind);
      if (v) return { tab: 'learn', view: v, testId: x.testId };
      if (task.sec === 'vocab') return { screen: 'vocab' };
      return AB[task.kind] || { tab: 'learn' };
    }
    if (task.origin === 'weekly_control' || task.kind === 'checkpoint') {
      const c = task.control || 'weekly';
      return c === 'weekly' ? L('texts') : c === 'writing' ? L('writing-task2') : c === 'speaking' ? L('speaking-part2') : { tab: 'mocks' };
    }
    return AB[task.kind] || { tab: 'learn' };
  }
  function routeHref(r) {
    if (r.screen === 'vocab') return Router.href({ screen: 'ielts', ieltsTab: 'vocab' });
    if (r.screen) { const { screen, ...rest } = r; return Router.href({ screen, ...rest }); }
    return Router.href({ screen: 'ielts', ieltsTab: r.tab, ieltsView: r.view || null, ieltsTest: r.testId || null, ieltsWork: r.attemptId || null, ieltsList: r.list || null });
  }
  const openTask = (task) => { history.pushState(null, '', routeHref(taskRoute(task))); Router.emit(); };
  const goRoute = (r) => { history.pushState(null, '', routeHref(r)); Router.emit(); };

  // Train weakness A(growth)
  function growthRoute(g) {
    if (!g) return { tab: 'plan' };
    if (g.kind === 'criterion') return L(g.skill === 'speaking' ? 'speaking-part2' : 'writing-task2');
    return L(g.skill === 'listening' ? 'listening-tasks' : 'types');
  }

  // ---------- visuals ----------
  function plate(sec, size = 48) {
    return h('span', { class: `plate plate--${sec || 'reading'}`, style: { width: size + 'px', height: size + 'px' }, 'aria-hidden': 'true' }, icon(SEC_ICON[sec] || 'reading'));
  }
  // Практика status chip WS
  function stChip(status) {
    if (status === 'done') return h('span', { class: 'badge badge--ok' }, icon('check', 'ic12'), t('ieltsPractice.st.done'));
    if (status === 'started') return h('span', { class: 'badge badge--info' }, t('ieltsPractice.st.started'));
    if (status === 'soon') return h('span', { class: 'badge' }, t('ieltsPractice.st.soon'));
    return h('span', { class: 'badge' }, t('ieltsPractice.st.new'));
  }
  // Page header OJ
  // SAT page head: group label (eyebrow) over a large display title. The eyebrow defaults to the
  // sidebar group of the current hub tab; pass eyebrow: false to drop it.
  function pageHead({ title, sub, chip, right, eyebrow }) {
    const p = Router.read();
    const eb = eyebrow === false ? '' : eyebrow || (p.screen === 'ielts' ? App.navGroup(p.ieltsTab || 'today') : '');
    return h('header', { class: 'ph' },
      h('div', { class: 'ph__text' }, eb && h('div', { class: 'ph__eyebrow' }, eb), h('h1', { class: 'ph__title' }, title),
        (sub || chip) && h('div', { class: 'ph__row' }, sub && h('span', { class: 'ph__sub' }, sub), chip && h('span', { class: 'badge badge--brand' }, chip))),
      right && h('div', { class: 'ph__right' }, right));
  }
  function empty({ icon: ic = 'about', title, text, action }) {
    return h('div', { class: 'empty card' }, h('span', { class: 'empty__icon' }, icon(ic)), h('h3', null, title), text && h('p', { class: 'small muted' }, text), action && h('div', { class: 'row', style: { justifyContent: 'center' } }, action));
  }
  function seg(items, value, onPick, { label, small } = {}) {
    return h('div', { class: 'chips' + (small ? ' chips--sm' : ''), role: 'tablist', 'aria-label': label },
      items.map(([v, l]) => h('button', { type: 'button', class: 'chip', role: 'tab', 'aria-selected': String(v === value), onclick: () => onPick(v) }, l)));
  }

  // Dashboard bundle H7 — profile + dashboard in parallel.
  async function loadDashboard() {
    const [p, d] = await Promise.all([Api.profile().catch(() => null), Api.dashboard().catch(() => null)]);
    const bf = p?.bands;
    return { profile: p,
      streakDays: d?.streak?.current ?? null, streakBest: d?.streak?.best ?? null,
      targetBand: d?.targetBand ?? p?.targetBand ?? null, examDate: d?.examDate ?? p?.examDate ?? null,
      overall: d ? d.overall ?? null : bf?.overall ?? null,
      bands: d?.bands || { listening: bf?.listening ?? null, reading: bf?.reading ?? null, writing: bf?.writing ?? null, speaking: bf?.speaking ?? null },
      dynamics: d?.dynamics ?? null, forecast: d?.forecast ?? null, roadmap: d?.roadmap ?? null, plan: d?.plan ?? null,
      programme: d?.programme ?? null, journey: d?.journey ?? null, growthZone: d?.growthZone ?? null };
  }

  window.Hub = { SKILL_NAME, cap, fmtDate, fmtUTC, addDays, addMonths, bandStr, minutes, taskTitle, subLabel, originOf, originBadge, teacherNote,
    taskRoute, routeHref, openTask, goRoute, growthRoute, plate, stChip, pageHead, empty, seg, loadDashboard };
})();
