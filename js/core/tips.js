// Tips: short pop-ups that explain what each part of a page is for.
//  · A tour per page: the first time a student opens one of the main pages, a bubble points at
//    each block in turn (Далее / Назад / Пропустить). The «?» button in the top bar shows it again.
//  · Hover tips: any element with data-tip="…" shows that text in a small bubble on hover or focus
//    (the sidebar menu uses it to say what each section is for).
// Texts: tips.<page>.<step>.title / .text in js/i18n/extra.js. Pages already shown are remembered
// in this browser only (localStorage), so a new device shows them again.
(function () {
  const { h } = DOM;
  const SEEN_KEY = 'ielts_tips_seen';
  const GAP = 12;     // between the block and the bubble, px
  const EDGE = 16;    // the bubble keeps this far from the window's edges, px
  const PAD = 6;      // the highlight ring around the block, px

  // A page's steps: `sel` is a CSS selector, or a list of them (the first one on screen wins).
  // Steps whose block is not on the page (empty states, small screens) are skipped.
  const TOURS = {
    'tab:today': [
      { key: 'nav', sel: ['.sidebar .nav', '.tabbar'] },
      { key: 'goal', sel: '.goal-hero' },
      { key: 'tasks', sel: '[aria-labelledby="tt-title"]' },
      { key: 'growth', sel: '[aria-labelledby="gz-title"]' },
      { key: 'control', sel: '.today > section.hero:not(.goal-hero)' },
      { key: 'help', sel: '.tips-help' },
    ],
    'tab:plan': [
      { key: 'views', sel: '.ph__right .chips' },
      { key: 'road', sel: '.plan-road > .card:first-child' },
      { key: 'day', sel: '.plan-road > .card:nth-child(2)' },
    ],
    'tab:learn': [
      { key: 'search', sel: '#content .search' },
      { key: 'catalog', sel: '#content .stack > .stack-sm:first-child' },
      { key: 'drills', sel: '#content .stack > .stack-sm:nth-child(2)' },
      { key: 'vocab', sel: '#content .extra.card' },
    ],
    'tab:mocks': [
      { key: 'hero', sel: '.mt-hero' },
      { key: 'last', sel: '.mt-top > .card' },
      { key: 'list', sel: '.mt-cards' },
    ],
    'tab:progress': [
      { key: 'filters', sel: '.pg-filters' },
      { key: 'overall', sel: '.pg-overall' },
      { key: 'skills', sel: '.pg-skill' },
      { key: 'chart', sel: '.pg-row > .card:first-child' },
      { key: 'history', sel: '.pg > section.card:last-of-type' },
    ],
    'tab:vocab': [
      { key: 'ielts', sel: '#vsec-ielts' },
      { key: 'awl', sel: '#vsec-ielts-awl' },
      { key: 'mine', sel: '#vsec-mine' },
    ],
    'tab:info': [
      { key: 'picks', sel: '.gpicks' },
      { key: 'section', sel: '#content section.card' },
    ],
  };
  const pageOf = (key) => key.replace(/^tab:/, '');

  const seen = {
    all() { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch { return []; } },
    has(key) { return this.all().includes(key); },
    add(key) { try { localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set([...this.all(), key])])); } catch {} },
  };

  // shown and inside the window's width (a closed drawer sits off to the side)
  const visible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.right > 0 && r.left < innerWidth && getComputedStyle(el).visibility !== 'hidden';
  };
  const find = (sel) => [].concat(sel).map((s) => document.querySelector(s)).find(visible) || null;

  // ---------- the tour ----------
  let cur = null; // { key, steps, i, ring, bubble, off }

  function close(markSeen = true) {
    if (!cur) return;
    const c = cur; cur = null;
    if (markSeen) seen.add(c.key);
    c.off();
    c.ring.remove(); c.bubble.remove();
    c.returnFocus?.focus?.({ preventScroll: true });
  }

  function place() {
    if (!cur) return;
    const { ring, bubble } = cur, el = cur.steps[cur.i].el;
    const r = el.getBoundingClientRect(), vw = innerWidth, vh = innerHeight;
    Object.assign(ring.style, { top: r.top - PAD + 'px', left: r.left - PAD + 'px', width: r.width + PAD * 2 + 'px', height: r.height + PAD * 2 + 'px' });
    const bw = bubble.offsetWidth, bh = bubble.offsetHeight;
    // below the block if it fits, else above, else beside it (a tall sidebar), else over its top edge
    const fitsY = (y) => Math.min(Math.max(EDGE, y), vh - EDGE - bh);
    let side, top, left;
    if (r.bottom + GAP + bh <= vh - EDGE) side = 'below';
    else if (r.top - GAP - bh >= EDGE) side = 'above';
    else if (r.right + PAD + GAP + bw <= vw - EDGE) side = 'right';
    else if (r.left - PAD - GAP - bw >= EDGE) side = 'left';
    else side = 'inside';
    if (side === 'right' || side === 'left') {
      left = side === 'right' ? r.right + PAD + GAP : r.left - PAD - GAP - bw;
      top = fitsY(Math.max(r.top, 0) + Math.min(r.height, vh) / 2 - bh / 2);
    } else {
      top = side === 'below' ? r.bottom + PAD + GAP : side === 'above' ? r.top - PAD - GAP - bh : Math.max(EDGE, r.top + EDGE);
      left = Math.min(Math.max(EDGE, r.left + r.width / 2 - bw / 2), vw - EDGE - bw);
    }
    Object.assign(bubble.style, { top: top + 'px', left: left + 'px' });
    bubble.dataset.side = side;
    bubble.style.setProperty('--arrow-x', Math.min(Math.max(16, r.left + r.width / 2 - left), bw - 16) + 'px');
    bubble.style.setProperty('--arrow-y', Math.min(Math.max(16, Math.max(r.top, 0) + Math.min(r.height, vh) / 2 - top), bh - 16) + 'px');
  }

  function show(i) {
    cur.i = i;
    const step = cur.steps[i], n = cur.steps.length, page = pageOf(cur.key);
    step.el.scrollIntoView({ block: 'center', behavior: 'auto' });
    const title = h('h2', { class: 'tip__title', id: 'tip-title' }, t(`tips.${page}.${step.key}.title`));
    const next = h('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: () => (i + 1 < n ? show(i + 1) : close()) }, t(i + 1 < n ? 'tips.next' : 'tips.done'));
    cur.bubble.replaceChildren(
      h('div', { class: 'tip__head' }, title, n > 1 && h('span', { class: 'tip__count' }, t('tips.of', { n: i + 1, total: n }))),
      h('p', { class: 'tip__text', id: 'tip-text' }, t(`tips.${page}.${step.key}.text`)),
      h('div', { class: 'tip__actions' },
        i + 1 < n ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => close() }, t('tips.skip')) : h('span'),
        h('div', { class: 'row' }, i > 0 && h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => show(i - 1) }, t('tips.back')), next)));
    place();
    next.focus({ preventScroll: true });
  }

  /** Runs the tour of page `key` ('tab:today' …) over what is on screen now; false if it has nothing to show. */
  function start(key) {
    close(false);
    const steps = (TOURS[key] || []).map((s) => ({ ...s, el: find(s.sel) })).filter((s) => s.el);
    if (!steps.length) return false;
    const ring = h('div', { class: 'tip-ring', 'aria-hidden': 'true' });
    const bubble = h('div', { class: 'tip', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'tip-title', 'aria-describedby': 'tip-text' });
    document.body.append(ring, bubble);
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowRight' && cur.i + 1 < cur.steps.length) show(cur.i + 1);
      else if (e.key === 'ArrowLeft' && cur.i > 0) show(cur.i - 1);
    };
    const onMove = () => requestAnimationFrame(place);
    document.addEventListener('keydown', onKey);
    addEventListener('resize', onMove);
    addEventListener('scroll', onMove, true);
    cur = { key, steps, i: 0, ring, bubble, returnFocus: document.activeElement,
      off: () => { document.removeEventListener('keydown', onKey); removeEventListener('resize', onMove); removeEventListener('scroll', onMove, true); } };
    show(0);
    return true;
  }

  /** After a page is shown: its tour, the first time only. */
  function maybeStart(key) {
    if (!TOURS[key] || seen.has(key)) return;
    // let the page settle (fonts, late blocks) before measuring it
    const page = document.querySelector('#content');
    setTimeout(() => { if (!cur && page && document.contains(page)) start(key); }, IELTS_CONFIG.tipsDelayMs);
  }

  /** The «?» button for the top bar, or null on a page without a tour. */
  function helpButton(key) {
    if (!TOURS[key]) return null;
    return h('button', { class: 'icon-btn tips-help', type: 'button', 'aria-label': t('tips.help'), 'data-tip': t('tips.help'), onclick: () => start(key) }, '?');
  }

  // ---------- hover tips: [data-tip] ----------
  let hint = null, hintFor = null, hintT = null;
  function showHint(el) {
    hintFor = el;
    hint ||= document.body.appendChild(h('div', { class: 'tip-hint', role: 'tooltip', id: 'tip-hint' }));
    hint.textContent = el.dataset.tip;
    el.setAttribute('aria-describedby', 'tip-hint');
    hint.hidden = false;
    const r = el.getBoundingClientRect(), bw = hint.offsetWidth, bh = hint.offsetHeight;
    // beside the element (the sidebar), or under it when there is no room at the side
    const side = r.right + GAP + bw <= innerWidth - EDGE;
    hint.style.left = (side ? r.right + GAP : Math.min(Math.max(EDGE, r.left + r.width / 2 - bw / 2), innerWidth - EDGE - bw)) + 'px';
    hint.style.top = (side ? r.top + r.height / 2 - bh / 2 : Math.min(r.bottom + GAP / 2, innerHeight - EDGE - bh)) + 'px';
  }
  function hideHint() {
    clearTimeout(hintT);
    hintFor?.removeAttribute('aria-describedby');
    hintFor = null;
    if (hint) hint.hidden = true;
  }
  const tipOf = (e) => e.target.closest?.('[data-tip]');
  document.addEventListener('pointerover', (e) => {
    const el = tipOf(e);
    if (el === hintFor) return;
    hideHint();
    if (el && e.pointerType !== 'touch') hintT = setTimeout(() => showHint(el), IELTS_CONFIG.tipsHoverMs);
  });
  document.addEventListener('focusin', (e) => { const el = tipOf(e); hideHint(); if (el && el.matches(':focus-visible')) showHint(el); });
  document.addEventListener('focusout', hideHint);
  document.addEventListener('pointerdown', hideHint);
  addEventListener('scroll', hideHint, true);

  window.Tips = { start, maybeStart, helpButton, close, has: (key) => !!TOURS[key] };
})();
