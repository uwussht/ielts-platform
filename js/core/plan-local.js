// The student's plan, built on the platform from the course programmes (content/programmes.json)
// instead of the ai-tutor backend. Replaces Api.plan, the dashboard's `programme` block,
// Api.markPlanTask and adds Api.movePlanTask; screens keep the backend's response shapes.
//
// Which programmes: the stages from the starting band up to the target (IELTS 5.5 → 6.0–6.5 → …).
// Calendar: programme weeks start on the day the plan is made; a study mode with a shorter
// length (programmes.json `durations`) packs programme weeks into fewer calendar weeks. Each
// calendar week's tasks are spread over its first six days in order, the week's control is on the seventh.
//
// Per-student state (start date, mode, start band, done marks, moved dates) is kept in this
// browser under STORE until the platform's own API stores it (see server/).
(function () {
  if (IELTS_CONFIG.planSource !== 'local') return;
  const STORE = 'ielts_plan.v1';
  const STUDY_DAYS = 6;                  // days 1–6 of each week; day 7 holds the week's control
  const CONTROL_DAY = 6;
  // stage programmes and the band each one ends at; a route runs from the first stage above
  // the starting band to the first one that reaches the target
  const STAGES = [['P55', 5.5], ['P65', 6.5], ['P75', 7.5], ['P85', 8.5], ['P90', 9]];
  const READY = 'R';                     // when the start band already meets the target
  const MILESTONE_CONTROL = { monthTest: 'month', midMock: 'mid', finalMock: 'final', 'control.reading': 'reading', 'control.writing': 'writing', 'control.speaking': 'speaking' };

  const iso = (d) => d.toISOString().slice(0, 10);
  const todayISO = () => { const d = new Date(); return iso(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))); };
  const addDays = (ymd, n) => { const d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);

  function load() { try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { return null; } }
  function save(s) { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch {} }

  function route(start, target) {
    if (start == null) return [];
    if (target != null && start >= target) return [READY];
    const ids = [];
    for (const [id, top] of STAGES) {
      if (top <= start) continue;
      ids.push(id);
      if (target == null || top >= target) break;
    }
    return ids.length ? ids : [READY];
  }

  // split tasks (in order) into `n` consecutive days with balanced minutes
  function spread(tasks, n) {
    const days = Array.from({ length: n }, () => []);
    let left = tasks.reduce((s, x) => s + x.minutes, 0), d = 0, acc = 0;
    tasks.forEach((x, i) => {
      const share = left / (n - d);
      if (d < n - 1 && acc > 0 && acc + x.minutes / 2 > share && tasks.length - i >= n - d - 1) { left -= acc; acc = 0; d++; }
      days[d].push(x); acc += x.minutes;
    });
    return days;
  }

  async function build() {
    const [data, profile] = await Promise.all([Api.programmes(), Api.profile().catch(() => null)]);
    const byId = Object.fromEntries((data?.programmes || []).map((p) => [p.id, p]));
    const today = todayISO();
    let s = load();
    const nowBand = profile?.bands?.overall ?? null;
    if (!s && nowBand != null) { s = { startDate: today, mode: 'self', startBand: nowBand, done: {}, moved: {} }; save(s); }
    const target = profile?.targetBand ?? null;
    if (!s) return { pending: true, today, target };

    const ids = route(s.startBand, target).filter((id) => byId[id]);
    const progs = ids.map((id) => byId[id]);
    const tasks = [], weekTitles = {};
    let calBase = 0, progBase = 0;
    for (const p of progs) {
      const cal = Math.max(1, p.durations?.[s.mode] || p.weeks);
      const weeks = Array.from({ length: cal }, () => ({ list: [], milestone: null, pw: [] }));
      p.weekList.forEach((w, i) => {
        const c = Math.min(cal - 1, Math.floor((i * cal) / p.weeks));
        const pw = progBase + w.n;
        weekTitles[pw] = w.title || {};
        weeks[c].pw.push(pw);
        if (w.milestone) weeks[c].milestone = w.milestone;
        w.sessions.flat().forEach((x, j) => weeks[c].list.push({ ...x, key: `${p.id}-w${w.n}-${j + 1}`, programmeWeek: pw, programme: p.id }));
      });
      weeks.forEach((wk, c) => {
        const calendarWeek = calBase + c + 1;
        const start = addDays(s.startDate, (calendarWeek - 1) * 7);
        spread(wk.list, STUDY_DAYS).forEach((day, d) => day.forEach((x) => tasks.push({ ...x, date: addDays(start, d), calendarWeek })));
        const control = MILESTONE_CONTROL[wk.milestone] || 'weekly';
        tasks.push({ key: `${p.id}-c${c + 1}`, sec: 'control', kind: 'checkpoint', sub: null, n: 1, minutes: 30, origin: 'weekly_control', control,
          programmeWeek: wk.pw[0] ?? null, programme: p.id, calendarWeek, date: addDays(start, CONTROL_DAY), extra: { weekStart: start, weekEnd: addDays(start, 6) } });
      });
      calBase += cal; progBase += p.weeks;
    }
    const currentWeek = Math.min(Math.max(1, Math.floor(daysBetween(s.startDate, today) / 7) + 1), Math.max(calBase, 1));
    for (const x of tasks) {
      x.id = x.key;
      x.movedFrom = s.moved[x.key] ? x.date : null;
      if (s.moved[x.key]) x.date = s.moved[x.key];
      const done = !!s.done[x.key];
      x.got = done ? x.n : 0;
      x.mode = 'self_study';
      x.origin = x.origin || 'programme';
      x.control = x.control || null;
      x.extra = x.extra || {};
      x.completionRule = 'self_report';
      x.overdue = !done && x.date < today;
      x.status = done ? 'completed'
        : x.origin === 'weekly_control' ? (x.date > today ? 'planned' : x.calendarWeek < currentWeek ? 'missed' : 'available')
          : 'planned';
    }
    tasks.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const names = progs.map((p) => p.name);
    const enrollment = { status: 'active', studyMode: 'self_study', lessonFormat: s.mode, programmeKey: ids.join('+'), programmeNames: names,
      programmeName: names.join(' → '), stages: ids, startBand: s.startBand, targetBand: target, startDate: s.startDate,
      endDate: addDays(s.startDate, calBase * 7 - 1), calendarWeeks: calBase, programmeWeeks: progBase };
    return { today, currentWeek, tasks, weekTitles, enrollment };
  }

  function planResponse(b) {
    if (b.pending) return { today: b.today, enrollment: { status: 'programme_pending', pendingReason: 'no_diagnostic' }, tasks: [], recommended: [] };
    const done = b.tasks.filter((x) => x.status === 'completed').length;
    return { today: b.today, currentWeek: b.currentWeek, completion: { done, total: b.tasks.length, percent: b.tasks.length ? Math.round((done / b.tasks.length) * 100) : 0 },
      recommended: [], enrollment: b.enrollment, tasks: b.tasks, weekTitles: b.weekTitles };
  }
  function programmeBlock(b, examDate) {
    const deadline = !examDate ? { state: 'none', daysRemaining: null } : (() => {
      const n = daysBetween(b.today, String(examDate).slice(0, 10));
      return { state: n < 0 ? 'passed' : n === 0 ? 'today' : n === 1 ? 'tomorrow' : 'days', daysRemaining: n, examDate };
    })();
    if (b.pending) return { enrollment: { status: 'programme_pending', pendingReason: 'no_diagnostic' }, deadline, tasks: [], recommended: [], weeklyControl: null, currentWeek: null };
    const regular = b.tasks.filter((x) => x.origin !== 'weekly_control');
    const tasks = regular.filter((x) => x.date === b.today || (x.overdue && x.calendarWeek === b.currentWeek));
    const weeklyControl = b.tasks.find((x) => x.origin === 'weekly_control' && x.calendarWeek === b.currentWeek) || null;
    return { enrollment: b.enrollment, deadline, tasks, recommended: [], weeklyControl, currentWeek: b.currentWeek };
  }

  const backendDashboard = Api.dashboard;
  Api.plan = async () => planResponse(await build());
  Api.dashboard = async () => {
    const [d, b] = await Promise.all([backendDashboard().catch(() => null), build()]);
    return { ...(d || {}), programme: programmeBlock(b, d?.examDate ?? null) };
  };
  Api.markPlanTask = async (id, done) => {
    const s = load(); if (!s) return null;
    if (done) s.done[id] = new Date().toISOString(); else delete s.done[id];
    save(s); Api.clearCache(); return { ok: true };
  };
  Api.movePlanTask = async (id, date) => {
    const s = load(); if (!s) return null;
    s.moved[id] = date; save(s); Api.clearCache(); return { ok: true };
  };
  // start over from this week (e.g. after a new diagnostic); keeps nothing
  Api.resetPlan = () => { try { localStorage.removeItem(STORE); } catch {} Api.clearCache(); };
  window.PlanLocal = { route, spread, build };
})();
