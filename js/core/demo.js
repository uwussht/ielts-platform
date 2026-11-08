// Demo mode: serves fixture data (js/data/demo-data.js) instead of the backend so every
// screen can be opened without an account. Real sign-in turns it off.
(function () {
  const KEY = 'ielts_demo';
  let on = false;
  try { on = localStorage.getItem(KEY) === '1'; } catch {}
  if (new URLSearchParams(location.search).get('demo') === '1') { on = true; try { localStorage.setItem(KEY, '1'); } catch {} }

  const realRequest = Api.request;
  const realLocal = Api.local;
  const realStaff = Api.staffRequest;
  const mem = {}; // demo writes (plan marks, attempts) live for the session

  function fixture(method, path, body) {
    const D = window.DEMO_DATA || {};
    const url = new URL(path, 'http://x');
    for (const r of D.routes || []) {
      if (r.method && r.method !== method) continue;
      const m = url.pathname.match(r.re);
      if (m) return typeof r.data === 'function' ? r.data({ m, q: url.searchParams, body, mem }) : structuredClone(r.data);
    }
    if (method !== 'GET') return { ok: true };
    const err = new Error(t('demo.noData', { path: url.pathname })); err.status = 404; throw err;
  }

  function install() {
    Api.request = async (method, path, body, opts) => {
      if (!on) return realRequest(method, path, body, opts);
      await new Promise((r) => setTimeout(r, 120));
      return fixture(method, path, body);
    };
    // staff area: in-memory fixture (js/data/demo-staff.js), the demo user is an admin
    Api.staffRequest = async (method, path, body) => {
      if (!on) return realStaff(method, path, body);
      await new Promise((r) => setTimeout(r, 150));
      return window.DEMO_STAFF ? window.DEMO_STAFF(method, path, body) : { ok: false, reason: 'no-server' };
    };
    Api.local = async (path, opts = {}) => {
      if (!on) return realLocal(path, opts);
      const D = window.DEMO_DATA || {};
      const fn = D.local?.[path.split('?')[0]];
      await new Promise((r) => setTimeout(r, 600));
      if (fn) return fn(opts);
      const err = new Error(t('demo.aiLocked')); err.status = 503; throw err;
    };
  }
  install();

  window.Demo = {
    get on() { return on; },
    set(v) { on = !!v; try { v ? localStorage.setItem(KEY, '1') : localStorage.removeItem(KEY); } catch {} Api.clearCache(); },
    mem,
  };
})();
