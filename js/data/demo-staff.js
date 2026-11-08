// Demo fixture for the staff API (server/src/staff.js): the same routes and answers, kept in memory
// for the session. The demo account is an admin, so every control in the staff area can be tried.
(function () {
  const ago = (d) => { const x = new Date(); x.setDate(x.getDate() - d); return x.toISOString().slice(0, 10); };
  const ahead = (d) => ago(-d);
  const sc = (id, overall, l, r, w, s, date, status, comment) => ({ id, source: 'official', overall, listening: l, reading: r, writing: w, speaking: s, date, status, comment: comment || null });

  const users = [
    { id: 1, name: 'Демо Ученик', phone: '+77000000001', email: null, role: 'admin', plans: ['self'], createdAt: ago(40), track: 'academic', route: 'platform', programme: 'IELTS Start', startBand: 4.5, currentBand: 5.5, targetBand: 7, examDate: null, scores: [] },
    { id: 2, name: 'Айгерим Нурланова', phone: '+77011234567', email: 'aigerim@example.com', role: 'student', plans: ['coach'], createdAt: ago(62), track: 'academic', route: 'mix', programme: 'IELTS Core 6.5', startBand: 5, currentBand: 6, targetBand: 6.5, examDate: ahead(34),
      scores: [sc(11, 6.5, 7, 6.5, 6, 6, ago(3), 'pending')] },
    { id: 3, name: 'Даниял Ахметов', phone: '+77022345678', email: null, role: 'student', plans: ['self'], createdAt: ago(21), track: 'general', route: 'platform', programme: 'IELTS Start', startBand: 4, currentBand: 4.5, targetBand: 6, examDate: ahead(90), scores: [] },
    { id: 4, name: 'Мадина Серикова', phone: '+77053456789', email: 'madina@example.com', role: 'student', plans: ['intensive', 'coach'], createdAt: ago(120), track: 'academic', route: 'teacher', programme: 'IELTS Sprint 7.0', startBand: 6, currentBand: 6.5, targetBand: 7.5, examDate: ago(5),
      scores: [sc(12, 7, 7.5, 7, 6.5, 7, ago(4), 'pending'), sc(13, 6.5, 7, 6.5, 6, 6.5, ago(70), 'confirmed')] },
    { id: 5, name: 'Ержан Касымов', phone: '+77074567890', email: null, role: 'student', plans: [], createdAt: ago(9), track: 'academic', route: null, programme: null, startBand: null, currentBand: null, targetBand: 6.5, examDate: null,
      scores: [sc(14, 8.5, 9, 9, 8, 8, ago(2), 'rejected', 'В сертификате другое имя — пришлите скан TRF')] },
    { id: 6, name: 'Анна Ким', phone: '+77085678901', email: 'anna.kim@example.com', role: 'curator', plans: [], createdAt: ago(200), track: null, route: null, programme: null, startBand: null, currentBand: null, targetBand: null, examDate: null, scores: [] },
    { id: 7, name: 'Тимур Беков', phone: '+77096789012', email: null, role: 'teacher', plans: [], createdAt: ago(180), track: null, route: null, programme: null, startBand: null, currentBand: null, targetBand: null, examDate: null, scores: [] },
  ];
  const ME = 1;
  const PERMS = { staff: ['teacher', 'curator', 'manager', 'admin'], plans: ['manager', 'admin'], scores: ['curator', 'admin'], roles: ['admin'] };
  const permsOf = (role) => Object.keys(PERMS).filter((p) => PERMS[p].includes(role));
  const find = (id) => users.find((u) => u.id === Number(id));
  const clone = (x) => structuredClone(x);

  window.DEMO_STAFF = function (method, path, body) {
    const url = new URL(path, 'http://x');
    const p = url.pathname;
    let m;
    const me = find(ME);
    if (method === 'GET' && p === '/me') return { ok: true, user: { id: me.id, name: me.name, role: me.role, perms: permsOf(me.role), plans: me.plans } };
    if (method === 'PUT' && p === '/me/snapshot') return { ok: true };
    if (method === 'GET' && p === '/me/scores') return { ok: true, scores: clone(me.scores) };
    if (method === 'GET' && p === '/staff/users') {
      const q = (url.searchParams.get('q') || '').toLowerCase().trim();
      const rows = users.filter((u) => !q || (u.name + ' ' + u.phone + ' ' + (u.email || '')).toLowerCase().includes(q));
      return { ok: true, users: clone(rows) };
    }
    if (method === 'PUT' && (m = p.match(/^\/staff\/users\/(\d+)\/plans$/))) { const u = find(m[1]); if (!u) return { ok: false, reason: 'not-found' }; u.plans = [...new Set(body.plans)].sort(); return { ok: true, plans: u.plans }; }
    if (method === 'PUT' && (m = p.match(/^\/staff\/users\/(\d+)\/role$/))) {
      const u = find(m[1]); if (!u) return { ok: false, reason: 'not-found' };
      if (u.id === ME && body.role !== 'admin') return { ok: false, reason: 'self' };
      u.role = body.role; return { ok: true, role: u.role };
    }
    if (method === 'DELETE' && (m = p.match(/^\/staff\/users\/(\d+)$/))) {
      if (Number(m[1]) === ME) return { ok: false, reason: 'self' };
      const i = users.findIndex((u) => u.id === Number(m[1])); if (i < 0) return { ok: false, reason: 'not-found' };
      users.splice(i, 1); return { ok: true };
    }
    if (method === 'POST' && (m = p.match(/^\/staff\/scores\/(\d+)$/))) {
      for (const u of users) for (const s of u.scores) if (s.id === Number(m[1])) { s.status = body.status; s.comment = body.comment || null; return { ok: true, score: clone(s) }; }
      return { ok: false, reason: 'not-found' };
    }
    return { ok: false, reason: 'not-found' };
  };
})();
