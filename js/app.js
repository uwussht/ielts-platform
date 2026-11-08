// App bootstrap: state, shell (sidebar, top bar, mobile tab bar, drawer), screen mounting.
(function () {
  const { h, icon, svg, BRAND, date, daysBetween, initials, isoDay } = DOM;
  const Screens = (window.Screens = window.Screens || {});

  // ---------- state ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
  };
  const State = (window.State = {
    me: null, user: null,
    staff: null, // {role, perms, plans} from the staff API, null without it
    theme: store.get('ielts_theme', 'dark'),
    // ai-tutor keeps the reference/track choice in localStorage and the profile's track wins when set.
    trackLocal: store.get('ielts_track', 'academic'),
    get track() { return this.me?.track || this.trackLocal; },
    async setTrack(tr) {
      this.trackLocal = tr; store.set('ielts_track', tr);
      if (this.me) this.me = { ...this.me, track: tr };
      try { await Api.saveProfile({ track: tr }); } catch {}
      Api.clearCache();
      render({ keepScroll: true });
    },
    setTheme(th) { this.theme = th; store.set('ielts_theme', th); document.documentElement.dataset.theme = th; renderShellOnly(); },
    async refreshMe() {
      Api.clearCache();
      const [me, prof] = await Promise.all([Api.ieltsMe(), Api.profile().catch(() => null)]);
      this.me = { ...me, targetBand: prof?.targetBand ?? me.targetBand ?? null, examDate: prof?.examDate ?? me.examDate ?? null };
      renderShellOnly();
    },
  });
  document.documentElement.dataset.theme = State.theme;

  // ---------- navigation model ----------
  const NAV = [
    { group: 'app.nav.group.prep' },
    { tab: 'today', key: 'app.nav.today', icon: 'today' },
    { tab: 'plan', key: 'app.nav.plan', icon: 'plan' },
    { tab: 'learn', key: 'app.nav.practice', icon: 'practice' },
    { tab: 'mocks', key: 'app.nav.mocks', icon: 'mock' },
    { group: 'app.nav.group.materials' },
    { tab: 'progress', key: 'app.nav.progress', icon: 'progress' },
    { tab: 'vocab', key: 'app.nav.vocab', icon: 'vocab' },
    { tab: 'info', key: 'app.nav.about', icon: 'about' },
  ];
  const TABBAR = [
    { tab: 'today', key: 'app.nav.today', icon: 'today' },
    { tab: 'plan', key: 'app.nav.plan', icon: 'plan' },
    { tab: 'learn', key: 'app.tab.practice', icon: 'practice' },
    { tab: 'mocks', key: 'app.tab.mocks', icon: 'mock' },
    { tab: 'progress', key: 'app.nav.progress', icon: 'progress' },
  ];
  // Shown to staff only (perms from the staff API), as SAT's staffNavItems.
  const STAFF_NAV = [
    { group: 'staff.nav.group' },
    { screen: 'staff', key: 'staff.nav', icon: 'users' },
  ];
  const can = (perm) => !!State.staff?.perms?.includes(perm);
  const TITLES = { today: 'app.nav.today', plan: 'app.nav.plan', learn: 'app.nav.practice', mocks: 'app.nav.mocks', progress: 'ieltsProgressV.title', vocab: 'app.nav.vocab', info: 'app.nav.about' };

  // ---------- DOM roots ----------
  const root = document.getElementById('app');
  let drawerOpen = false;
  let current = { params: null, node: null, leave: [] };

  function examMeta() {
    const d = State.me?.examDate;
    if (!d) return t('app.noDate');
    const n = daysBetween(new Date(), d);
    return t('app.examOn', { date: date(d) }) + (n >= 0 ? ' · ' + t('app.daysLeft', { n }) : '');
  }

  function sidebar(p) {
    const me = State.me || {};
    const tabNow = p.screen === 'ielts' ? p.ieltsTab : null;
    const name = State.user?.name || me.name || State.user?.email || '';
    const items = can('staff') ? [...NAV, ...STAFF_NAV] : NAV;
    const nav = h('nav', { class: 'nav', 'aria-label': t('app.menu') },
      items.map((n) => n.group
        ? h('div', { class: 'nav__group', role: 'presentation' }, t(n.group))
        : h('a', { class: 'nav__item', href: Router.href(n.screen ? { screen: n.screen } : { screen: 'ielts', ieltsTab: n.tab }),
          'aria-current': (n.screen ? p.screen === n.screen : tabNow === n.tab) ? 'page' : null, onclick: closeDrawer }, icon(n.icon), h('span', null, t(n.key)))));
    return h('aside', { class: 'sidebar' + (drawerOpen ? ' is-open' : ''), id: 'sidebar', 'aria-label': 'IELTS' },
      h('a', { class: 'brand', href: Router.href({ screen: 'ielts', ieltsTab: 'today' }), onclick: closeDrawer },
        h('div', { class: 'brand__mark', 'aria-hidden': 'true' }, svg(BRAND)),
        h('div', null, h('div', { class: 'brand__name' }, IELTS_CONFIG.brand), h('div', { class: 'brand__sub' }, t(State.track === 'general' ? 'app.track.general' : 'app.track.academic')))),
      h('button', { class: 'goal', type: 'button', onclick: () => window.GoalDialog?.open() },
        h('div', { class: 'goal__label' }, t('app.goal')),
        h('div', { class: 'goal__value' }, me.targetBand != null ? DOM.band(me.targetBand) : '—'),
        h('div', { class: 'goal__meta' }, examMeta())),
      nav,
      // SAT-style footer: exam format, then one row of language segments + theme icon, then the user card
      h('div', { class: 'sb-format' },
        h('div', { class: 'nav__group', id: 'fmt-label' }, t('app.format')),
        h('div', { class: 'swt', role: 'group', 'aria-labelledby': 'fmt-label' },
          ['academic', 'general'].map((tr) => h('button', { type: 'button', 'aria-pressed': String(State.track === tr), onclick: () => State.track !== tr && State.setTrack(tr) }, I18n.trackName(tr))))),
      h('div', { class: 'sb-tools' },
        h('div', { class: 'swt swt--grow', role: 'group', 'aria-label': t('app.lang') },
          I18n.langs.map((v) => h('button', { type: 'button', lang: v, 'aria-pressed': String(I18n.lang === v), title: I18n.nameOf(v), onclick: () => I18n.lang !== v && I18n.setLang(v) }, I18n.shortOf(v)))),
        h('button', { class: 'icon-btn', type: 'button', onclick: () => State.setTheme(State.theme === 'dark' ? 'light' : 'dark'), 'aria-label': t(State.theme === 'dark' ? 'app.theme.light' : 'app.theme.dark'), title: t(State.theme === 'dark' ? 'app.theme.light' : 'app.theme.dark') },
          icon(State.theme === 'dark' ? 'sun' : 'moon'))),
      h('div', { class: 'user' },
        h('div', { class: 'avatar', 'aria-hidden': 'true' }, initials(name)),
        h('div', { class: 'grow' }, h('div', { class: 'user__name' }, name || '—'), h('div', { class: 'user__sub' }, Demo.on ? 'Demo' : (State.user?.email || ''))),
        h('button', { class: 'icon-btn', type: 'button', onclick: logout, 'aria-label': t('app.logout'), title: t('app.logout') }, icon('logout'))));
  }

  // SAT top bar: a breadcrumb (BRAND / PAGE); the page's own title is the big heading in the content.
  function topbar(title, p) {
    return h('header', { class: 'topbar', 'data-title': title },
      h('button', { class: 'icon-btn topbar__menu', type: 'button', 'aria-label': t('app.menu'), 'aria-controls': 'sidebar', 'aria-expanded': String(drawerOpen), onclick: openDrawer }, icon('menu')),
      h('nav', { class: 'crumbs-top', 'aria-label': t('app.menu') },
        h('a', { href: Router.href({ screen: 'ielts', ieltsTab: 'today' }) }, IELTS_CONFIG.brand),
        title && h('span', { class: 'crumbs-top__sep', 'aria-hidden': 'true' }, '/'),
        title && h('b', { 'aria-current': 'page' }, title)),
      h('div', { class: 'topbar__actions', id: 'topbar-actions' }));
  }
  // Group label over a hub page's title (ПОДГОТОВКА / МАТЕРИАЛЫ), as the SAT page head.
  function navGroup(tab) {
    let g = null;
    for (const n of [...NAV, ...STAFF_NAV]) { if (n.group) g = n.group; else if (n.tab === tab || n.screen === tab) return t(g); }
    return '';
  }

  function tabbar(p) {
    const tabNow = p.screen === 'ielts' ? p.ieltsTab : null;
    return h('nav', { class: 'tabbar', 'aria-label': t('app.menu') },
      TABBAR.map((n) => h('a', { href: Router.href({ screen: 'ielts', ieltsTab: n.tab }), 'aria-current': tabNow === n.tab ? 'page' : null }, icon(n.icon), h('span', null, t(n.key)))));
  }

  // Role from the staff API (never blocks the app: without the API there is simply no staff area),
  // and the student's snapshot for the staff table.
  async function loadStaff(prof) {
    const r = await Api.staff.me();
    if (!r.ok) { State.staff = null; return; }
    State.staff = r.user;
    const me = State.me || {};
    Api.staff.snapshot({
      track: State.track, route: prof?.route || null, programme: me.programmeName || null,
      startBand: prof?.startBand ?? null, currentBand: prof?.bands?.overall ?? null,
      targetBand: me.targetBand ?? null, examDate: me.examDate || null,
    });
    if (can('staff')) renderShellOnly();
  }

  function openDrawer() { drawerOpen = true; renderShellOnly(); document.querySelector('.sidebar .nav__item')?.focus(); }
  function closeDrawer() { if (!drawerOpen) return; drawerOpen = false; renderShellOnly(); }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawerOpen) closeDrawer(); });

  function logout() {
    Api.Auth.clear(); Demo.set(false);
    State.me = null; State.user = null; State.staff = null;
    Router.go({ screen: 'login' }, { replace: true });
  }
  window.addEventListener('unauthorized', () => { if (!Demo.on) logout(); });

  // ---------- render ----------
  let shellEl = null, mainEl = null, contentEl = null;

  function renderShellOnly() {
    if (!shellEl) return render({ keepScroll: true });
    const p = Router.read();
    const sb = sidebar(p);
    shellEl.querySelector('.sidebar').replaceWith(sb);
    const scrim = shellEl.querySelector('.scrim');
    if (drawerOpen && !scrim) shellEl.insertBefore(h('div', { class: 'scrim', onclick: closeDrawer }), sb);
    if (!drawerOpen && scrim) scrim.remove();
    const tb = mainEl.querySelector('.topbar');
    tb.replaceWith(topbar(tb.dataset.title, p));
    shellEl.querySelector('.tabbar').replaceWith(tabbar(p));
  }

  async function render({ keepScroll = false } = {}) {
    const p = Router.read();
    // screens with timers/audio register cleanup via App.onLeave
    for (const fn of current.leave.splice(0)) { try { fn(); } catch (e) { console.error(e); } }
    current.params = p;
    drawerOpen = false;
    const authed = !!Api.Auth.token || Demo.on;

    const PUBLIC = ['login', 'register', 'login-code'];
    if (!authed && !PUBLIC.includes(p.screen)) return Router.go({ screen: 'login', next: location.search }, { replace: true });
    if (authed && PUBLIC.includes(p.screen)) return Router.go({ screen: 'ielts' }, { replace: true });

    if (authed && !State.me) {
      root.replaceChildren(h('div', { class: 'content' }, DOM.skeleton(2)));
      try {
        const [me, user, prof] = await Promise.all([Api.ieltsMe(), Api.currentUser().catch(() => null), Api.profile().catch(() => null)]);
        // plan/me has no goal fields — the sidebar goal card reads them from the profile
        State.me = { ...me, targetBand: prof?.targetBand ?? me.targetBand ?? null, examDate: prof?.examDate ?? me.examDate ?? null };
        State.user = user;
        loadStaff(prof);
      } catch (e) { if (e.status === 401) return logout(); State.me = {}; }
      if (State.me?.track && !store.get('ielts_track')) State.trackLocal = State.me.track;
    }

    // New IELTS users go through onboarding first, as on ai-tutor.
    if (authed && State.me && State.me.ieltsAccount && !State.me.onboarded && p.screen === 'ielts' && Screens['ielts-onboarding']) {
      return Router.go({ screen: 'ielts-onboarding' }, { replace: true });
    }

    // no access yet (onboarding/diagnostic not done): the hub shows the locked card, as on ai-tutor
    const key = p.screen === 'ielts' ? (State.me?.access === false ? 'ielts-locked' : 'tab:' + p.ieltsTab) : p.screen;
    const scr = Screens[key];
    const full = !scr || scr.fullscreen;

    if (full) {
      shellEl = mainEl = contentEl = null;
      const node = h('div', { class: 'full' });
      root.replaceChildren(node);
      await mount(node, scr, p);
    } else {
      contentEl = h('div', { class: 'content', id: 'content' });
      mainEl = h('div', { class: 'main' }, topbar(scr.title ? scr.title(p) : t(TITLES[p.ieltsTab] || 'app.nav.today'), p), h('main', { id: 'main', tabindex: '-1' }, contentEl));
      shellEl = h('div', { class: 'app' }, sidebar(p), mainEl, tabbar(p));
      root.replaceChildren(shellEl);
      await mount(contentEl, scr, p);
    }
    if (!keepScroll) window.scrollTo(0, 0);
    const title = scr?.title ? scr.title(p) : t(TITLES[p.ieltsTab] || '');
    document.title = (title ? title + ' · ' : '') + IELTS_CONFIG.brand;
    // static page text that lives outside #app
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-content]').forEach((el) => { el.setAttribute('content', t(el.dataset.i18nContent)); });
  }

  async function mount(el, scr, p) {
    if (!scr) { el.replaceChildren(h('div', { class: 'content' }, h('div', { class: 'card' }, h('h2', null, t('app.notFound')), h('p', null, h('a', { class: 'link', href: '?screen=ielts' }, t('app.back')))))); return; }
    el.replaceChildren(DOM.skeleton(3));
    const token = (current.token = {});
    try {
      const node = await scr.render(p, { rerender: () => render({ keepScroll: true }) });
      if (current.token !== token) return;
      el.replaceChildren(node);
    } catch (e) {
      if (current.token !== token) return;
      console.error(e);
      el.replaceChildren(DOM.errorBox(e, () => render({ keepScroll: true })));
    }
  }

  Router.on((p, o) => render(o));
  window.addEventListener('langchange', () => render({ keepScroll: true }));
  window.App = { render, renderShellOnly, logout, store, navGroup, can, track: () => State.track, onLeave: (fn) => current.leave.push(fn) };
  document.addEventListener('DOMContentLoaded', () => render());
})();
