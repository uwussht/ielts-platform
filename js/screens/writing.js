// IELTS Writing — ai-tutor HI (task page), Vf (editor), HF (AI review), HP (works lists),
// HB (guide «Как писать»), chart renderer HM. Grading is server-side via ai-tutor's
// /api/ielts/writing/assess; drafts live in localStorage like ai-tutor.
(function () {
  const { h, icon } = DOM;
  const put = (el, ...k) => el.replaceChildren(...k.flat(9).filter((x) => x != null && x !== false && x !== ''));
  const loc = (o) => RL.loc(o);
  const pad = (n) => String(n).padStart(2, '0');
  const WX = (s) => { s = Math.max(0, s | 0); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };
  const learnHref = (view, extra) => Practice.learnHref(view, extra);
  const crumbsTo = (...rest) => Practice.crumbs({ label: t('ieltsHub.tab.learn'), href: learnHref() }, { label: 'Writing', href: learnHref('skill-writing') }, ...rest);

  // ---------- helpers (qt, qs, qr, HE, drafts) ----------
  const CRIT = ['taskResponse', 'coherenceCohesion', 'lexicalResource', 'grammaticalRange'];
  const countWords = (txt) => String(txt || '').trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  const paragraphs = (txt) => String(txt || '').split(/\n\s*\n+/).filter((p) => p.trim());
  function kindKey(doc) {
    if (doc?.taskKind === 'task1_academic') return 't1ac';
    if (doc?.taskKind === 'task1_general') return 't1gt';
    if (!doc?.taskKind && doc?.kind === 'task1') return doc.module === 'general' ? 't1gt' : 't1ac';
    return 't2';
  }
  function catLabel(kind, s) {
    if (!s) return '';
    if (kind === 'task2') return t('ieltsWriting.p.essay.' + s) || s;
    if (['formal', 'semi_formal', 'informal'].includes(s)) return t('ieltsWriting.p.register.' + s) || s;
    return t('ieltsWriting.p.visual.' + s) || s;
  }
  const kindLabel = (doc) => (doc.kind === 'task2' ? 'Task 2' : doc.taskKind === 'task1_general' || kindKey(doc) === 't1gt' ? 'Task 1 · General Training' : 'Task 1 · Academic');
  const docCat = (doc, test) => doc.category || doc.visual || doc.register || doc.essayType || test?.category;
  const timeLimit = (doc, test) => doc.timeLimitSec || test?.timeLimitSec || (doc.kind === 'task2' ? 2400 : 1200);
  const minWords = (doc) => doc.minWords || (doc.kind === 'task2' ? 250 : 150);
  const critLabel = (c, k) => t('ieltsWriting.crit.' + c + (c === 'taskResponse' && k !== 't2' ? '1' : ''));
  const bandTxt = (v) => (v == null || Number.isNaN(+v) ? '—' : Number(v).toFixed(1));

  const DKEY = (id) => `jts_ielts_wr_draft_${id}`;
  const Draft = {
    get(id) { try { const d = JSON.parse(localStorage.getItem(DKEY(id)) || 'null'); return d && String(d.text || '').trim() ? d : null; } catch { return null; } },
    save(id, d) { try { localStorage.setItem(DKEY(id), JSON.stringify({ ...d, savedAt: Date.now() })); return true; } catch { return false; } },
    drop(id) { try { localStorage.removeItem(DKEY(id)); } catch {} },
    all() {
      const out = [];
      try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith('jts_ielts_wr_draft_')) { const id = k.slice(19); const d = Draft.get(id); if (d) out.push({ testId: id, words: d.words ?? countWords(d.text), savedAt: d.savedAt }); } } } catch {}
      return out.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    },
  };
  const AUTO = new Set(); // attempts to grade once on first open (autoGrade)

  // ---------- chart renderer (HM) — SVG, no purple: brand yellow leads the palette ----------
  // series colours come from the --chart-N tokens in css/tokens.css (resolved now: SVG attributes can't take var())
  const PAL_N = 6;
  const pal = (i) => getComputedStyle(document.documentElement).getPropertyValue('--chart-' + ((i % PAL_N) + 1)).trim();
  const MARKS = ['circle', 'square', 'triangle', 'diamond', 'circle', 'square'];
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (v) => Math.round(v * 100) / 100;
  function marker(kind, x, y, c) {
    const a = `fill="#fff" stroke="${c}" stroke-width="2"`;
    if (kind === 'square') return `<rect x="${x - 4}" y="${y - 4}" width="8" height="8" ${a}/>`;
    if (kind === 'triangle') return `<polygon points="${x},${y - 5} ${x + 5},${y + 4} ${x - 5},${y + 4}" ${a}/>`;
    if (kind === 'diamond') return `<polygon points="${x},${y - 5} ${x + 5},${y} ${x},${y + 5} ${x - 5},${y}" ${a}/>`;
    return `<circle cx="${x}" cy="${y}" r="4" ${a}/>`;
  }
  function svgEl(markup, label) {
    const tpl = document.createElement('template');
    tpl.innerHTML = markup.trim();
    const s = tpl.content.firstChild;
    s.setAttribute('role', 'img'); if (label) s.setAttribute('aria-label', label);
    return s;
  }
  function sanitize(svg) {
    const d = new DOMParser().parseFromString(String(svg || ''), 'image/svg+xml');
    d.querySelectorAll('script,foreignObject,iframe').forEach((n) => n.remove());
    d.querySelectorAll('*').forEach((n) => [...n.attributes].forEach((a) => { if (/^on/i.test(a.name) || /javascript:/i.test(a.value)) n.removeAttribute(a.name); }));
    return d.documentElement.outerHTML;
  }
  function ariaOf(c) {
    const ser = (c.series || []).map((s) => `${s.name}: ${(c.x || []).map((x, i) => `${x} — ${s.values?.[i]}`).join(', ')}`).join('. ');
    if (c.type === 'line' || c.type === 'bar') return `${t('ielts.term.visual.' + c.type)}: "${c.title || ''}". ${c.yLabel ? `${t('ielts.term.chart.yAxis', { label: c.yLabel })}${c.unit ? ` (${c.unit})` : ''}. ` : ''}${ser}`;
    if (c.type === 'pie') return `${t('ielts.term.visual.pie')}: "${c.title || ''}". ${(c.slices || []).map((s) => `${s.label} — ${s.value}`).join(', ')}`;
    if (c.type === 'table') return `${t('ielts.term.visual.table')}: "${c.title || ''}"${c.unit ? ` (${c.unit})` : ''}. ${t('ielts.term.chart.columns', { list: (c.columns || []).join(' | ') })}.`;
    if (c.type === 'figure') return `${c.kind === 'map' ? 'Maps' : 'Diagram'}: ${c.alt || ''}`;
    return c.title || '';
  }
  function axesChart(c) {
    const W = 420, H = 260, L = 38, R = 12, T = 20, B = 30;
    const series = c.series || [], xs = c.x || [], n = xs.length;
    const max = Math.max(1, ...series.flatMap((s) => (s.values || []).filter((v) => v != null)));
    const step = c.yStep || Math.max(1, Math.ceil(max / 5));
    const yMax = c.yMax || Math.ceil(max / step) * step;
    const Y = (v) => T + ((yMax - v) * (H - T - B)) / yMax;
    let out = '';
    for (let v = 0; v <= yMax + 1e-9; v += step) out += `<line class="wc-grid" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text class="wc-tick" x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${num(v)}</text>`;
    if (c.unit) out += `<text class="wc-tick" x="${L + 4}" y="${T - 6}">${esc(c.unit)}</text>`;
    const every = Math.ceil(n / 12);
    if (c.type === 'line') {
      const X = (i) => L + 14 + (i * (W - L - R - 28)) / Math.max(1, n - 1);
      xs.forEach((x, i) => { if (i % every === 0 || i === n - 1) out += `<text class="wc-tick" x="${X(i)}" y="${H - 10}" text-anchor="middle">${esc(x)}</text>`; });
      series.forEach((s, si) => {
        const col = pal(si);
        const pts = (s.values || []).map((v, i) => (v == null ? null : `${X(i)},${Y(v)}`)).filter(Boolean).join(' ');
        out += `<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
        (s.values || []).forEach((v, i) => { if (v != null) out += marker(MARKS[si % MARKS.length], X(i), Y(v), col); });
      });
    } else {
      const slot = (W - L - R) / Math.max(1, n), S = Math.max(1, series.length);
      const bw = Math.min(26, (slot - 10) / S);
      xs.forEach((x, i) => { out += `<text class="wc-tick" x="${L + i * slot + slot / 2}" y="${H - 10}" text-anchor="middle">${esc(x)}</text>`; });
      series.forEach((s, si) => (s.values || []).forEach((v, i) => {
        if (v == null) return;
        const x = L + i * slot + (slot - bw * S) / 2 + si * bw;
        out += `<rect x="${x}" y="${Y(v)}" width="${Math.max(1, bw - 2)}" height="${Math.max(0, Y(0) - Y(v))}" fill="${pal(si)}"/>`;
      }));
    }
    return svgEl(`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="wchart__svg">${out}</svg>`, ariaOf(c));
  }
  function pieChart(c) {
    const sl = c.slices || [];
    const total = sl.reduce((s, x) => s + (+x.value || 0), 0) || 1;
    let a = -Math.PI / 2, out = '';
    sl.forEach((s, i) => {
      const d = ((+s.value || 0) / total) * Math.PI * 2;
      const x1 = 110 + 90 * Math.cos(a), y1 = 110 + 90 * Math.sin(a), x2 = 110 + 90 * Math.cos(a + d), y2 = 110 + 90 * Math.sin(a + d);
      out += sl.length === 1 ? `<circle cx="110" cy="110" r="90" fill="${pal(0)}"/>` : `<path d="M110 110 L${x1} ${y1} A90 90 0 ${d > Math.PI ? 1 : 0} 1 ${x2} ${y2}Z" fill="${pal(i)}" stroke="var(--surface)" stroke-width="1.5"/>`;
      a += d;
    });
    return svgEl(`<svg viewBox="0 0 220 220" xmlns="http://www.w3.org/2000/svg" class="wchart__svg wchart__svg--pie">${out}</svg>`, ariaOf(c));
  }
  function legend(c) {
    if (c.type === 'pie') {
      return h('ul', { class: 'wchart__legend' }, (c.slices || []).map((s, i) => h('li', null, svgEl(`<svg viewBox="0 0 26 14" width="26" height="14"><rect x="4" y="1" width="18" height="12" rx="2" fill="${pal(i)}"/></svg>`), `${s.label} — ${s.value}${c.unit === '%' || !c.unit ? '%' : ''}`)));
    }
    if (!(c.series || []).some((s) => s.name)) return null;
    return h('ul', { class: 'wchart__legend' }, c.series.map((s, i) => {
      const col = pal(i);
      const m = c.type === 'line' ? `<line x1="1" x2="25" y1="7" y2="7" stroke="${col}" stroke-width="2.5"/>${marker(MARKS[i % MARKS.length], 13, 7, col)}` : `<rect x="4" y="1" width="18" height="12" rx="2" fill="${col}"/>`;
      return h('li', null, svgEl(`<svg viewBox="0 0 26 14" width="26" height="14">${m}</svg>`), s.name);
    }));
  }
  function chart(c) {
    if (!c) return null;
    let body;
    if (c.type === 'multi') body = h('div', { class: 'wchart__multi' }, (c.charts || []).map(chart));
    else if (c.type === 'line' || c.type === 'bar') body = [axesChart(c), legend(c)];
    else if (c.type === 'pie') body = h('div', { class: 'wchart__pie' }, pieChart(c), legend(c));
    else if (c.type === 'table') {
      body = h('div', { class: 'table-wrap' }, h('table', { class: 'table wchart__table', 'aria-label': ariaOf(c) },
        h('thead', null, h('tr', null, (c.columns || []).map((x) => h('th', null, x)))),
        h('tbody', null, (c.rows || []).map((r) => h('tr', null, r.map((x, i) => h(i ? 'td' : 'th', null, x)))))));
    } else if (c.type === 'figure') {
      const el = h('div', { class: 'wchart__figure', html: sanitize(c.svg) });
      el.firstElementChild?.setAttribute('role', 'img'); el.firstElementChild?.setAttribute('aria-label', ariaOf(c));
      body = el;
    } else return null;
    return h('figure', { class: 'wchart', 'data-chart': c.type }, c.title && h('figcaption', { lang: 'en' }, c.title), body);
  }

  // ---------- task text (HA) ----------
  function taskBlock(doc) {
    return h('div', { class: 'wtask', lang: 'en' },
      doc.lead && h('p', { class: 'wtask__lead' }, doc.lead),
      (doc.question || doc.bullets?.length) && h('div', { class: 'wtask__box' },
        String(doc.question || '').split(/\n\n+/).filter(Boolean).map((p) => h('p', null, p)),
        doc.bullets?.length > 0 && h('ul', null, doc.bullets.map((b) => h('li', null, b)))),
      (doc.after || []).map((p) => h('p', { class: 'wtask__after' }, p)),
      doc.opening && h('p', { class: 'wtask__opening' }, doc.opening),
      chart(doc.chart));
  }

  // ---------- task page (HI) ----------
  async function taskPage(p) {
    const view = p.ieltsView || 'writing-task2';
    let res;
    try { res = await Api.test(p.ieltsTest); } catch (e) { return loadError(e); }
    const { test, document: doc } = res;
    const draft = Draft.get(test.id);
    const tl = timeLimit(doc, test), mins = Math.round(tl / 60), minW = minWords(doc);
    let mode = draft?.mode || 'exam';
    const listLabel = view === 'writing-works' ? t('ieltsLearn.writing.works') : t(`ieltsLearn.writing.${view === 'writing-task2' ? 'task2' : 'task1'}`);
    const modeBox = h('div', { class: 'modes', role: 'radiogroup', 'aria-label': t('ieltsReading.modeLabel') });
    const cta = h('a', { class: 'btn btn--primary btn--lg btn--block' });
    function paint() {
      put(modeBox, ['exam', 'practice'].map((m) => h('button', { type: 'button', class: 'mode', role: 'radio', 'aria-checked': String(mode === m), disabled: !!draft && draft.mode !== m, onclick: () => { mode = m; paint(); } },
        icon(m === 'exam' ? 'clock' : 'target'), h('span', null, h('strong', null, t('ieltsWriting.mode.' + m)), h('span', { class: 'xs muted' }, t('ieltsWriting.modeHint.' + m, { n: mins }))))));
      cta.textContent = draft ? t('ieltsReading.continue') : t('ieltsWriting.start');
      cta.href = Router.href({ screen: 'ielts-writing-run', ieltsTest: test.id, mode, backTab: 'learn', backView: view });
    }
    paint();
    const la = test.lastAttempt;
    const cat = catLabel(doc.kind, docCat(doc, test));
    return h('div', { class: 'stack' },
      crumbsTo({ label: listLabel, href: learnHref(view) }, { label: test.title }),
      h('div', { class: 'split' },
        h('section', { class: 'card stack' },
          h('div', { class: 'row' }, Hub.plate('writing', 48), h('div', { class: 'grow' }, h('h2', null, test.title), h('p', { class: 'muted small' }, kindLabel(doc)))),
          h('div', { class: 'chips' }, cat && h('span', { class: 'badge' }, cat), h('span', { class: 'badge' }, t('ieltsWriting.minutes', { n: mins })), h('span', { class: 'badge' }, t('ieltsWriting.minWords', { n: minW }))),
          taskBlock(doc)),
        h('aside', { class: 'stack' },
          h('section', { class: 'card stack-sm' },
            h('h3', null, t('ieltsReading.modeLabel')),
            draft && h('div', { class: 'notice row row--between', role: 'status' }, h('span', null, t('ieltsWriting.draftNote', { n: draft.words ?? countWords(draft.text) })),
              h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => { Draft.drop(test.id); App.render({ keepScroll: true }); } }, t('ieltsReading.draftDrop'))),
            modeBox, cta),
          h('section', { class: 'card card--brand stack-sm' }, h('h3', null, t('ieltsWriting.p.guide.title')),
            h('p', { class: 'small row', style: { alignItems: 'flex-start', flexWrap: 'nowrap' } }, icon('bulb', 'ic16'), h('span', null, t('ieltsWriting.guideHint'))),
            h('div', null, h('a', { class: 'btn btn--secondary btn--sm', href: learnHref('writing-guide') }, t('ieltsWriting.openGuide')))),
          h('section', { class: 'card stack-sm' }, h('h3', null, t('ieltsReading.last.title')),
            la ? [h('b', null, la.band != null ? `band ${bandTxt(la.band)}` : la.status === 'failed' ? t('ieltsMock.result.cell.failed') : t('ieltsWriting.status.pending')),
              h('p', { class: 'small muted' }, DOM.date(la.finishedAt)),
              h('div', null, h('a', { class: 'btn btn--secondary btn--sm', href: learnHref('writing-work', { ieltsWork: la.id }) }, t('ieltsWriting.openWork')))]
              : h('p', { class: 'small muted' }, t('ieltsReading.last.none'))))));
  }
  function loadError(e) {
    return Hub.empty({ icon: 'about', title: e?.status === 404 ? t('ieltsReading.missingTitle') : t('ieltsReading.errorTitle'), text: t('ieltsReading.errorText'),
      action: h('button', { class: 'btn btn--secondary', type: 'button', onclick: () => App.render() }, t('common.retry')) });
  }

  // ---------- editor (Vf) ----------
  const STEPS = { t1ac: 4, t1gt: 5, t2: 4 };
  Screens['ielts-writing-run'] = {
    fullscreen: true,
    title: () => 'Writing',
    async render(p) {
      const { test, document: doc } = await Api.test(p.ieltsTest);
      if (doc.kind !== 'task1' && doc.kind !== 'task2') { Router.go({ screen: 'ielts', ieltsTab: 'learn', ieltsView: 'writing-guide' }, { replace: true }); return h('div'); }
      const M = p.mock; // full mock session: server deadline + server draft, no hints
      const draft = M ? (M.draft ? { ...M.draft, mode: 'exam' } : null) : Draft.get(test.id);
      const st = { text: draft?.text || '', mode: M ? 'exam' : p.mode === 'practice' ? 'practice' : p.mode === 'exam' ? 'exam' : draft?.mode || 'exam', startedAt: draft?.startedAt || new Date().toISOString(), pasteBlocked: draft?.pasteBlocked || 0, savedAt: draft ? new Date(draft.savedAt) : null, error: '' };
      const base = draft?.elapsedSec || 0, mounted = Date.now();
      const W = timeLimit(doc, test), minW = minWords(doc), kk = kindKey(doc);
      const elapsed = () => base + Math.floor((Date.now() - mounted) / 1000);
      const back = Router.href({ screen: 'ielts', ieltsTab: p.backTab || 'learn', ieltsView: p.backView || (doc.kind === 'task2' ? 'writing-task2' : 'writing-task1'), ieltsTest: test.id });
      const taskName = doc.kind === 'task2' ? 'Task 2' : 'Task 1';

      const root = h('div', { class: 'run wrun', 'data-mode': st.mode });
      const clock = h('span', { class: 'runbar__timer wrun__clock', role: 'timer' });
      const saved = h('span', { class: 'wrun__saved xs muted' });
      const notice = h('div');
      const steps = h('ol', { class: 'wrun__steps' });
      const bar = h('div', { class: 'wrun__bar small' });
      const ta = h('textarea', { class: 'wrun__text', lang: 'en', spellcheck: false, autocorrect: 'off', autocapitalize: 'sentences', placeholder: t('ieltsWriting.placeholder'), 'aria-label': t('ieltsWriting.placeholder') });
      ta.value = st.text;
      const submitBtn = h('button', { class: 'btn btn--primary', type: 'button', onclick: () => askSubmit() }, t('ieltsWriting.w2.submitAi'));
      const saveBtn = h('button', { class: 'btn btn--secondary', type: 'button', onclick: () => saveNow() }, t('ieltsWriting.w2.saveDraft'));
      let flash = 0, flashT = null, saveT = null, submitting = false, hdr = null;
      const sv = M && MockKit.saver(M, () => ({ text: st.text, pasteBlocked: st.pasteBlocked }));

      function saveNow() {
        if (M) { if (!submitting) sv.touch(); return; }
        if (submitting || !st.text.trim()) return;
        if (Draft.save(test.id, { text: st.text, mode: st.mode, words: countWords(st.text), startedAt: st.startedAt, pasteBlocked: st.pasteBlocked, elapsedSec: elapsed() })) { st.savedAt = new Date(); paintBar(); paintClock(); }
      }
      const queueSave = () => { if (M) return saveNow(); clearTimeout(saveT); saveT = setTimeout(saveNow, 1000); };
      function paintClock() {
        if (M) {
          const l = M.deadline == null ? null : Math.max(0, Math.round((M.deadline - Date.now()) / 1000));
          put(clock, icon('clock', 'ic16'), h('b', null, l == null ? '—' : MockKit.clockTxt(l)), h('small', null, ' ' + t('ieltsMock.byServer')));
          clock.classList.toggle('is-low', l != null && l <= 300);
          put(notice, st.error && h('p', { class: 'notice notice--danger', role: 'alert' }, st.error));
          return;
        }
        const k = elapsed(), left = W - k;
        const exam = st.mode === 'exam';
        put(clock, icon('clock', 'ic16'), h('b', null, exam ? (left >= 0 ? WX(left) : '+' + WX(-left)) : WX(k)), h('small', null, ' ' + t('ieltsWriting.ofMin', { n: Math.round(W / 60) })));
        clock.classList.toggle('is-low', exam && left <= 300);
        put(saved, st.savedAt && [icon('check', 'ic12'), ' ', t('ieltsWriting.savedAt', { time: `${pad(st.savedAt.getHours())}:${pad(st.savedAt.getMinutes())}` })]);
        put(notice, exam && left < 0 && h('p', { class: 'notice wrun__overtime', role: 'status' }, t('ieltsWriting.overtime')),
          st.error && h('p', { class: 'notice notice--danger', role: 'alert' }, st.error));
      }
      function paintBar() {
        const n = countWords(st.text), P = paragraphs(st.text).length;
        put(bar, h('b', { class: n < minW ? 'is-short' : 'is-ok' }, n < minW ? t('ieltsWriting.w2.words', { n, min: minW }) : t('ieltsWriting.w2.wordsOk', { n })),
          h('span', null, '· ' + t('ieltsWriting.p.work.paragraphs', { n: P })),
          h('span', { class: 'wrun__paste' + (flash ? ' is-flash' : ''), role: flash ? 'status' : null }, '· ' + t('ieltsWriting.pasteOff')),
          h('span', { class: 'grow' }),
          st.savedAt && h('span', { class: 'wrun__draft' }, icon('check', 'ic12'), ' ', t('ieltsWriting.w2.draftSaved')));
        const done = Math.min(STEPS[kk], P);
        put(steps, Array.from({ length: STEPS[kk] }, (_, i) => h('li', { class: i < done ? 'is-done' : null }, h('span', { class: 'wrun__stepn' }, i < done ? icon('check', 'ic12') : i + 1), h('span', null, t(`ieltsWriting.p.plan.${kk}.s${i + 1}`)))));
        submitBtn.disabled = saveBtn.disabled = !st.text.trim();
        if (hdr?.submitBtn) hdr.submitBtn.disabled = !st.text.trim();
      }
      ta.addEventListener('input', () => { st.text = ta.value; paintBar(); queueSave(); });
      ta.addEventListener('paste', (e) => { e.preventDefault(); st.pasteBlocked++; flash = 1; clearTimeout(flashT); flashT = setTimeout(() => { flash = 0; paintBar(); }, 2500); paintBar(); queueSave(); });
      ta.addEventListener('drop', (e) => e.preventDefault());

      function askSubmit() {
        const n = countWords(st.text);
        DOM.dialog((close) => {
          const cancel = h('button', { class: 'btn btn--secondary', type: 'button', onclick: close }, t('ieltsReading.cancel'));
          const ok = h('button', { class: 'btn btn--primary', type: 'button', onclick: async () => { ok.disabled = true; await submit(close); } }, M ? t(M.isLast ? 'ieltsMock.submitSection' : 'ieltsMock.toTask2') : t('ieltsWriting.submit'));
          setTimeout(() => cancel.focus());
          return h('div', { class: 'stack' }, h('h2', null, t('ieltsWriting.confirmTitle')),
            h('p', null, (n < minW ? t('ieltsWriting.confirmShort', { n, min: minW }) : t('ieltsWriting.confirmText', { n })) + (M ? ' ' + t('ieltsMock.noReturn') : '')),
            h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, cancel, ok));
        });
      }
      async function submit(close) {
        submitting = true; clearTimeout(saveT);
        try {
          const res = await Api.submitWriting(test.id, { text: st.text, mode: st.mode, timeSec: elapsed(), startedAt: st.startedAt, device: innerWidth < 760 ? 'mobile' : 'desktop', pasteBlocked: st.pasteBlocked });
          const id = String(res?.attempt?.id ?? res?.id);
          if (M) { sv.cancel(); close(); return await M.onSubmitted([id]); }
          Draft.drop(test.id); close();
          AUTO.add(id);
          Router.go({ screen: 'ielts', ieltsTab: 'learn', ieltsView: 'writing-work', ieltsWork: id });
        } catch (e) {
          submitting = false; close();
          st.error = e?.code === 'CONTENT_QUOTA_EXCEEDED' || e?.status === 429 ? RL.quotaMessage(e) : e?.serverMessage || e?.message || t('ieltsReading.submitFailed');
          paintClock();
        }
      }
      const timer = setInterval(paintClock, 1000);
      const onHide = () => saveNow();
      addEventListener('pagehide', onHide);
      App.onLeave(() => { clearInterval(timer); clearTimeout(flashT); if (saveT) { clearTimeout(saveT); saveNow(); } removeEventListener('pagehide', onHide); });

      if (M) hdr = MockKit.header({ M, section: 'writing', part: M.part, clock: { el: clock }, saver: sv, submitLabel: t(M.isLast ? 'ieltsMock.submitSection' : 'ieltsMock.toTask2'), onSubmit: () => askSubmit(), submitDisabled: !st.text.trim() });
      put(root,
        hdr || h('header', { class: 'runbar wrun__top' },
          h('span', { class: 'brand__mark runbar__mark', 'aria-hidden': 'true' }, DOM.svg(DOM.BRAND)),
          h('span', { class: 'runbar__title' }, `Writing ${taskName} · ${test.title}`),
          h('span', { class: 'grow' }), clock, saved,
          h('a', { class: 'btn btn--secondary btn--sm', href: back }, icon('arrowL', 'ic16'), t('ieltsWriting.w2.back'))),
        notice,
        h('div', { class: 'wrun__body' },
          h('aside', { class: 'wrun__left' },
            h('section', { class: 'card stack-sm wrun__prompt' }, h('span', { class: 'xs muted' }, t('ieltsWriting.w2.meta', { task: taskName, n: minW, m: Math.round(W / 60) })), taskBlock(doc)),
            !M && h('section', { class: 'card stack-sm wrun__hints' }, h('h2', null, t('ieltsWriting.w2.hints')), steps,
              h('p', { class: 'wrun__tip small' }, icon('bulb', 'ic16'), h('span', null, t(`ieltsWriting.p.plan.${kk}.note`))),
              h('p', { class: 'wrun__ai small' }, icon('spark', 'ic16'), h('span', null, t('ieltsWriting.w2.aiNote'))))),
          h('main', { class: 'card wrun__card' }, ta, bar, !M && h('div', { class: 'row wrun__actions' }, submitBtn, saveBtn))));
      paintClock(); paintBar();
      setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); });
      return root;
    },
  };

  // ---------- review (HF) ----------
  function markErrors(text, errors) {
    if (!errors?.length) return [text];
    const hits = [];
    for (const e of errors) {
      const q = String(e.quote || '').trim(); if (!q) continue;
      const i = text.indexOf(q); if (i < 0) continue;
      hits.push({ s: i, e: i + q.length, err: e });
    }
    hits.sort((a, b) => a.s - b.s);
    const out = []; let at = 0;
    for (const x of hits) {
      if (x.s < at) continue;
      out.push(text.slice(at, x.s), h('mark', { class: 'wmine__err', title: `${x.err.issue || ''} → ${x.err.correction || ''}` }, text.slice(x.s, x.e)));
      at = x.e;
    }
    out.push(text.slice(at));
    return out;
  }
  function markLinkers(text, linkers) {
    const hits = [];
    for (const l of linkers || []) {
      const i = text.indexOf(l.text); if (i < 0 || !l.text) continue;
      hits.push({ s: i, e: i + l.text.length, l });
    }
    hits.sort((a, b) => a.s - b.s);
    const out = []; let at = 0;
    for (const x of hits) {
      if (x.s < at) continue;
      out.push(text.slice(at, x.s), h('mark', { class: 'wlinker', title: loc(x.l.note), tabindex: '0' }, text.slice(x.s, x.e)));
      at = x.e;
    }
    out.push(text.slice(at));
    return out;
  }
  const ERR_UI = (c) => (['quota', 'grading_unavailable', 'already'].includes(c) ? c : 'other');

  Screens['learn:writing-work'] = {
    async render(p) {
      const id = p.ieltsWork;
      let view = await Api.attempt(id);
      const st = { busy: false, err: null, showModel: true, coach: null, sc: { ...(view.answers?.selfCheck || {}) } };
      const [model, scDoc] = await Promise.all([
        Api.writingModel(view.testId).catch(() => null),
        Api.test('WR-SELFCHECK').then((r) => r.document).catch(() => null),
      ]);
      const root = h('div', { class: 'stack wwork' });
      async function grade() {
        st.busy = true; st.err = null; paint();
        try { view = await Api.assessIeltsWriting(id, I18n.lang); }
        catch (e) { st.err = e?.code || 'failed'; try { view = await Api.attempt(id); } catch {} }
        st.busy = false; paint();
      }
      function paint() {
        const doc = view.document || {}, r = view.result || {}, a = view.attempt || {}, d = r.details || {};
        const k = kindKey(doc);
        const O = st.busy ? 'grading' : r.status;
        const done = O === 'done';
        const text = view.answers?.text || '';
        const P = paragraphs(text);
        const retry = learnHref('writing-works', { ieltsTest: view.testId });
        put(root,
          crumbsTo({ label: t('ieltsLearn.writing.works'), href: learnHref('writing-works') }),
          h('header', { class: 'ph' }, h('h1', { class: 'ph__title' }, doc.title || t('ieltsWriting.p.work.title')),
            h('p', { class: 'ph__sub muted' }, [doc.kind === 'task2' ? 'Task 2' : 'Task 1', catLabel(doc.kind, docCat(doc)), DOM.date(a.finishedAt)].filter(Boolean).join(' · '))),
          done ? h('section', { class: 'card wscore' },
            h('div', { class: 'wscore__band' }, h('span', null, t('ieltsWriting.band')), h('b', null, bandTxt(a.band))),
            h('div', { class: 'wscore__crit' }, CRIT.map((c) => h('div', null, h('b', null, bandTxt(r.criteria?.[c])), h('span', null, critLabel(c, k))))),
            r.feedback && h('p', { class: 'wscore__fb' }, r.feedback),
            h('div', { class: 'row' }, h('a', { class: 'btn btn--primary', href: retry }, t('ieltsWriting.p.work.again'))))
            : h('section', { class: 'card wstatus' + (r.status === 'failed' || st.err ? ' is-bad' : ''), role: 'status' },
              h('span', { class: 'wstatus__ic' }, icon(O === 'grading' ? 'spark' : 'clock')),
              h('div', { class: 'grow stack-sm' },
                h('b', null, O === 'grading' ? t('ieltsWriting.gradingTitle') : t('ieltsWriting.p.work.pendingTitle')),
                h('p', { class: 'small' }, O === 'grading' ? t('ieltsWriting.gradingText') : st.err ? t('ieltsWriting.gradeError.' + ERR_UI(st.err)) : t('ieltsWriting.pendingText'))),
              O !== 'grading' && h('button', { class: 'btn btn--primary', type: 'button', onclick: grade }, icon('spark', 'ic16'), t('ieltsWriting.gradeNow'))),
          done && (d.criteriaNotes?.length || d.nextSteps?.length) && h('section', { class: 'card stack wdet' },
            h('h3', null, t('ieltsWriting.d.title')),
            h('div', { class: 'wdet__crits' }, (d.criteriaNotes || []).map((n) => h('article', { class: 'wdet__crit' },
              h('header', null, h('b', null, critLabel(n.criterion, k)), h('span', { class: 'wdet__band' }, bandTxt(r.criteria?.[n.criterion]))),
              h('p', { class: 'small' }, h('small', { class: 'muted' }, t('ieltsWriting.d.why')), ' ', n.why),
              n.nextBand && h('p', { class: 'small wdet__next' }, h('small', null, t('ieltsWriting.d.next')), ' ', n.nextBand)))),
            h('div', { class: 'grid-2' },
              d.strengths?.length > 0 && h('div', { class: 'wdet__list is-good' }, h('h4', null, t('ieltsWriting.d.strengths')), h('ul', null, d.strengths.map((s) => h('li', null, icon('check', 'ic16'), h('span', null, s))))),
              d.nextSteps?.length > 0 && h('div', { class: 'wdet__list is-next' }, h('h4', null, t('ieltsWriting.d.steps')), h('ol', null, d.nextSteps.map((s, i) => h('li', null, h('span', { class: 'wdet__n' }, i + 1), h('span', null, s)))))),
            d.vocabulary?.length > 0 && h('div', { class: 'wdet__vocab' }, h('h4', null, t('ieltsWriting.d.vocab')),
              d.vocabulary.map((v) => h('div', { class: 'wdet__vrow' }, h('s', { lang: 'en' }, v.word), h('span', { lang: 'en' }, '→ ' + (v.better || []).join(' · ')), v.note && h('small', { class: 'muted' }, v.note))))),
          done && d.developmentTips?.length > 0 && h('section', { class: 'card stack wcoach' },
            h('h3', null, t('ieltsWriting.c.devTitle')), h('p', { class: 'small muted' }, t('ieltsWriting.c.devHint')),
            h('ol', { class: 'wcoach__tips' }, d.developmentTips.map((x, i) => h('li', null, h('span', { class: 'wdet__n' }, i + 1), h('div', { class: 'stack-sm grow' },
              h('div', { class: 'chips' }, h('span', { class: 'badge badge--brand' }, t('ieltsWriting.c.area.' + x.area) || x.area), h('span', { class: 'badge' }, x.paragraph ? t('ieltsWriting.c.paragraph', { n: x.paragraph }) : t('ieltsWriting.c.wholeText'))),
              h('p', null, x.tip), x.example && h('p', { class: 'wcoach__example small' }, h('small', null, t('ieltsWriting.c.example')), ' ', h('span', { lang: 'en' }, x.example))))))),
          done && coach(d, k, P),
          done && (r.errors?.length || r.rewrites?.length) && h('section', { class: 'card stack wfix' },
            h('h3', null, t('ieltsWriting.errorsTitle')),
            (r.errors || []).map((e) => h('div', { class: 'wfix__row' }, h('span', { class: 'badge' }, t('ieltsWriting.critShort.' + e.criterion) || e.criterion),
              h('p', { lang: 'en' }, h('s', null, e.quote), ' → ', h('b', null, e.correction)), e.issue && h('p', { class: 'small muted' }, e.issue))),
            !d.sentences?.length && r.rewrites?.length > 0 && [h('h3', null, t('ieltsWriting.rewritesTitle')),
              r.rewrites.map((x) => h('div', { class: 'wfix__row' }, h('p', { class: 'small muted', lang: 'en' }, x.original), h('p', { lang: 'en' }, h('b', null, x.improved))))]),
          h('div', { class: 'wwork__grid' },
            mine(view, done, P),
            modelCard(model)),
          selfCheck(doc, k));
      }
      function coach(d, k, P) {
        const sent = d.sentences || [], essay = d.improvedEssay || [];
        if (!sent.length && !essay.length) return null;
        if (!st.coach) st.coach = sent.length ? 'sent' : 'essay';
        const tabs = sent.length && essay.length ? h('div', { class: 'chips', role: 'tablist' },
          [['sent', t('ieltsWriting.c.bySentence', { n: sent.length })], ['essay', t('ieltsWriting.c.whole')]].map(([key, lbl]) => h('button', { type: 'button', class: 'chip', role: 'tab', 'aria-selected': String(st.coach === key), onclick: () => { st.coach = key; paint(); } }, lbl))) : null;
        let panel;
        if (st.coach === 'sent') {
          const byP = [...new Set(sent.map((s) => s.paragraph || 1))].sort((a, b) => a - b);
          panel = byP.map((n) => h('div', { class: 'stack-sm' }, h('h4', null, t('ieltsWriting.c.paragraph', { n })),
            sent.filter((s) => (s.paragraph || 1) === n).map((s) => h('article', { class: 'wcoach__item' },
              h('p', { class: 'wcoach__was', lang: 'en' }, h('small', null, t('ieltsWriting.c.yours')), s.original),
              h('p', { class: 'wcoach__now', lang: 'en' }, h('small', null, t('ieltsWriting.c.better')), s.improved),
              h('p', { class: 'wcoach__why small' }, s.criterion && h('span', { class: 'badge' }, critLabel(s.criterion, k)), ' ', s.why)))));
        } else {
          panel = [h('p', { class: 'small muted' }, t('ieltsWriting.c.wholeHint')),
            essay.map((txt, i) => h('div', { class: 'wcoach__pair' },
              h('div', null, h('small', { class: 'muted' }, `${t('ieltsWriting.c.paragraph', { n: i + 1 })} · ${t('ieltsWriting.c.yours')}`), h('p', { lang: 'en' }, P[i] || '—')),
              h('div', null, h('small', { class: 'muted' }, `${t('ieltsWriting.c.paragraph', { n: i + 1 })} · ${t('ieltsWriting.c.better')}`), h('p', { lang: 'en' }, txt))))];
        }
        return h('section', { class: 'card stack wcoach' }, h('h3', null, t('ieltsWriting.c.title')), tabs, panel);
      }
      function mine(v, done, P) {
        const r = v.result || {}, doc = v.document || {}, d = r.details || {};
        const words = r.words ?? countWords(v.answers?.text);
        const minW = r.minWords || minWords(doc);
        const under = r.underLength ?? words < minW;
        const ts = v.attempt?.timeSec;
        return h('section', { class: 'card stack wmine' },
          h('header', { class: 'row row--between' }, h('h3', null, t('ieltsWriting.yourText')), h('span', { class: 'small muted' }, DOM.date(v.attempt?.finishedAt))),
          h('div', { class: 'chips' }, h('span', { class: 'badge ' + (under ? 'badge--warn' : 'badge--ok') }, t('ieltsWriting.p.work.words', { words: t('ieltsWriting.wordsN', { n: words }), min: minW })),
            h('span', { class: 'badge' }, t('ieltsWriting.p.work.paragraphs', { n: P.length })),
            ts != null && h('span', { class: 'badge' }, icon('clock', 'ic12'), ' ', t('ieltsWriting.timeOf', { time: WX(ts), n: Math.round((r.timeLimitSec || 2400) / 60) }))),
          P.map((txt, i) => {
            const meta = (d.paragraphs || []).find((x) => x.index === i + 1);
            return h('div', { class: 'wmine__p' },
              h('span', { class: 'xs muted' }, t('ieltsWriting.p.work.paragraph', { n: i + 1, words: t('ieltsWriting.wordsN', { n: countWords(txt) }) }) + (meta?.role ? ' · ' + meta.role : '')),
              h('p', { lang: 'en' }, markErrors(txt, done ? r.errors : null)),
              meta?.comment && h('p', { class: 'wmine__note small' }, icon('about', 'ic16'), h('span', null, meta.comment)));
          }),
          h('details', { class: 'wmine__task' }, h('summary', null, t('ieltsWriting.p.work.showTask')), taskBlock(doc)));
      }
      function modelCard(m) {
        const has = m && Array.isArray(m.text) && m.text.length;
        const an = m?.analysis || {};
        return h('section', { class: 'card stack wmodel' },
          h('header', { class: 'row' }, h('h3', null, t('ieltsWriting.p.model.title')), has && m.band != null && h('span', { class: 'badge badge--brand' }, `band ${m.band}`), h('span', { class: 'grow' }),
            has && h('button', { class: 'link', type: 'button', onclick: () => { st.showModel = !st.showModel; paint(); } }, st.showModel ? t('ieltsWriting.hide') : t('ieltsWriting.show'))),
          !has ? h('p', { class: 'small muted' }, t('ieltsWriting.noModel'))
            : st.showModel && [m.text.map((txt, i) => {
              const pa = an.paragraphs?.[i];
              return h('div', { class: 'stack-sm' }, pa?.role && h('span', { class: 'badge badge--brand' }, t('ieltsWriting.p.role.' + pa.role) || pa.role),
                h('p', { lang: 'en' }, markLinkers(txt, an.linkers)), pa?.note && h('p', { class: 'wmine__note small' }, icon('about', 'ic16'), h('span', null, loc(pa.note))));
            }),
            an.strengths?.length > 0 && h('div', { class: 'wmodel__strengths stack-sm' }, h('h4', null, t('ieltsWriting.p.model.strengths')),
              an.strengths.map((s) => h('div', null, h('b', null, loc(s.title)), h('p', { class: 'small' }, loc(s)), s.example && h('p', { class: 'small muted', lang: 'en' }, `«${s.example}»`))))]);
      }
      function selfCheck(doc, k) {
        const crits = (scDoc?.criteria || []).filter((c) => !c.kinds || c.kinds.includes(k))
          .map((c) => ({ ...c, questions: (c.questions || []).filter((q) => !q.kinds || q.kinds.includes(k)) })).filter((c) => c.questions.length);
        if (!crits.length) return null;
        const total = crits.reduce((s, c) => s + c.questions.length, 0);
        return h('section', { class: 'card stack wsc' },
          h('header', { class: 'row' }, h('h3', null, t('ieltsWriting.p.sc.title')), h('span', { class: 'grow' }), h('span', { class: 'badge' }, t('ieltsWriting.p.sc.count', { n: Object.keys(st.sc).length, total }))),
          h('div', { class: 'wsc__grid' }, crits.map((c) => h('div', { class: 'wsc__crit stack-sm' },
            h('b', null, t('ieltsWriting.critName.' + c.key)), h('p', { class: 'small muted' }, loc(c.what)),
            c.questions.map((q) => {
              const key = `${c.key}.${q.key}`, ans = st.sc[key];
              return h('div', { class: 'wsc__q stack-sm' }, h('p', { class: 'small' }, loc(q.q)),
                h('div', { class: 'pills', role: 'radiogroup', 'aria-label': loc(q.q) }, ['yes', 'no', 'unsure'].map((v) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(ans === v), class: 'pill' + (ans === v ? ` is-on is-${v}` : ''),
                  onclick: () => { if (st.sc[key] === v) delete st.sc[key]; else st.sc[key] = v; Api.selfCheck(id, st.sc).catch(() => {}); paint(); } }, t('ieltsWriting.p.sc.ans.' + v)))),
                (ans === 'no' || ans === 'unsure') && q.tip && h('p', { class: 'wsc__tip small' }, loc(q.tip), q.guide && [' ', h('a', { class: 'link', href: learnHref('writing-guide') }, t('ieltsWriting.openGuide'))]));
            })))),
          h('p', { class: 'small muted' }, t('ieltsWriting.p.sc.noBand')));
      }
      paint();
      if (AUTO.has(String(id)) && view.result?.status === 'pending_ai') { AUTO.delete(String(id)); grade(); }
      return root;
    },
  };

  // ---------- works lists (HP), shared by Writing and Speaking ----------
  async function worksPage(skill) {
    const W = skill === 'writing';
    const title = W ? t('ieltsLearn.writing.works') : t('ieltsSpeaking.works');
    const head = [Practice.crumbs({ label: t('ieltsHub.tab.learn'), href: learnHref() }, { label: W ? 'Writing' : 'Speaking', href: learnHref('skill-' + skill) }, { label: title }),
      Hub.pageHead({ title, sub: t('ieltsWriting.worksText') })];
    let rows, cat;
    try { [rows, cat] = await Promise.all([W ? Api.writingWorks() : Api.speakingWorks(), W ? Api.tests('writing').catch(() => []) : []]); }
    catch (e) {
      if (e?.status === 401) return h('div', { class: 'stack practice' }, head, Hub.empty({ icon: 'lock', title: t('ieltsReading.guestTitle'), text: t('ieltsReading.guestText') }));
      return h('div', { class: 'stack practice' }, head, DOM.errorBox(e, () => App.render()));
    }
    rows = Array.isArray(rows) ? rows : rows?.items || [];
    const drafts = W ? Draft.all().map((d) => ({ ...d, test: (cat || []).find((x) => String(x.id) === String(d.testId)) })).filter((d) => d.test) : [];
    if (!rows.length && !drafts.length) return h('div', { class: 'stack practice' }, head, Hub.empty({ icon: W ? 'writing' : 'speaking', title: t('ieltsWriting.noWorksTitle'), text: t('ieltsWriting.noWorksText') }));
    const status = (r) => (r.status === 'done' && r.band != null ? `band ${bandTxt(r.band)}` : t('ieltsWriting.status.' + (r.status === 'grading' ? 'grading' : r.status === 'failed' ? 'failed' : 'pending')));
    const row = (href, title2, meta, last, pending) => h('li', null, h('a', { class: 'prow is-compact wrow', href }, Hub.plate(skill, 36),
      h('span', { class: 'prow__body' }, h('b', null, title2), h('span', { class: 'prow__meta' }, meta)),
      h('span', { class: 'wrow__last' + (pending ? ' is-pending' : '') }, last), icon('chevronR', 'ic16')));
    return h('div', { class: 'stack practice' }, head,
      drafts.length > 0 && [h('h3', null, t('ieltsWriting.p.works.drafts')),
        h('ul', { class: 'prows' }, drafts.map((d) => row(learnHref('writing-works', { ieltsTest: d.testId }), d.test.title,
          [d.test.kind === 'task2' ? 'Task 2' : 'Task 1', catLabel(d.test.kind, d.test.category), t('ieltsWriting.wordsN', { n: d.words }), DOM.date(new Date(d.savedAt))].filter(Boolean).join(' · '), t('ieltsWriting.p.card.draft'), true)))],
      rows.length > 0 && [drafts.length > 0 && h('h3', null, t('ieltsWriting.p.works.submitted')),
        h('ul', { class: 'prows' }, rows.map((r) => row(learnHref(W ? 'writing-work' : 'speaking-work', { ieltsWork: r.attemptId }), r.title,
          (W ? [r.kind === 'task2' ? 'Task 2' : 'Task 1', catLabel(r.kind, r.category), r.words != null && t('ieltsWriting.wordsN', { n: r.words }), DOM.date(r.finishedAt)]
            : [t('ielts.term.part', { n: String(r.kind || '').slice(4) }), DOM.date(r.finishedAt)]).filter(Boolean).join(' · '), status(r), !(r.status === 'done' && r.band != null))))]);
  }
  Screens['learn:writing-works'] = { render: () => worksPage('writing') };
  Screens['learn:speaking-works'] = { render: () => worksPage('speaking') };

  // ---------- guide «Как писать» (HB/HW/Hq/HO) ----------
  const gapPattern = (s) => String(s || '').split(/(\[[^\]]+\])/).map((x) => (/^\[.*\]$/.test(x) ? h('mark', { class: 'wgap' }, x) : x));
  const exLine = (ex) => ex && h('p', { class: 'small muted', lang: 'en' }, `«${ex}»`);
  const where = (k) => t('ieltsWriting.p.guide.where.' + k);
  Screens['learn:writing-guide'] = {
    async render(p) {
      const tr = App.track();
      let doc;
      try { doc = (await Api.test('WR-GUIDE')).document; } catch (e) { return h('div', { class: 'stack' }, crumbsTo({ label: t('ieltsWriting.p.guide.title') }), DOM.errorBox(e, () => App.render())); }
      const parts = (doc?.parts || []).filter((x) => !x.module || x.module === 'both' || x.module === tr);
      const part = parts.find((x) => x.key === p.part);
      const guideHref = learnHref('writing-guide');
      if (!part) {
        return h('div', { class: 'stack practice' }, crumbsTo({ label: t('ieltsWriting.p.guide.title') }),
          Hub.pageHead({ title: t('ieltsWriting.p.guide.title'), sub: t('ieltsWriting.p.guide.sub') }),
          h('div', { class: 'wguide__grid' }, parts.map((x) => h('a', { class: 'card wguide__card', href: learnHref('writing-guide', { part: x.key }) },
            h('b', null, t(`ieltsWriting.p.guide.part.${x.key}.title`) || x.key), h('span', { class: 'small muted' }, t(`ieltsWriting.p.guide.part.${x.key}.text`)),
            h('span', { class: 'link' }, t('ieltsWriting.p.guide.open'), icon('arrowR', 'ic16'))))),
          h('p', { class: 'pnote' }, icon('about', 'ic16'), t('ieltsWriting.p.guide.note')));
      }
      const ptitle = t(`ieltsWriting.p.guide.part.${part.key}.title`) || part.key;
      const kinds = (part.kinds || []).filter((k) => k.skeleton?.length);
      const tabs = [...kinds.map((k) => ({ key: 'k:' + k.key, label: catLabel(part.task === 2 ? 'task2' : 'task1', k.key), kind: k })),
        ...(part.blocks || []).map((b) => ({ key: 'b:' + b.key, label: t('ieltsWriting.p.guide.tabShort.' + b.key) || b.key, block: b }))];
      let cur = tabs[0]?.key;
      const host = h('div', { class: 'stack' });
      const tabBox = h('div', { class: 'chips', role: 'tablist', 'aria-label': t('ieltsWriting.p.guide.tab.label') });
      function paint() {
        put(tabBox, tabs.map((x) => h('button', { type: 'button', class: 'chip', role: 'tab', 'aria-selected': String(cur === x.key), onclick: () => { cur = x.key; paint(); } }, x.label)));
        const tb = tabs.find((x) => x.key === cur);
        put(host, tb?.kind ? kindTab(tb.kind, part) : tb?.block ? blockTab(tb.block) : null);
      }
      paint();
      return h('div', { class: 'stack practice wguide' },
        crumbsTo({ label: t('ieltsWriting.p.guide.title'), href: guideHref }, { label: ptitle }),
        Hub.pageHead({ title: ptitle }),
        part.rules?.length > 0 && h('section', { class: 'card card--brand stack-sm wguide__rules' }, h('h3', null, t('ieltsWriting.p.guide.block.rules')), h('ul', { class: 'bul' }, part.rules.map((r) => h('li', null, loc(r))))),
        tabs.length > 1 && tabBox, host);
    },
  };
  function kindTab(k, part) {
    const s = k.sample;
    return [
      s && h('section', { class: 'card stack' }, h('h3', null, t('ieltsWriting.p.guide.block.sample')),
        s.question && h('p', { class: 'wguide__q', lang: 'en' }, s.question), chart(s.chart),
        s.text?.length > 0 && [h('h4', null, t('ieltsWriting.p.guide.sampleAnswer')),
          s.text.map((txt, i) => h('div', { class: 'stack-sm' }, s.roles?.[i] && h('span', { class: 'badge badge--brand' }, t('ieltsWriting.p.role.' + s.roles[i]) || s.roles[i]), h('p', { lang: 'en' }, txt)))]),
      h('section', { class: 'card stack' }, h('h3', null, t('ieltsWriting.p.guide.block.skeleton')),
        h('ol', { class: 'wguide__skel' }, k.skeleton.map((x) => h('li', { class: 'stack-sm' }, h('span', { class: 'badge badge--brand' }, t('ieltsWriting.p.role.' + x.role) || x.role), h('p', null, loc(x.what)), exLine(x.ex))))),
      k.phrases?.length > 0 && h('section', { class: 'card stack' }, h('h3', null, t('ieltsWriting.p.guide.block.phrases')), h('p', { class: 'small muted' }, t('ieltsWriting.p.guide.gapHint')),
        k.phrases.map((g) => h('div', { class: 'stack-sm' }, h('span', { class: 'badge' }, t('ieltsWriting.p.role.' + g.role) || g.role),
          (g.rows || []).map((r) => h('div', { class: 'wguide__row' }, h('p', { lang: 'en' }, gapPattern(r.pattern)), exLine(r.ex)))))),
      k.register?.length > 0 && h('section', { class: 'card stack' }, h('h3', null, t('ieltsWriting.p.guide.block.register', { register: t('ieltsWriting.p.register.' + k.key) || k.key })),
        k.register.map((r) => h('div', { class: 'wguide__row' }, h('p', { lang: 'en' }, h('b', null, t('ieltsWriting.p.guide.col.ok') + ': '), r.ok), h('p', { lang: 'en' }, h('b', null, t('ieltsWriting.p.guide.col.no') + ': '), h('s', null, r.no)), h('p', { class: 'small muted' }, loc(r.why))))),
      k.mistakes?.length > 0 && h('section', { class: 'card stack' }, h('h3', null, t('ieltsWriting.p.guide.block.mistakes')),
        k.mistakes.map((r) => h('div', { class: 'wguide__row' }, h('p', { lang: 'en' }, h('b', null, t('ieltsWriting.p.guide.col.bad') + ': '), h('s', null, r.bad)), h('p', { lang: 'en' }, h('b', null, t('ieltsWriting.p.guide.col.good') + ': '), r.good), h('p', { class: 'small muted' }, loc(r.why))))),
    ];
  }
  function blockTab(b) {
    return (b.groups || []).map((g) => h('section', { class: 'card stack' },
      g.title && h('h3', null, loc(g.title)), g.note && h('p', { class: 'small muted' }, loc(g.note)),
      (g.rows || []).map((r) => h('div', { class: 'wguide__row' },
        r.pattern && h('p', { lang: 'en' }, gapPattern(r.pattern)),
        r.phrase && h('b', { lang: 'en' }, r.phrase),
        r.from && h('p', { lang: 'en' }, `${t('ieltsWriting.p.guide.col.from')}: ${r.from} → `, h('b', null, r.to)),
        r.worn && h('p', { lang: 'en' }, h('s', null, r.worn), ' → ', h('b', null, r.alt)),
        r.use && h('p', { class: 'small muted' }, loc(r.use)),
        r.where && h('p', { class: 'xs muted' }, [].concat(r.where).map((w) => where(w) || w).join(' · ')),
        exLine(r.ex)))));
  }

  Screens['learn:writing-task'] = { render: (p) => taskPage(p) };
  window.Writing = { chart, taskBlock, countWords, paragraphs, catLabel, kindLabel, worksPage, Draft, bandTxt, WX };
})();
