// API client. The student's account and data live on the platform's own API
// (IELTS_CONFIG.apiBase → server/, Bearer token); test content is read from the
// platform's copy (IELTS_CONFIG.contentApi). Paths and shapes follow ai-tutor's,
// so the screens ported from it read the same responses.
(function () {
  const API_BASE = IELTS_CONFIG.apiBase.replace(/\/+$/, '');
  // Test content (lists, documents, transcripts, model answers, mocks) comes from the
  // platform's own copy in content/, served by server.js on the backend's paths.
  const CONTENT = { base: IELTS_CONFIG.contentApi.replace(/\/+$/, ''), auth: false };
  const cget = (p) => get(p, CONTENT);
  const TOKEN_KEY = 'ielts_token';

  const Auth = {
    get token() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
    set(tok) { try { tok ? localStorage.setItem(TOKEN_KEY, tok) : localStorage.removeItem(TOKEN_KEY); } catch {} clearCache(); },
    clear() { Auth.set(null); },
  };

  async function readError(res, err) {
    let body = null;
    try { body = await res.json(); } catch {}
    if (body && typeof body === 'object' && body.code) Object.assign(err, { code: body.code, limit: body.limit ?? null, used: body.used ?? null, demoExpired: !!body.demoExpired });
    const m = (Array.isArray(body?.messages) ? body.messages[0] : null) ?? body?.message ?? body?.error;
    if (typeof m === 'string' && m.trim()) err.serverMessage = m.trim();
    err.data = body;
    return err;
  }

  async function request(method, path, body, { auth = true, keepalive = false, base = API_BASE } = {}) {
    const headers = {};
    const tok = Auth.token;
    if (auth && tok) headers.Authorization = `Bearer ${tok}`;
    if (body != null) headers['Content-Type'] = 'application/json';
    let res;
    try {
      res = await fetch(base + path, { method, headers, body: body != null ? JSON.stringify(body) : undefined, keepalive });
    } catch {
      throw new Error(t('err.network'));
    }
    if (!res.ok) {
      const err = new Error(t('err.server', { status: res.status }));
      err.status = res.status;
      await readError(res, err);
      if (res.status === 401 && auth && tok) window.dispatchEvent(new Event('unauthorized'));
      // course access ended while the app was open (a trial ran out, a manager closed it)
      if (res.status === 403 && err.data?.reason === 'no-access') window.dispatchEvent(new Event('no-access'));
      throw err;
    }
    if (res.status === 204) return null;
    return res.json().catch(() => null);
  }
  const get = (p, o) => Api.request('GET', p, null, o);
  const post = (p, b, o) => Api.request('POST', p, b ?? {}, o);
  const put = (p, b, o) => Api.request('PUT', p, b, o);
  const del = (p, o) => Api.request('DELETE', p, null, o);

  // Short-lived GET cache, cleared on any mutation (same as ai-tutor's eP/eE).
  const cache = new Map();
  function cached(key, ttl, fn) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.p;
    const p = fn();
    p.catch(() => cache.get(key)?.p === p && cache.delete(key));
    cache.set(key, { at: Date.now(), p });
    return p;
  }
  function clearCache() { cache.clear(); }
  const mut = (p) => p.finally(clearCache);
  const enc = encodeURIComponent;

  // Public (no token) POST.
  const pub = (p, b) => Api.request('POST', p, b, { auth: false });

  // Grading routes that were ai-tutor's /api/* — now on the platform's API (multipart or JSON).
  async function local(path, { method = 'POST', json, form, raw } = {}) {
    path = path.replace(/^\/api\//, API_BASE + '/');
    const headers = {};
    const tok = Auth.token;
    if (tok) headers.Authorization = `Bearer ${tok}`;
    let body;
    if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    else if (form) body = form;
    const res = await fetch(path, { method, headers, body });
    if (!res.ok) {
      const err = new Error(t('err.server', { status: res.status }));
      err.status = res.status;
      await readError(res, err);
      throw err;
    }
    return raw ? res : res.json().catch(() => null);
  }

  // Staff API (our own server, see server/). Never throws: {ok:false, reason} instead,
  // reason 'no-server' when the API isn't running.
  async function staffRequest(method, path, body) {
    const headers = {};
    const tok = Auth.token;
    if (tok) headers.Authorization = `Bearer ${tok}`;
    if (body != null) headers['Content-Type'] = 'application/json';
    try {
      const res = await fetch(IELTS_CONFIG.staffApi + path, { method, headers, body: body != null ? JSON.stringify(body) : undefined });
      const j = await res.json().catch(() => null);
      if (j && typeof j === 'object') return j;
      return { ok: false, reason: res.status === 503 || res.status === 404 ? 'no-server' : 'server' };
    } catch { return { ok: false, reason: 'no-server' }; }
  }
  const sreq = (m, p, b) => Api.staffRequest(m, p, b);

  const ME_DEFAULT = { ieltsAccount: false, studyMode: 'self_study', track: 'academic', programmeName: null, onboarded: false };

  const Api = {
    API_BASE, Auth, request, get, post, put, local, clearCache, staffRequest,

    // ---- staff area (own API) ----
    staff: {
      me: () => sreq('GET', '/me'),
      snapshot: (body) => sreq('PUT', '/me/snapshot', body),
      myScores: () => sreq('GET', '/me/scores'),
      reportScore: (body) => sreq('POST', '/me/scores', body),
      users: (q = '') => sreq('GET', '/staff/users?q=' + enc(q)),
      setPlans: (id, plans) => sreq('PUT', `/staff/users/${id}/plans`, { plans }),
      setRole: (id, role) => sreq('PUT', `/staff/users/${id}/role`, { role }),
      setAccess: (id, type, until) => sreq('PUT', `/staff/users/${id}/access`, { type, until }),
      remove: (id) => sreq('DELETE', `/staff/users/${id}`),
      decide: (id, status, comment) => sreq('POST', `/staff/scores/${id}`, { status, comment }),
      userAttempts: (id) => sreq('GET', `/staff/users/${id}/attempts`),
      reviews: (done) => sreq('GET', '/staff/reviews' + (done ? '?status=done' : '')),
      attempt: (id) => sreq('GET', `/staff/attempts/${id}`),
      grade: (id, body) => sreq('POST', `/staff/attempts/${id}/grade`, body),
      // a recording as an object URL (the request needs the token)
      audio: async (id) => {
        const r = await fetch(IELTS_CONFIG.staffApi + `/staff/audio/${id}`, { headers: { Authorization: `Bearer ${Auth.token}` } });
        if (!r.ok) throw new Error(t('err.server', { status: r.status }));
        return URL.createObjectURL(await r.blob());
      },
      tests: (skill, q = '') => sreq('GET', `/staff/tests?skill=${enc(skill)}&q=${enc(q)}`),
      test: (id) => sreq('GET', `/staff/tests/${enc(id)}`),
    },

    // ---- auth ----
    login: (phone, password) => pub('/auth/login', { phone, password }),
    logout: () => post('/auth/logout').catch(() => null),
    currentUser: () => get('/user/me'),
    register: (body) => pub('/registration', body),
    setPassword: (password) => post('/user/set-password', { password }),
    quotaUsage: () => get('/mobile/content-quota/usage?area=IELTS'),
    // vocabulary (IELTS sets + spaced repetition + the user's own words)
    vocabSets: () => cached('vocabSets', 12e4, () => cget('/mobile/ielts/tests?skill=vocab')),
    vocabProgress: (scopes) => get('/mobile/vocab-progress?scopes=' + scopes.map(enc).join(',')),
    vocabStates: (scope) => get(`/mobile/vocab-progress/${enc(scope)}`),
    vocabSave: (scope, results) => post(`/mobile/vocab-progress/${enc(scope)}`, { results }),
    savedVocab: () => get('/mobile/lesson-vocab/saved'),
    addVocab: (body) => mut(post('/mobile/lesson-vocab', body)),
    deleteVocab: (id) => mut(del(`/mobile/lesson-vocab/words/${enc(id)}`)),
    markVocabLearned: (ids) => post('/mobile/lesson-vocab/saved/learned', { ids }),

    // ---- IELTS ----
    ieltsMe: () => cached('me', 6e5, () => get('/mobile/ielts/plan/me').then((m) => ({ ...ME_DEFAULT, ...m, ieltsAccount: !!m?.ieltsAccount })).catch((e) => { if (e.status === 401) throw e; return ME_DEFAULT; })),
    dashboard: () => get('/mobile/ielts/dashboard'),
    plan: ({ from, to } = {}) => {
      const q = new URLSearchParams(); if (from) q.set('from', from); if (to) q.set('to', to);
      const s = q.toString();
      return cached('plan|' + s, 3e4, () => get('/mobile/ielts/plan' + (s ? '?' + s : '')));
    },
    markPlanTask: (id, done) => mut(put(`/mobile/ielts/plan/tasks/${id}/done`, { done })),
    profile: () => get('/mobile/ielts/profile'),
    saveProfile: (body) => mut(put('/mobile/ielts/profile', body)),
    setRoute: (route) => mut(put('/mobile/ielts/profile/route', { route })),
    progress: () => get('/mobile/ielts/progress'),
    // the bank's list with this student's attempts on each test
    tests: (skill = 'reading') => cached('tests|' + skill, 3e4, () => get(`/mobile/ielts/tests?skill=${enc(skill)}`)),
    test: (id) => cget(`/mobile/ielts/tests/${enc(id)}`),
    transcript: (id) => cget(`/mobile/ielts/tests/${enc(id)}/transcript`),
    writingModel: (id) => cget(`/mobile/ielts/tests/${enc(id)}/model`),
    // one answer checked by the bank's keys (content/keys)
    check: (id, body) => Api.request('POST', `/mobile/ielts/tests/${enc(id)}/check`, body, CONTENT),
    submitAttempt: (id, body) => mut(post(`/mobile/ielts/tests/${enc(id)}/attempts`, body)),
    submitWriting: (id, body) => mut(post(`/mobile/ielts/tests/${enc(id)}/writing`, body)),
    attempt: (id) => get(`/mobile/ielts/attempts/${enc(id)}`),
    selfCheck: (id, body) => put(`/mobile/ielts/attempts/${enc(id)}/selfcheck`, body),
    writingWorks: () => get('/mobile/ielts/writing/works'),
    speakingWorks: () => get('/mobile/ielts/speaking/works'),
    diagnostic: ({ level, module } = {}) => { const q = new URLSearchParams(); if (level) q.set('level', level); if (module) q.set('module', module); const s = q.toString(); return get('/mobile/ielts/diagnostic' + (s ? '?' + s : '')); },
    submitDiagnostic: (body) => mut(post('/mobile/ielts/diagnostic', body)),
    lastDiagnostic: () => get('/mobile/ielts/diagnostic/last'),
    diagnosticPath: (body) => post('/mobile/ielts/diagnostic/path', body),
    // the course programmes (content/programmes.json)
    programmes: () => cached('programmes', 6e5, () => cget('/mobile/ielts/programmes')),
    // the plan's marks (start date, mode, done and moved tasks), see js/core/plan-local.js
    planState: () => get('/mobile/ielts/plan/state').then((r) => r?.state ?? null),
    savePlanState: (state) => put('/mobile/ielts/plan/state', { state }),
    mocks: (module) => cached('mocks|' + (module || ''), 3e4, () => get('/mobile/ielts/mocks' + (module ? `?module=${enc(module)}` : ''))),
    startMock: (id) => mut(post(`/mobile/ielts/mocks/${enc(id)}/sessions`, {})),
    mockSession: (sid) => get(`/mobile/ielts/mocks/sessions/${sid}`),
    startMockSection: (sid, sec) => post(`/mobile/ielts/mocks/sessions/${sid}/sections/${sec}/start`, {}),
    saveMockDraft: (sid, sec, body, keepalive = false) => put(`/mobile/ielts/mocks/sessions/${sid}/sections/${sec}/draft`, body, { keepalive }),
    finishMockSection: (sid, sec, attemptIds) => mut(post(`/mobile/ielts/mocks/sessions/${sid}/sections/${sec}/finish`, { attemptIds })),
    abortMock: (sid) => mut(post(`/mobile/ielts/mocks/sessions/${sid}/abort`, {})),

    saveWord: (body) => mut(post('/mobile/saved-words', { language: 'ru', ...body })),
    translate: (q, tl = 'ru') => get(`/translate?tl=${tl}&q=${enc(q)}`),

    // ---- writing and speaking: saved for a teacher to grade (status 'pending_review') ----
    // returns the essay's attempt as it stands; errors carry {error:"<code>"}
    assessIeltsWriting: (attemptId, uiLang) => Api.local('/api/ielts/writing/assess', { json: { attemptId, uiLang } }).catch((e) => { e.code = e.data?.error || e.code; throw e; }),
  };
  window.Api = Api;
})();
