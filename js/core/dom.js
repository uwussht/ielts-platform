// Tiny DOM toolkit: h() builds elements, plus formatting and UI helpers.
(function () {
  function h(tag, attrs, ...kids) {
    const el = tag === 'frag' ? document.createDocumentFragment() : document.createElement(tag);
    if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k in el && typeof v !== 'string' && k !== 'list') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    append(el, kids);
    return el;
  }
  function append(el, kids) {
    for (const c of kids.flat(Infinity)) {
      if (c == null || c === false || c === true) continue;
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  function svg(markup, cls) {
    const t = document.createElement('template');
    t.innerHTML = markup.trim();
    const s = t.content.firstChild;
    s.setAttribute('aria-hidden', 'true');
    if (cls) s.setAttribute('class', cls);
    return s;
  }

  // 20px line icons (stroke = currentColor).
  const P = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
  const ICONS = {
    trash: P('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12.5A2 2 0 0 0 9 21.3h6a2 2 0 0 0 2-1.8L18 7M9 7V4.5h6V7"/>'),
    users: P('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.6"/><path d="M15.5 14.2c3 .2 5.5 2.6 5.5 5.8"/>'),
    today: P('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    plan: P('<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4M7.5 13.5h3M7.5 17h6"/>'),
    practice: P('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><path d="M9 8h7M9 11.5h5"/>'),
    mock: P('<path d="M9 3h6M10 3v3.5M14 3v3.5"/><circle cx="12" cy="14" r="7.5"/><path d="M12 10.5V14l2.5 2"/>'),
    progress: P('<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 6-7"/>'),
    vocab: P('<path d="M4 19.5V5a2 2 0 0 1 2-2h11l3 3v13.5a1.5 1.5 0 0 1-1.5 1.5H6a2 2 0 0 1-2-2z"/><path d="M8.5 15l3-7.5 3 7.5M9.6 12.6h3.8"/>'),
    about: P('<circle cx="12" cy="12" r="9.5"/><path d="M12 11v6M12 7.5v.01"/>'),
    listening: P('<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4.5" height="7" rx="1.5"/><rect x="16.5" y="14" width="4.5" height="7" rx="1.5"/>'),
    reading: P('<path d="M2.5 5.5C5 4 8.5 4 12 6c3.5-2 7-2 9.5-.5V19c-2.5-1.5-6-1.5-9.5.5-3.5-2-7-2-9.5-.5z"/><path d="M12 6v13.5"/>'),
    writing: P('<path d="M16.5 3.5l4 4L8 20H4v-4z"/><path d="M14 6l4 4"/>'),
    speaking: P('<rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3.5M8.5 21.5h7"/>'),
    theory: P('<path d="M2 8.5L12 4l10 4.5-10 4.5z"/><path d="M6 10.5V16c3.5 2.5 8.5 2.5 12 0v-5.5"/>'),
    check: P('<path d="M4.5 12.5l5 5 10-11"/>'),
    lock: P('<rect x="4.5" y="10.5" width="15" height="10.5" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'),
    menu: P('<path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17"/>'),
    close: P('<path d="M6 6l12 12M18 6L6 18"/>'),
    logout: P('<path d="M15 4.5h3.5a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H15"/><path d="M10 16.5L14.5 12 10 7.5M14.5 12H4"/>'),
    sun: P('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'),
    moon: P('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
    globe: P('<circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19M12 2.5c2.8 3 2.8 16 0 19M12 2.5c-2.8 3-2.8 16 0 19"/>'),
    arrowR: P('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    arrowL: P('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
    chevronD: P('<path d="M6 9l6 6 6-6"/>'),
    chevronR: P('<path d="M9 6l6 6-6 6"/>'),
    search: P('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'),
    play: P('<path d="M7 4.5v15l12-7.5z"/>'),
    pause: P('<path d="M8 4.5v15M16 4.5v15"/>'),
    mic: P('<rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3.5"/>'),
    stop: P('<rect x="6" y="6" width="12" height="12" rx="2"/>'),
    clock: P('<circle cx="12" cy="12" r="9.5"/><path d="M12 7v5l3 2"/>'),
    target: P('<circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="1.5"/>'),
    flame: P('<path d="M12 21.5c4 0 7-2.8 7-6.8 0-4.4-3.6-6.3-4.2-10.7-2.3 1.4-3.6 3.7-3.8 6.2-1-1-1.6-2.1-1.8-3.4C7.1 8.6 5 11.4 5 14.7c0 4 3 6.8 7 6.8z"/>'),
    spark: P('<path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z"/><path d="M19 17l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>'),
    send: P('<path d="M21 3L10 14M21 3l-6.5 18-4.5-7-7-4.5z"/>'),
    refresh: P('<path d="M20 11a8 8 0 0 0-14.5-4.5L3.5 9M4 13a8 8 0 0 0 14.5 4.5l2-2.5"/><path d="M3.5 4v5h5M20.5 20v-5h-5"/>'),
    volume: P('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
    bulb: P('<path d="M9 18h6M10 21.5h4"/><path d="M12 2.5a6.5 6.5 0 0 0-3.8 11.8c.5.4.8 1 .8 1.7v.5h6v-.5c0-.7.3-1.3.8-1.7A6.5 6.5 0 0 0 12 2.5z"/>'),
    cap: P('<path d="M2 8.5L12 4l10 4.5-10 4.5z"/><path d="M6 10.5V16c3.5 2.5 8.5 2.5 12 0v-5.5M22 8.5V14"/>'),
    shield: P('<path d="M12 2.5l8 3v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10v-6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>'),
    calendar: P('<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>'),
    eye: P('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    plus: P('<path d="M12 5v14M5 12h14"/>'),
  };
  const BRAND = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8.5L12 4l10 4.5-10 4.5z"/><path d="M6 10.5V16c3.5 2.5 8.5 2.5 12 0v-5.5"/></svg>`;
  const icon = (name, cls) => svg(ICONS[name] || ICONS.about, cls);

  // ---------- formatting ----------
  const pad = (n) => String(n).padStart(2, '0');
  function band(v) {
    if (v == null || v === '' || Number.isNaN(+v)) return '—';
    return (+v).toFixed(1);
  }
  function mmss(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }
  function locale() { const L = IELTS_CONFIG.locales; return L[window.I18n?.lang] || L[IELTS_CONFIG.langs[0]]; }
  function parseDate(d) {
    if (!d) return null;
    if (d instanceof Date) return d;
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd); }
    const x = new Date(d); return Number.isNaN(+x) ? null : x;
  }
  function date(d, opts = { day: 'numeric', month: 'long' }) {
    const x = parseDate(d); if (!x) return '';
    return x.toLocaleDateString(locale(), opts);
  }
  function dateFull(d) { return date(d, { day: 'numeric', month: 'long', year: 'numeric' }); }
  function isoDay(d = new Date()) { const x = parseDate(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; }
  function daysBetween(a, b) { return Math.round((parseDate(isoDay(b)) - parseDate(isoDay(a))) / 864e5); }
  function initials(name) { return String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'; }

  // ---------- UI helpers ----------
  function toast(text, ms = 2600) {
    const el = h('div', { class: 'toast', role: 'status' }, text);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), ms);
  }
  function dialog(build) {
    const prev = document.activeElement;
    const back = h('div', { class: 'dialog-backdrop' });
    const box = h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true' });
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); prev?.focus?.(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    back.addEventListener('click', (e) => { if (e.target === back) close(); });
    document.addEventListener('keydown', onKey);
    append(box, [build(close)]);
    back.appendChild(box); document.body.appendChild(back);
    (box.querySelector('input,button,select,textarea') || box).focus();
    return close;
  }
  function skeleton(lines = 3) {
    return h('div', { class: 'stack', 'aria-busy': 'true' }, Array.from({ length: lines }, (_, i) => h('div', { class: 'skeleton', style: { height: i === 0 ? '120px' : '64px' } })));
  }
  function errorBox(err, retry) {
    return h('div', { class: 'card' }, h('div', { class: 'stack-sm' },
      h('h2', null, t('ieltsHub.error')),
      h('p', { class: 'muted' }, err?.serverMessage || err?.message || ''),
      retry && h('div', null, h('button', { class: 'btn btn--secondary', onclick: retry }, t('common.retry')))));
  }
  function statusBadge(kind, text) {
    const map = { ok: 'badge--ok', warn: 'badge--warn', danger: 'badge--danger', info: 'badge--info', brand: 'badge--brand' };
    return h('span', { class: 'badge ' + (map[kind] || '') }, text);
  }

  // WhatsApp chat with the manager (number from config), message prefilled.
  const waLink = (text) => `https://wa.me/${IELTS_CONFIG.whatsapp}?text=${encodeURIComponent(text)}`;

  window.DOM = { locale, waLink, h, append, svg, icon, ICONS, BRAND, band, mmss, date, dateFull, isoDay, parseDate, daysBetween, initials, toast, dialog, skeleton, errorBox, statusBadge, pad };
})();
