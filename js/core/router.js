// Query-string router mirroring ai-tutor: ?screen=ielts&ieltsTab=…&ieltsView=…&ieltsTest=…&ieltsMock=…&ieltsWork=…
// Every screen and item has a shareable URL; back/forward work through history.
(function () {
  const KEYS = ['screen', 'ieltsTab', 'ieltsView', 'ieltsTest', 'ieltsMock', 'ieltsWork', 'ieltsList', 'ieltsSession', 'mode', 'part', 'skill', 'set', 'step'];
  const listeners = new Set();

  function read() {
    const q = new URLSearchParams(location.search);
    const p = {};
    for (const [k, v] of q) if (v !== '') p[k] = v;
    if (!p.screen) p.screen = 'ielts';
    if (p.screen === 'ielts' && !p.ieltsTab) p.ieltsTab = 'today';
    return p;
  }
  function href(p) {
    const q = new URLSearchParams();
    const ordered = [...KEYS, ...Object.keys(p).filter((k) => !KEYS.includes(k))];
    for (const k of ordered) if (p[k] != null && p[k] !== '' && p[k] !== false) q.set(k, p[k]);
    return '?' + q.toString();
  }
  function go(p, { replace = false, keepScroll = false } = {}) {
    const url = href(p);
    if (url === location.search && !replace) return emit(keepScroll);
    history[replace ? 'replaceState' : 'pushState'](null, '', url);
    emit(keepScroll);
  }
  // Shortcut for the IELTS hub: tab + optional extra params.
  function tab(ieltsTab, extra = {}, opts) { go({ screen: 'ielts', ieltsTab, ...extra }, opts); }
  // Merge into current params (null deletes).
  function patch(extra, opts) {
    const p = { ...read(), ...extra };
    for (const k in p) if (p[k] == null) delete p[k];
    go(p, opts);
  }
  function emit(keepScroll) { const p = read(); listeners.forEach((fn) => fn(p, { keepScroll })); }
  window.addEventListener('popstate', () => emit(true));

  // Intercept same-app links (<a href="?…">) for SPA navigation.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="?"]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || a.target) return;
    e.preventDefault();
    history.pushState(null, '', a.getAttribute('href'));
    emit(false);
  });

  window.Router = { read, href, go, tab, patch, on: (fn) => listeners.add(fn), emit };
})();
