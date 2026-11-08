// Reading / Listening runners, attempt review and dictation/spelling — ai-tutor Vt, Vp, Vu, Vm.
// Checking and scoring are server-side (POST /tests/:id/check, /attempts); this file only renders.
(function () {
  const { h, icon } = DOM;
  const MODE_LBL = (m) => t('ieltsReading.mode.' + m);
  const put = (el, ...k) => el.replaceChildren(...k.flat(9).filter((x) => x != null && x !== false && x !== ''));
  const mmss = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

  // ---------- passage + highlighter (U2) ----------
  function segments(text, ranges) {
    const cuts = new Set([0, text.length]);
    ranges.forEach((r) => { cuts.add(Math.max(0, Math.min(text.length, r.start))); cuts.add(Math.max(0, Math.min(text.length, r.end))); });
    const pts = [...cuts].sort((a, b) => a - b);
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (a === b) continue;
      const hit = ranges.filter((r) => r.start <= a && r.end >= b);
      const s = text.slice(a, b);
      if (!hit.length) { out.push(s); continue; }
      const ans = hit.find((r) => r.kind === 'answer');
      out.push(h('mark', { class: (hit.some((r) => r.kind !== 'answer') ? 'hl' : '') + (ans ? ' hl--answer' : ''), 'data-n': ans && ans.start === a ? ans.n : null }, s));
    }
    return out;
  }
  const wordChar = /[\w'’-]/;
  function expand(text, s, e) {
    while (s > 0 && wordChar.test(text[s - 1])) s--;
    while (e < text.length && wordChar.test(text[e])) e++;
    return [s, e];
  }
  function subtract(list, key, s, e) {
    const out = [];
    for (const x of list) {
      if (x.key !== key || x.end <= s || x.start >= e) { out.push(x); continue; }
      if (x.start < s) out.push({ ...x, end: s });
      if (x.end > e) out.push({ ...x, start: e });
    }
    return out;
  }
  function passage(doc, ti, { highlights = [], mark = null, editable = false, noCopy = false, onChange, focusKey } = {}) {
    const text = (doc.texts || [])[ti];
    if (!text) return null;
    const multi = (doc.texts || []).length > 1;
    const art = h('article', { class: 'passage', oncopy: noCopy ? (e) => e.preventDefault() : null },
      h('h2', null, multi && text.label && h('span', { class: 'passage__tlabel' }, text.label), text.title),
      (text.paragraphs || []).map((p, pi) => {
        const key = `${ti}:${pi}`;
        const ranges = highlights.filter((x) => x.key === key).map((x) => ({ ...x, kind: 'hl' }));
        if (mark && mark.key === key) ranges.push({ start: mark.start, end: mark.end, kind: 'answer', n: mark.n });
        return h('p', { 'data-pkey': key, class: focusKey === key || mark?.key === key ? 'is-focus' : null },
          p.label && h('b', { class: 'passage__plabel' }, p.label + ' '), h('span', { 'data-ptext': key }, segments(p.text, ranges)));
      }));
    if (!editable) return art;

    let menu = null;
    const closeMenu = () => { menu?.remove(); menu = null; };
    function offsetIn(span, node, off) { const r = document.createRange(); r.setStart(span, 0); r.setEnd(node, off); return r.toString().length; }
    function openMenu(x, y, items) {
      closeMenu();
      menu = h('div', { class: 'hlmenu', role: 'menu', style: { left: x + 'px', top: y + 'px' } }, items);
      document.body.appendChild(menu);
      setTimeout(() => document.addEventListener('mousedown', function off(ev) { if (!menu?.contains(ev.target)) { closeMenu(); document.removeEventListener('mousedown', off); } }));
    }
    function onSelect(ev) {
      if (ev.type === 'mouseup' && ev.button === 2) return;
      const sel = getSelection();
      const span = ev.target.closest?.('[data-ptext]');
      if (!sel || sel.isCollapsed) {
        const m = ev.target.closest?.('mark.hl');
        if (ev.type === 'contextmenu' && m && span) {
          ev.preventDefault();
          const key = span.dataset.ptext, at = offsetIn(span, m.firstChild, 0);
          const hl = highlights.find((x) => x.key === key && x.start <= at && x.end > at);
          if (hl) openMenu(ev.pageX, ev.pageY, [h('button', { type: 'button', onclick: () => { closeMenu(); onChange(subtract(highlights, key, hl.start, hl.end)); } }, t('ieltsReading.marker.remove'))]);
        }
        return;
      }
      const a = sel.anchorNode?.parentElement?.closest('[data-ptext]'), b = sel.focusNode?.parentElement?.closest('[data-ptext]');
      if (!a || a !== b) return;
      if (ev.type === 'contextmenu') ev.preventDefault();
      const key = a.dataset.ptext;
      const full = a.textContent;
      let s = offsetIn(a, sel.anchorNode, sel.anchorOffset), e = offsetIn(a, sel.focusNode, sel.focusOffset);
      if (s > e) [s, e] = [e, s];
      [s, e] = expand(full, s, e);
      if (e <= s) return;
      const picked = full.slice(s, e).trim();
      const overlaps = highlights.some((x) => x.key === key && x.start < e && x.end > s);
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      const vocabBtn = picked.split(/\s+/).length <= 6 && h('button', { type: 'button', onclick: async (evt) => {
        const btn = evt.currentTarget; btn.disabled = true;
        try {
          const tr = await Api.translate(picked).catch(() => null);
          await Api.saveWord({ word: picked, translation: tr?.translation || tr?.text || tr?.result || '', source: 'ielts-reading' });
          btn.textContent = t('ieltsReading.vocab.saved');
        } catch { btn.textContent = t('ieltsReading.vocab.failed'); }
        setTimeout(closeMenu, 900);
      } }, t('ieltsReading.vocab.add'));
      openMenu(rect.left + scrollX, rect.bottom + scrollY + 6, [
        h('button', { type: 'button', onclick: () => {
          closeMenu(); sel.removeAllRanges();
          const next = subtract(highlights, key, s, e).concat({ key, start: s, end: e, color: 1 }).sort((x, y) => (x.key === y.key ? x.start - y.start : x.key < y.key ? -1 : 1));
          onChange(next);
        } }, h('span', { class: 'hlmenu__dot' }), t('ieltsReading.marker.add')),
        overlaps && h('button', { type: 'button', onclick: () => { closeMenu(); sel.removeAllRanges(); onChange(subtract(highlights, key, s, e)); } }, t('ieltsReading.marker.remove')),
        vocabBtn]);
    }
    art.addEventListener('mouseup', onSelect);
    art.addEventListener('contextmenu', onSelect);
    const coarse = matchMedia('(pointer: coarse)').matches;
    const tiKeys = (k) => k.startsWith(ti + ':');
    return h('div', { class: 'stack-sm' },
      h('div', { class: 'markerbar' }, h('span', { class: 'badge' }, h('span', { class: 'hlmenu__dot' }), t('ieltsReading.marker.label')),
        h('span', { class: 'xs muted grow' }, t(coarse ? 'ieltsReading.marker.hintTouch' : 'ieltsReading.marker.hint')),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', disabled: !highlights.some((x) => tiKeys(x.key)),
          onclick: () => onChange(multi ? highlights.filter((x) => !tiKeys(x.key)) : []) }, t('ieltsReading.marker.clear'))),
      art);
  }

  // evidence locate (U3)
  function findQuote(text, quote) {
    const frags = String(quote).split(/…|\.\.\./).map((s) => s.trim()).filter(Boolean);
    const low = text.toLowerCase();
    let pos = 0, start = -1, end = -1;
    for (const f of frags) {
      const i = low.indexOf(f.toLowerCase(), pos);
      if (i < 0) return null;
      if (start < 0) start = i;
      end = i + f.length; pos = end;
    }
    return start < 0 ? null : { start, end };
  }
  function locate(doc, item, group) {
    const texts = doc.texts || [];
    const a = item.textAnchor;
    if (a) {
      const lbl = a.text || group?.text;
      const ti = Math.max(0, lbl ? texts.findIndex((x) => String(x.label) === String(lbl)) : 0);
      const pi = (texts[ti]?.paragraphs || []).findIndex((p) => p.label === a.paragraph);
      if (pi >= 0) {
        const txt = texts[ti].paragraphs[pi].text;
        const f = item.quote ? findQuote(txt, item.quote) : null;
        if (f || !item.quote) return { key: `${ti}:${pi}`, start: f ? f.start : 0, end: f ? f.end : 0, label: a.paragraph, textLabel: texts[ti].label, found: !!f, ti };
      }
    }
    if (item.quote) {
      for (let ti = 0; ti < texts.length; ti++) {
        for (let pi = 0; pi < (texts[ti].paragraphs || []).length; pi++) {
          const f = findQuote(texts[ti].paragraphs[pi].text, item.quote);
          if (f) return { key: `${ti}:${pi}`, ...f, label: texts[ti].paragraphs[pi].label, textLabel: texts[ti].label, found: true, ti };
        }
      }
    }
    return null;
  }
  const textIndexOf = (doc, label) => Math.max(0, label != null ? (doc.texts || []).findIndex((x) => String(x.label) === String(label)) : 0);
  const textTabLabel = (doc, x, i) => (doc.kind === 'test' && /^\d+$/.test(String(x.label)) ? t('ielts.term.passage', { n: x.label }) : `${t('ieltsReading.text')} ${x.label || i + 1}`);
  function selectLettersFor(doc) {
    return (g) => {
      if (g.type === 'matching_information') {
        const texts = g.text != null ? (doc.texts || []).filter((x) => String(x.label) === String(g.text)) : doc.texts || [];
        const ls = [...new Set(texts.flatMap((x) => (x.paragraphs || []).map((p) => p.label).filter(Boolean)))];
        return ls.length ? ls : (doc.texts || []).map((x) => x.label).filter(Boolean);
      }
      return (g.headings || g.options || []).map((o) => o.key);
    };
  }

  // ---------- run header (WR) ----------
  function runbar({ chip, mode, clock, onBig, submitLabel, onSubmit, backHref, onBack, extra }) {
    return h('header', { class: 'runbar' },
      h('span', { class: 'brand__mark runbar__mark', 'aria-hidden': 'true' }, DOM.svg(DOM.BRAND)),
      h('span', { class: 'runbar__title' }, chip),
      mode && h('span', { class: 'badge runbar__mode' }, t('ieltsReading.modeChip', { mode: MODE_LBL(mode).toLowerCase() })),
      extra, clock,
      onBig && h('button', { class: 'icon-btn', type: 'button', title: t('ieltsReading.fontSize'), 'aria-label': t('ieltsReading.fontSize'), onclick: onBig }, h('b', null, 'Aa')),
      h('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: onSubmit }, submitLabel),
      h('a', { class: 'btn btn--secondary btn--sm', href: backHref, onclick: onBack }, t('ieltsReading.back')));
  }

  function numNav({ label, entries, run, onPick, total, answered, partTabs, showFlags = true }) {
    const idx = Math.max(0, entries.findIndex((e) => e.id === run.current));
    return h('nav', { class: 'runnav', 'aria-label': label },
      h('b', { class: 'runnav__lbl' }, label),
      h('div', { class: 'runnav__nums' }, entries.map((e) => {
        const res = run.checked[e.id];
        return h('button', { type: 'button', class: 'qn' + (RL.isAnswered(run.answers[e.id]) ? ' is-answered' : '') + (run.current === e.id ? ' is-current' : '') + (res ? (res.correct ? ' is-ok' : ' is-bad') : ''),
          'aria-label': t('ieltsReading.answer') + ' ' + RL.numLabel(e), 'aria-current': run.current === e.id ? 'true' : null, onclick: () => onPick(e.id) },
        RL.numLabel(e), showFlags && run.flags[e.id] && h('i', { class: 'qn__flag' }));
      })),
      h('span', { class: 'xs muted' }, t('ieltsReading.answeredOf', { n: answered, total })),
      partTabs,
      h('div', { class: 'row', style: { gap: '6px' } },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('ieltsReading.prev'), disabled: idx <= 0, onclick: () => onPick(entries[idx - 1].id) }, icon('arrowL')),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('ieltsReading.next'), disabled: idx >= entries.length - 1, onclick: () => onPick(entries[idx + 1].id) }, icon('arrowR'))));
  }
  const scrollToQ = (id) => document.getElementById('q-' + id)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const reviewHref = (p, attemptId) => Router.href({ screen: 'ielts-reading-review', ieltsWork: attemptId, backTab: p.backTab || null, backView: p.backView || null });

  // ---------- Reading runner (Vt) ----------
  Screens['ielts-reading-run'] = {
    fullscreen: true,
    title: () => 'Reading',
    async render(p) {
      const { test, document: doc } = await Api.test(p.ieltsTest);
      const entries = RL.entriesOf(doc);
      const total = RL.totalQ(entries);
      const M = p.mock; // full mock session: server deadline + server draft
      const draft = !M && RL.Draft.get(test.id);
      const mode = M ? 'exam' : ['exam', 'practice', 'study'].includes(p.mode) ? p.mode : draft?.mode || 'practice';
      let run;
      if (M) {
        const d = M.draft?.run?.testId === test.id ? M.draft.run : null;
        run = d ? { ...d, shownAt: Date.now(), checked: {}, flags: d.flags || {}, highlights: d.highlights || [] } : RL.newRun(doc, 'exam', entries);
        run.endsAt = M.deadline;
      } else if (draft && draft.mode === mode) {
        const rem = RL.Draft.remaining(draft);
        run = { ...draft, endsAt: rem != null ? Date.now() + rem * 1000 : null, shownAt: Date.now(), checked: draft.checked || {}, highlights: draft.highlights || [] };
      } else run = RL.newRun(doc, mode, entries);
      const exam = mode === 'exam';
      let ti = 0, pane = 'questions', big = false, error = '', submitting = false;
      const checking = new Set();
      let mark = null;
      const sv = M && MockKit.saver(M, () => ({ run: { ...run, shownAt: 0 } }));
      const save = () => { if (!submitting) M ? sv.touch() : RL.Draft.save(run); };
      const back = RL.backHref(p, test.id);
      const lbl = RL.runLabel(doc);

      const root = h('div', { class: 'run run--rl', 'data-mode': mode });
      const clock = h('span', { class: 'runbar__timer', role: 'timer' });
      const textHost = h('div', { class: 'run__text' });
      const qHost = h('div', { class: 'run__questions' });
      const navHost = h('div', { class: 'runnav-wrap' });
      const paneTabs = h('div', { class: 'run__panes', role: 'tablist' });
      const body = h('div', { class: 'run__body', 'data-pane': pane, 'data-notext': (doc.texts || []).length ? null : 'true' }, textHost, qHost);

      function paintText() {
        const texts = doc.texts || [];
        put(textHost, 
          texts.length > 1 && h('div', { class: 'chips chips--sm', role: 'tablist' }, texts.map((x, i) => h('button', { type: 'button', class: 'chip', role: 'tab', 'aria-selected': String(i === ti), onclick: () => { ti = i; paintText(); } }, textTabLabel(doc, x, i)))),
          passage(doc, ti, { highlights: run.highlights, mark, editable: true, noCopy: exam, focusKey: mark?.key, onChange: (hl) => { run.highlights = hl; save(); paintText(); } }));
        textHost.querySelector('.is-focus')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      function showEvidence(rv, e) {
        const ent = e || entries.find((x) => x.id === run.current);
        const loc = locate(doc, { ...ent.item, quote: rv?.quote ?? ent.item.quote, textAnchor: rv?.textAnchor ?? ent.item.textAnchor }, ent.group);
        if (!loc) return;
        ti = loc.ti; mark = { key: loc.key, start: loc.start, end: loc.end, n: RL.numLabel(ent) };
        setPane('text'); paintText();
      }
      const ctx = {
        get run() { return run; }, mode, entries, paper: false, checking, selectLetters: selectLettersFor(doc),
        onFocus(id) {
          if (run.current === id) return;
          RL.focusQ(run, id);
          const g = entries.find((e) => e.id === id)?.group;
          const nti = textIndexOf(doc, g?.text);
          if (g?.text != null && nti !== ti) { ti = nti; paintText(); }
          paintNav(); qHost.querySelectorAll('.q.is-current').forEach((n) => n.classList.remove('is-current')); document.getElementById('q-' + id)?.classList.add('is-current');
        },
        onAnswer(id, v, o = {}) {
          ctx.onFocus(id); run.answers[id] = v; delete run.checked[id]; save();
          if (o.silent) { paintNav(); return; }
          const e = entries.find((x) => x.id === id);
          if (mode === 'study' && ['judgement', 'choice', 'select'].includes(RL.kindOf(e.type))) return ctx.onCheck(id);
          paintQ();
        },
        async onCheck(id) {
          checking.add(id); paintQ();
          try { run.checked[id] = await Api.check(test.id, { itemId: id, given: run.answers[id] }); error = ''; }
          catch { error = t('ieltsReading.checkFailed'); }
          checking.delete(id); save(); paintQ();
          if (mode === 'study' && run.checked[id]) showEvidence(run.checked[id].reveal, entries.find((x) => x.id === id));
        },
        onFlag(id) { run.flags[id] = !run.flags[id]; save(); paintQ(); },
        onShow: (rv) => showEvidence(rv),
      };
      function paintQ() {
        const st = qHost.scrollTop;
        put(qHost, error && h('div', { class: 'notice notice--danger', role: 'alert' }, error), ...(doc.groups || []).map((g) => RL.group(g, ctx)));
        qHost.scrollTop = st;
        paintNav();
      }
      function paintNav() {
        const answered = RL.answeredCount(entries, run.answers);
        put(paneTabs, ...['text', 'questions'].map((k) => h('button', { type: 'button', class: 'chip', role: 'tab', 'aria-selected': String(pane === k), onclick: () => setPane(k) },
          k === 'text' ? t('ieltsReading.paneText') : `${t('ieltsReading.paneQuestions')} · ${answered}/${total}`)));
        put(navHost, numNav({ label: lbl || 'Reading', entries, run, total, answered, onPick: (id) => { ctx.onFocus(id); setPane('questions'); scrollToQ(id); } }));
      }
      function setPane(k) { pane = k; body.dataset.pane = k; paintNav(); }

      async function submit() {
        if (submitting) return;
        submitting = true;
        try {
          const res = await Api.submitAttempt(test.id, RL.payload(run));
          if (M) { sv.cancel(); return await M.onSubmitted([res.attempt?.id ?? res.id]); }
          RL.Draft.drop(test.id);
          Router.go({ screen: 'ielts-reading-review', ieltsWork: res.attempt?.id ?? res.id, backTab: p.backTab || null, backView: p.backView || null });
        } catch (e) { submitting = false; error = RL.quotaMessage(e); paintQ(); }
      }
      const unansweredNums = () => entries.filter((e) => !RL.isAnswered(run.answers[e.id])).map((e) => RL.numLabel(e));
      const askSubmit = () => (M ? MockKit.confirm({ section: 'reading', unanswered: unansweredNums(), onConfirm: submit })
        : RL.confirmSubmit({ exam, unanswered: total - RL.answeredCount(entries, run.answers), onConfirm: submit }));

      // timer
      let tick = 0;
      function paintClock() {
        if (!run.endsAt) { clock.textContent = t('ieltsReading.noTimer'); clock.classList.add('is-off'); return; }
        const left = Math.max(0, Math.round((run.endsAt - Date.now()) / 1000));
        clock.textContent = M ? MockKit.clockTxt(left) + ' · ' + t('ieltsMock.byServer') : mmss(left); clock.classList.toggle('is-low', left <= 300);
        if (left === 0) { clearInterval(timer); submit(); }
        if (++tick % 10 === 0) save();
      }
      const timer = setInterval(paintClock, 1000);
      paintClock();
      const onHide = () => save();
      addEventListener('pagehide', onHide);
      document.addEventListener('visibilitychange', onHide);
      App.onLeave(() => { clearInterval(timer); save(); removeEventListener('pagehide', onHide); document.removeEventListener('visibilitychange', onHide); document.querySelector('.hlmenu')?.remove(); });

      const chipTxt = `Reading${lbl && !String(test.title).startsWith(lbl) ? ' · ' + lbl : ''} · ${test.title}`;
      const onBig = () => { big = !big; root.classList.toggle('run--big', big); };
      put(root,
        M ? MockKit.header({ M, section: 'reading', clock: { el: clock }, saver: sv, extra: h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('ieltsReading.fontSize'), onclick: onBig }, h('b', null, 'Aa')), submitLabel: t('ieltsMock.submitSection'), onSubmit: askSubmit })
          : runbar({ chip: chipTxt, mode, clock, onBig, submitLabel: t(exam ? 'ieltsReading.submit' : 'ieltsReading.finish'), onSubmit: askSubmit, backHref: back }),
        (doc.texts || []).length > 0 && paneTabs, body, navHost);
      paintText(); paintQ();
      return root;
    },
  };

  // ---------- audio player engine (Vc) + UI (Vh) ----------
  function makePlayer({ rules, onEnded, onChange }) {
    const audio = new Audio();
    audio.preload = 'metadata';
    const st = { plays: 0, playing: false, time: 0, dur: 0, rate: 1, error: false, lines: [], line: -1, rangeEnd: null, tts: null };
    const emit = () => onChange?.(st);
    function lineAt(tm) { let i = -1; st.lines.forEach((l, k) => { if (l.start != null && l.start <= tm) i = k; }); return i; }
    audio.addEventListener('timeupdate', () => {
      st.time = audio.currentTime; st.line = lineAt(st.time);
      if (st.rangeEnd != null && st.time >= st.rangeEnd) { audio.pause(); st.rangeEnd = null; }
      emit();
    });
    audio.addEventListener('loadedmetadata', () => { st.dur = audio.duration || st.dur; emit(); });
    audio.addEventListener('play', () => { st.playing = true; emit(); });
    audio.addEventListener('pause', () => { st.playing = false; emit(); });
    audio.addEventListener('ended', () => { st.playing = false; emit(); onEnded?.(); });
    audio.addEventListener('error', () => { if (audio.src) { st.error = true; emit(); } });
    // speechSynthesis fallback for parts without an audio file (TTS-only parts)
    function ttsPlay(from = 0) {
      if (!('speechSynthesis' in window)) { st.error = true; return emit(); }
      speechSynthesis.cancel();
      st.playing = true; emit();
      const speak = (i) => {
        if (i >= st.lines.length || !st.playing) { st.playing = false; st.line = -1; emit(); if (i >= st.lines.length) onEnded?.(); return; }
        st.line = i; st.time = st.lines[i].start; emit();
        const u = new SpeechSynthesisUtterance(st.lines[i].text); u.lang = 'en-GB'; u.rate = st.rate;
        u.onend = () => speak(i + 1);
        speechSynthesis.speak(u);
      };
      speak(Math.max(0, from));
    }
    return {
      st, audio,
      load(part, transcript) {
        audio.pause(); speechSynthesis?.cancel?.();
        Object.assign(st, { plays: 0, playing: false, time: 0, error: false, line: -1, rangeEnd: null, dur: part?.audio?.durationSec || 0 });
        const lines = transcript || part?.transcript || [];
        st.tts = !part?.audio?.url && part?.audio?.tts && lines.length ? true : null;
        let acc = 0;
        st.lines = lines.map((l, i) => {
          if (st.tts) { const est = Math.max(1, (l.text || '').split(/\s+/).length / 2.6 + 0.3); const o = { ...l, start: acc, end: acc + est }; acc += est; return o; }
          return { ...l, end: l.end ?? lines[i + 1]?.start };
        });
        if (st.tts) st.dur = acc;
        if (part?.audio?.url) audio.src = part.audio.url; else audio.removeAttribute('src');
        emit();
      },
      async play() {
        if (st.playing) return;
        const fromStart = st.time < 0.25 || audio.ended;
        if (fromStart && rules.maxPlays && st.plays >= rules.maxPlays) return;
        if (fromStart) st.plays++;
        if (st.tts) return ttsPlay(Math.max(0, st.line));
        audio.playbackRate = st.rate;
        try { await audio.play(); } catch (e) { if (fromStart) st.plays--; if (e.name !== 'NotAllowedError') st.error = true; emit(); }
      },
      pause(force) { if (!rules.allowPause && !force) return; if (st.tts) { st.playing = false; speechSynthesis.cancel(); emit(); } else audio.pause(); },
      stop() { st.rangeEnd = null; if (st.tts) { st.playing = false; speechSynthesis?.cancel?.(); } audio.pause(); },
      seek(sec, force) { if (!rules.allowSeek && !force) return; if (st.tts) { st.line = Math.max(0, st.lines.findIndex((l) => l.end > sec)); st.time = sec; emit(); if (st.playing) ttsPlay(st.line); return; } audio.currentTime = Math.max(0, Math.min(st.dur || 1e9, sec)); },
      setRate(r) { if (!rules.allowRate) return; st.rate = r; audio.playbackRate = r; emit(); },
      seekLine(i, { play } = {}) { const l = st.lines[i]; if (!l) return; this.seek(l.start || 0, true); if (play && !st.playing) { if (st.tts) ttsPlay(i); else audio.play().catch(() => {}); } },
      playRange(a, b) {
        if (a == null) return;
        if (st.tts) { const i = Math.max(0, (st.lines.findIndex((l) => (l.origStart ?? l.start) >= a))); return ttsPlay(i); }
        audio.currentTime = a; st.rangeEnd = b ?? null; audio.play().catch(() => {});
      },
      destroy() { audio.pause(); audio.removeAttribute('src'); speechSynthesis?.cancel?.(); },
    };
  }
  function playerUI(pl, rules, { showTranscriptToggle, transcriptOpen, onToggleTranscript }) {
    const st = pl.st;
    const pct = st.dur ? (st.time / st.dur) * 100 : 0;
    const left = rules.maxPlays ? Math.max(0, rules.maxPlays - st.plays) : null;
    const blocked = (st.plays >= (rules.maxPlays || Infinity) && !st.playing) || (st.playing && !rules.allowPause);
    const track = h('div', { class: 'player__track', role: 'slider', tabindex: rules.allowSeek ? 0 : -1, 'aria-label': 'Audio', 'aria-valuemin': 0, 'aria-valuemax': Math.round(st.dur), 'aria-valuenow': Math.round(st.time),
      onkeydown: (e) => { if (e.key === 'ArrowLeft') pl.seek(st.time - 5); if (e.key === 'ArrowRight') pl.seek(st.time + 5); },
      onpointerdown: (e) => { if (!rules.allowSeek || !st.dur) return; const r = e.currentTarget.getBoundingClientRect(); pl.seek(((e.clientX - r.left) / r.width) * st.dur); } },
    h('i', { style: { width: pct + '%' } }));
    return h('div', { class: 'player card' },
      rules.allowSeek && h('button', { class: 'icon-btn', type: 'button', 'aria-label': '−5s', onclick: () => pl.seek(st.time - 5) }, '−5'),
      h('button', { class: 'player__play', type: 'button', disabled: blocked, 'aria-label': st.playing ? t('ieltsListening.pause') : t('ieltsListening.play'), onclick: () => (st.playing ? pl.pause() : pl.play()) }, icon(st.playing ? 'pause' : 'play')),
      rules.allowSeek && h('button', { class: 'icon-btn', type: 'button', 'aria-label': '+5s', onclick: () => pl.seek(st.time + 5) }, '+5'),
      h('span', { class: 'num xs' }, mmss(st.time)), track, h('span', { class: 'num xs' }, mmss(st.dur)),
      rules.allowRate && h('div', { class: 'chips chips--sm' }, [0.75, 1].map((r) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(st.rate === r), 'aria-selected': String(st.rate === r), onclick: () => pl.setRate(r) }, r + '×'))),
      left != null && h('span', { class: 'xs muted' }, t('ieltsListening.playsLeft', { n: left })),
      showTranscriptToggle && h('button', { class: 'btn btn--ghost btn--sm', type: 'button', 'aria-pressed': String(transcriptOpen), onclick: onToggleTranscript }, t('ieltsListening.transcript')),
      st.error && h('span', { class: 'error xs', role: 'alert' }, t('ieltsListening.audioError')));
  }
  function speakerMap(voices) {
    const m = {};
    for (const v of voices || []) { const r = /^([A-Z][A-Z' -]*?)\s*[—-]\s*([^()]+)/.exec(v); if (r) m[r[1].trim()] = r[2].trim().replace(/^./, (c) => c.toUpperCase()); }
    return m;
  }
  function transcriptPanel(lines, { current, mark, voices, onLine, onClose }) {
    const sp = speakerMap(voices);
    const panel = h('aside', { class: 'tpanel card' },
      h('header', { class: 'row row--between' }, h('b', null, t('ieltsListening.transcript')), onClose && h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('ieltsReading.close'), onclick: onClose }, icon('close'))),
      lines.length ? h('div', { class: 'tpanel__lines' }, lines.map((l, i) => h('button', { type: 'button', class: 'tline' + (i === current ? ' is-current' : '') + (i === mark ? ' is-mark' : ''), 'data-line': i, onclick: () => onLine?.(i) },
        l.speaker && h('b', null, sp[l.speaker] || l.speaker), h('span', null, l.text))))
        : h('p', { class: 'muted small' }, t('ieltsListening.noTranscript')));
    requestAnimationFrame(() => panel.querySelector('.is-mark, .is-current')?.scrollIntoView({ block: 'nearest' }));
    return panel;
  }

  // ---------- Listening runner (Vp) ----------
  Screens['ielts-listening-run'] = {
    fullscreen: true,
    title: () => 'Listening',
    async render(p) {
      const { test, document: raw } = await Api.test(p.ieltsTest);
      const doc = RL.flatten(raw);
      const parts = raw.parts || [];
      const entries = RL.entriesOf(doc);
      const total = RL.totalQ(entries);
      const M = p.mock;
      const mode = M ? 'exam' : ['exam', 'practice', 'study'].includes(p.mode) ? p.mode : 'practice';
      const exam = mode === 'exam';
      const draft = !exam && RL.Draft.get(test.id);
      const md = M?.draft?.run?.testId === test.id ? M.draft : null;
      let run = md ? { ...md.run, shownAt: Date.now(), checked: {}, flags: md.run.flags || {} } : draft && draft.mode === mode ? { ...draft, shownAt: Date.now(), checked: draft.checked || {} } : RL.newRun(raw, mode, entries);
      const rules = exam ? { allowPause: false, allowSeek: false, allowRate: false, maxPlays: 1 }
        : { allowPause: raw.playback?.allowPause !== false, allowSeek: raw.playback?.allowSeek !== false, allowRate: true, maxPlays: raw.playback?.maxPlays > 0 ? raw.playback.maxPlays : null };
      let pi = Math.min(md?.partIdx || 0, Math.max(0, parts.length - 1)), error = '', submitting = false, tOpen = mode === 'study', phase = exam ? 'intro' : null, phaseEnd = 0, markLine = null;
      const checking = new Set();
      const sv = M && MockKit.saver(M, () => ({ run: { ...run, shownAt: 0 }, partIdx: pi }));
      const save = () => { if (submitting) return; if (M) sv.touch(); else if (!exam) RL.Draft.save(run); };
      let transcripts = null;
      if (!exam) Api.transcript(test.id).then((x) => { transcripts = Array.isArray(x) ? x : x?.parts || []; loadPart(); }).catch(() => {});
      const partLines = (part) => transcripts?.find((x) => x.number === part.number)?.transcript || part.transcript || [];

      const root = h('div', { class: 'run run--rl run--listen', 'data-mode': mode });
      const clock = h('span', { class: 'runbar__timer', role: 'timer' });
      const qrange = h('span', { class: 'badge' });
      const playerHost = h('div'), mainHost = h('div', { class: 'lrun__main' }), navHost = h('div', { class: 'runnav-wrap' });
      const pl = makePlayer({ rules, onChange: () => { paintPlayer(); paintTranscriptCurrent(); }, onEnded: () => {
        if (phase !== 'listen') return;
        if (pi < parts.length - 1) { pi++; loadPart(); save(); setTimeout(() => pl.play(), 400); }
        else { phase = 'check'; phaseEnd = Date.now() + 120000; paintClock(); }
      } });
      const partEntries = () => entries.filter((e) => e.group.part === parts[pi]?.number);
      function loadPart() { pl.load(parts[pi], partLines(parts[pi] || {})); paintMain(); }

      const ctx = {
        get run() { return run; }, mode, paper: true, checking, selectLetters: (g) => (g.options || g.headings || []).map((o) => o.key),
        get entries() { return partEntries(); },
        onFocus(id) { if (run.current === id) return; RL.focusQ(run, id); paintNav(); mainHost.querySelectorAll('.is-current').forEach((n) => n.classList.remove('is-current')); document.getElementById('q-' + id)?.classList.add('is-current'); },
        onAnswer(id, v, o = {}) { ctx.onFocus(id); run.answers[id] = v; delete run.checked[id]; save(); if (o.silent) paintNav(); else paintMain(); },
        async onCheck(id) {
          checking.add(id);
          try { run.checked[id] = await Api.check(test.id, { itemId: id, given: run.answers[id] }); error = ''; } catch { error = t('ieltsReading.checkFailed'); }
          checking.delete(id); save(); paintMain();
        },
        onFlag(id) { run.flags[id] = !run.flags[id]; save(); paintMain(); },
        onShow: (rv) => { if (rv.audioStart != null) pl.playRange(rv.audioStart, rv.audioEnd); },
      };
      let tHost = null;
      function paintTranscriptCurrent() {
        tHost?.querySelectorAll('.tline').forEach((b) => b.classList.toggle('is-current', Number(b.dataset.line) === pl.st.line));
      }
      function paintPlayer() {
        put(playerHost, playerUI(pl, rules, { showTranscriptToggle: !exam, transcriptOpen: tOpen, onToggleTranscript: () => { tOpen = !tOpen; paintMain(); paintPlayer(); } }));
      }
      function paintMain() {
        const part = parts[pi] || {};
        const pe = partEntries();
        qrange.textContent = pe.length ? t('ieltsListening.questions', { range: `${pe[0].numbers[0]}–${pe.at(-1).numbers.at(-1)}` }) : '';
        const form = h('section', { class: 'card stack lrun__form' },
          error && h('div', { class: 'notice notice--danger', role: 'alert' }, error),
          M && h('p', { class: 'xs muted' }, t('ieltsMock.noHints')),
          M && md?.partIdx > 0 && pi === md.partIdx && h('p', { class: 'notice small' }, t('ieltsMock.resumePart', { part: parts[pi]?.number ?? pi + 1 })),
          !exam && part.context && h('p', { class: 'muted' }, part.context),
          (part.groups || []).map((g) => RL.group(doc.groups.find((x) => x.id === g.id && x.part === part.number) || g, ctx)),
          !exam && h('p', { class: 'xs muted' }, t('ieltsListening.hintInstant')));
        tHost = tOpen && !exam ? transcriptPanel(pl.st.lines, { current: pl.st.line, mark: markLine, voices: part.voices, onLine: (i) => pl.seekLine(i, { play: true }), onClose: mode === 'practice' ? () => { tOpen = false; paintMain(); paintPlayer(); } : null }) : null;
        mainHost.className = 'lrun__main' + (tHost ? ' has-transcript' : '');
        put(mainHost, form, tHost);
        paintNav();
      }
      function paintNav() {
        const pe = partEntries();
        put(navHost, numNav({ label: t('ielts.term.part', { n: parts[pi]?.number ?? 1 }), entries: pe, run, total, answered: RL.answeredCount(entries, run.answers), showFlags: false,
          onPick: (id) => { ctx.onFocus(id); scrollToQ(id); },
          partTabs: parts.length > 1 && h('div', { class: 'chips chips--sm' }, parts.map((x, i) => h('button', { type: 'button', class: 'chip', 'aria-selected': String(i === pi), disabled: exam, onclick: () => { pl.stop(); pi = i; loadPart(); } }, `Part ${x.number}`))) }));
      }

      async function submit() {
        if (submitting) return;
        submitting = true; pl.stop();
        try {
          const res = await Api.submitAttempt(test.id, RL.payload(run));
          if (M) { sv.cancel(); return await M.onSubmitted([res.attempt?.id ?? res.id]); }
          RL.Draft.drop(test.id);
          Router.go({ screen: 'ielts-reading-review', ieltsWork: res.attempt?.id ?? res.id, backTab: p.backTab || null, backView: p.backView || null });
        } catch (e) { submitting = false; error = RL.quotaMessage(e); paintMain(); }
      }
      const askSubmit = () => M ? MockKit.confirm({ section: 'listening', unanswered: entries.filter((e) => !RL.isAnswered(run.answers[e.id])).map((e) => RL.numLabel(e)), onConfirm: () => { pl.stop(); return submit(); } }) : RL.confirmSubmit({ exam, unanswered: total - RL.answeredCount(entries, run.answers), onConfirm: () => { pl.stop(); return submit(); } });

      function paintClock() {
        if (!exam) { clock.hidden = true; return; }
        if (!phase || phase === 'intro') { clock.textContent = ''; clock.hidden = true; return; }
        clock.hidden = false;
        const left = phase === 'listen' ? null : Math.max(0, Math.round((phaseEnd - Date.now()) / 1000));
        clock.textContent = t('ieltsListening.phase.' + phase) + (left != null ? ' · ' + mmss(left) : '');
        clock.classList.toggle('is-low', left != null && left <= 30);
        if (left === 0 && phase === 'read') { phase = 'listen'; pl.play(); paintClock(); }
        else if (left === 0 && phase === 'check') { phase = 'done'; submit(); }
      }
      const timer = setInterval(paintClock, 1000);
      const sclock = M && MockKit.clock(M, { onZero: () => { pl.stop(); submit(); } });
      const onHide = () => save();
      addEventListener('pagehide', onHide);
      App.onLeave(() => { clearInterval(timer); pl.destroy(); save(); removeEventListener('pagehide', onHide); });

      const title = /^part/i.test(test.title) ? `Listening · ${test.title}` : `Listening · Part ${parts[0]?.number ?? 1}${parts.length > 1 ? ' ' + t('ieltsListening.of') + ' ' + parts.length : ''} · ${test.title}`;
      put(root,
        M ? MockKit.header({ M, section: 'listening', part: t('ielts.term.part', { n: parts[pi]?.number ?? 1 }), clock: sclock, saver: sv, extra: [qrange, clock], submitLabel: t('ieltsMock.submitSection'), onSubmit: askSubmit })
          : runbar({ chip: title, mode, clock, extra: qrange, submitLabel: t(exam ? 'ieltsReading.submit' : 'ieltsReading.finish'), onSubmit: askSubmit, backHref: RL.backHref(p, test.id), onBack: () => pl.stop() }),
        h('div', { class: 'runwrap stack' }, playerHost, mainHost), navHost);
      loadPart(); paintPlayer(); paintClock();

      if (exam) {
        setTimeout(() => DOM.dialog((close) => h('div', { class: 'stack' }, h('h2', null, t('ieltsListening.examTitle')),
          h('p', null, t('ieltsListening.examText', { read: '30', check: '2' })),
          h('div', { class: 'row', style: { justifyContent: 'flex-end' } },
            !M && h('a', { class: 'btn btn--secondary', href: RL.backHref(p, test.id), onclick: close }, t('ieltsReading.cancel')),
            h('button', { class: 'btn btn--primary', type: 'button', onclick: () => { close(); phase = 'read'; phaseEnd = Date.now() + 30000; paintClock(); } }, t('ieltsListening.examStart'))))));
      }
      return root;
    },
  };

  // ---------- Review (Vu) ----------
  const TONE = { ok: 'ok', spelling: 'warn', partial: 'warn', wrong: 'danger', empty: 'danger' };
  Screens['ielts-reading-review'] = {
    fullscreen: true,
    title: () => t('ieltsReading.review.title'),
    async render(p) {
      const data = await Api.attempt(p.ieltsWork);
      const raw = data.document || {};
      const listening = raw.skill === 'listening' || !!raw.parts;
      const doc = listening ? RL.flatten(raw) : raw;
      const a = data.attempt || {};
      const items = Object.fromEntries((data.result?.items || []).map((x) => [x.itemId, x]));
      const rows = RL.entriesOf(doc).map((e) => {
        const v = items[e.id] || {};
        const given = data.answers?.[e.id];
        const status = v.correct ? 'ok' : v.spellingOnly ? 'spelling' : v.score > 0 ? 'partial' : given == null || given === '' ? 'empty' : 'wrong';
        return { ...e, verdict: v, given, status };
      });
      const rawS = a.rawScore ?? 0, max = a.maxScore ?? 0, acc = max ? Math.round((rawS / max) * 100) : 0;
      const slow = rows.filter((r) => r.verdict.timeSec > 90).length;
      const D = listening ? Math.max(60, (raw.parts || []).reduce((s, x) => s + (x.audio?.durationSec || 0), 0)) : RL.timeLimit(doc);
      let filter = 'all', sel = (rows.find((r) => r.status !== 'ok') || rows[0])?.id, ti = 0;
      const back = Router.href({ screen: 'ielts', ieltsTab: p.backTab || 'learn', ieltsView: p.backView || null, ieltsTest: p.backTab === 'progress' ? null : data.testId });
      const pl = listening ? makePlayer({ rules: { allowPause: true, allowSeek: true, allowRate: true, maxPlays: null }, onChange: () => paintLeft() }) : null;
      App.onLeave(() => pl?.destroy());
      let loadedPart = null;

      const left = h('div', { class: 'run__text' }), right = h('div', { class: 'run__questions stack' });
      function selRow() { return rows.find((r) => r.id === sel); }
      function paintLeft() {
        const r = selRow();
        if (listening) {
          const part = (raw.parts || []).find((x) => x.number === r?.group.part) || raw.parts?.[0];
          if (part && loadedPart !== part) { loadedPart = part; pl.load(part, part.transcript); }
          put(left, part ? transcriptPanel(pl.st.lines, { current: pl.st.playing ? pl.st.line : -1, mark: r?.item.line ?? null, voices: part.voices, onLine: (i) => pl.seekLine(i, { play: true }) }) : null);
          return;
        }
        let mark = null;
        if (r) {
          const loc = locate(doc, r.item, r.group);
          if (loc) { ti = loc.ti; if (loc.found) mark = { key: loc.key, start: loc.start, end: loc.end, n: RL.numLabel(r) }; }
        }
        put(left, 
          (doc.texts || []).length > 1 && h('div', { class: 'chips chips--sm' }, doc.texts.map((x, i) => h('button', { type: 'button', class: 'chip', 'aria-selected': String(i === ti), onclick: () => { ti = i; paintLeft(); } }, textTabLabel(doc, x, i)))),
          passage(doc, ti, { highlights: data.result?.highlights || [], mark, focusKey: mark?.key }));
        left.querySelector('.is-focus')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      const chipTxt = (r) => (r.status === 'spelling' && r.given ? t('ieltsReading.review.spellingOnly', { given: r.given, right: r.item.answer?.[0] || '' }) : t('ieltsReading.review.status.' + r.status));
      function rowView(r) {
        const open = r.id === sel;
        const head = [h('span', { class: 'qnum is-' + TONE[r.status] }, RL.numLabel(r)), h('span', { class: 'grow rv__prompt' }, r.item.prompt || RL.typeLabel(r.type)), h('span', { class: 'badge badge--' + TONE[r.status] }, chipTxt(r))];
        if (!open) return h('li', null, h('button', { type: 'button', class: 'rv__row', onclick: () => { sel = r.id; paint(); } }, head, icon('chevronD', 'ic16')));
        const it = r.item, v = r.verdict;
        const right = [...(it.answer || []), ...(it.acceptable || [])].join(' / ');
        const loc = !listening && locate(doc, it, r.group);
        return h('li', null, h('article', { class: 'rv__open card stack-sm' }, h('div', { class: 'rv__row is-open' }, head),
          r.status !== 'ok' && [h('p', null, h('span', { class: 'muted' }, t('ieltsReading.review.yours') + ': '), Array.isArray(r.given) ? r.given.join(', ') : r.given || t('ieltsReading.review.noAnswer')),
            right && h('p', null, h('span', { class: 'muted' }, t('ieltsReading.rightAnswer') + ': '), h('b', null, right))],
          it.explanation && [h('b', null, t('ieltsReading.review.why')), h('p', null, RL.loc(it.explanation))],
          v.words && wordDiff(v.words),
          listening && it.audioStart != null && h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => pl.playRange(it.audioStart, it.audioEnd) }, icon('play', 'ic16'), t('ieltsListening.replaySegment', { from: Math.floor(it.audioStart), to: Math.ceil(it.audioEnd ?? it.audioStart) })),
          it.quote && h('div', { class: 'rv__quote' }, h('span', { class: 'xs muted' }, t('ieltsReading.review.where') + (loc?.label ? ' · ' + t('ieltsReading.review.paragraph', { p: loc.label }) : '')),
            h('p', null, `«${it.quote}»`), !listening && loc && h('button', { class: 'link', type: 'button', onclick: () => paintLeft() }, t('ieltsReading.showInText'))),
          h('div', { class: 'chips chips--sm' }, v.trap && r.status !== 'ok' && h('span', { class: 'badge badge--warn' }, `${t('ieltsReading.review.trap')}: ${t('ieltsReading.trap.' + v.trap)}`),
            v.timeSec != null && h('span', { class: 'badge' }, t('ieltsReading.review.perQuestion', { n: v.timeSec })))));
      }
      function paint() {
        const wrongRows = rows.filter((r) => r.status !== 'ok'), spRows = rows.filter((r) => r.status === 'spelling');
        const shown = filter === 'wrong' ? wrongRows : filter === 'spelling' ? spRows : rows;
        const fam = {}; wrongRows.forEach((r) => { const f = RL.AI[r.type]; if (f) fam[f] = (fam[f] || 0) + 1; });
        const weak = Object.entries(fam).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k]) => k);
        put(right, 
          data.outdated && h('div', { class: 'notice' }, t('ieltsReading.review.outdated')),
          h('section', { class: 'card rv__sum' },
            h('div', { class: 'ring', style: { '--p': acc } }, h('b', { class: 'num' }, `${rawS}/${max}`)),
            h('div', { class: 'rv__stats' },
              h('div', null, h('b', { class: 'num' }, acc + ' %'), h('span', { class: 'xs muted' }, t('ieltsReading.review.accuracy'))),
              h('div', null, h('b', { class: 'num' }, a.timeSec ? mmss(a.timeSec) : '—'), h('span', { class: 'xs muted' }, t('ieltsReading.review.ofMinutes', { n: Math.round(D / 60) }))),
              h('div', null, h('b', { class: 'num' }, String(slow)), h('span', { class: 'xs muted' }, t('ieltsReading.review.slow', { n: '90' })))),
            h('p', { class: 'small' }, a.band != null ? t('ieltsReading.review.band', { band: Number(a.band).toFixed(1) }) : t('ieltsReading.review.noBand'))),
          Hub.seg([['all', `${t('ieltsReading.review.filter.all')} · ${rows.length}`], ['wrong', `${t('ieltsReading.review.filter.wrong')} · ${wrongRows.length}`], ['spelling', `${t('ieltsReading.review.filter.spelling')} · ${spRows.length}`]],
            filter, (v) => { filter = v; paint(); }, { small: true }),
          h('ul', { class: 'plain stack-sm' }, shown.map(rowView)),
          weak.length > 0 && h('section', { class: 'card stack-sm' }, h('b', null, t('ieltsReading.review.trainWeak')),
            h('div', { class: 'chips' }, weak.map((k) => h('a', { class: 'chip', href: Router.href({ screen: 'ielts', ieltsTab: 'learn', ieltsView: 'types' }) }, RL.AL(k) || k)))));
        paintLeft();
      }
      paint();
      const modeLbl = a.mode ? MODE_LBL(a.mode) : '';
      return h('div', { class: 'run run--review' },
        h('header', { class: 'runbar' },
          h('a', { class: 'icon-btn', href: back, 'aria-label': t('ieltsReading.back') }, icon('arrowL')),
          h('div', { class: 'runbar__title' }, `${t('ieltsReading.review.title')} · ${raw.title || ''}`,
            h('div', { class: 'xs muted', style: { fontWeight: 500 } }, [listening ? 'Listening' : 'Reading', modeLbl, a.finishedAt && DOM.date(a.finishedAt)].filter(Boolean).join(' · '))),
          h('a', { class: 'btn btn--secondary btn--sm', href: Router.href({ screen: 'ielts', ieltsTab: p.backTab === 'progress' ? 'learn' : p.backTab || 'learn', ieltsView: p.backView || null, ieltsTest: data.testId }) }, t('ieltsReading.review.again')),
          h('a', { class: 'btn btn--primary btn--sm', href: Router.href({ screen: 'ielts', ieltsTab: 'today' }) }, t('ieltsReading.review.toPlan'))),
        h('div', { class: 'run__body run__body--review' }, left, right));
    },
  };

  // ---------- Dictation / Spelling (Vm) ----------
  function wordDiff(w) {
    return h('div', { class: 'stack-sm' },
      h('p', { class: 'words' }, (w.units || []).map((u) => [h('span', { class: 'word word--' + u.status, title: u.given && u.given !== u.text ? `${t('ieltsOb.p.quiz.yours')}: ${u.given}` : null }, u.text), ' ']),
        (w.extra || []).map((x) => [h('span', { class: 'word word--extra' }, x), ' '])),
      h('p', { class: 'small' }, `${Math.round((w.accuracy || 0) * 100)} % · ${t('ieltsListening.dict.wordsOk', { ok: w.ok, total: w.total })}`));
  }
  Screens['ielts-dictation'] = {
    fullscreen: true,
    title: () => t('ieltsLearn.listening.dictation'),
    async render(p) {
      const { test, document: doc } = await Api.test(p.ieltsTest);
      const spelling = doc.kind === 'spelling';
      const items = (doc.groups || []).flatMap((g) => g.items || []);
      const st = { idx: 0, answers: {}, checks: {}, busy: false, rate: 1, playing: false, final: null, error: '', startedAt: new Date().toISOString() };
      const audio = new Audio();
      App.onLeave(() => { audio.pause(); audio.removeAttribute('src'); });
      audio.addEventListener('play', () => { st.playing = true; paintPlayer(); });
      audio.addEventListener('pause', () => { st.playing = false; paintPlayer(); });
      audio.addEventListener('ended', () => { st.playing = false; paintPlayer(); root.querySelector('.dict__input')?.focus(); });
      const back = Router.href({ screen: 'ielts', ieltsTab: p.backTab || 'learn', ieltsView: p.backView || (spelling ? 'listening-spelling' : 'listening-dictation') });
      const root = h('div', { class: 'run run--dict' });
      const head = h('div'), card = h('div', { class: 'runwrap stack', style: { maxWidth: '760px' } });
      const playerHost = h('div', { class: 'row' });

      function play() {
        const it = items[st.idx];
        if (!it?.audio?.url) return;
        audio.src = it.audio.url; audio.currentTime = 0; audio.playbackRate = st.rate;
        audio.play().catch(() => { st.error = t('ieltsListening.audioError'); paint(); });
      }
      function paintPlayer() {
        const it = items[st.idx];
        const has = !!it?.audio?.url;
        put(playerHost, 
          h('button', { class: 'player__play', type: 'button', disabled: !has, 'aria-label': st.playing ? t('ieltsListening.pause') : t('ieltsListening.play'), onclick: () => (st.playing ? audio.pause() : play()) }, icon(st.playing ? 'pause' : 'play')),
          h('button', { class: 'btn btn--secondary btn--sm', type: 'button', disabled: !has, onclick: play }, icon('refresh', 'ic16'), t('ieltsListening.again')),
          h('div', { class: 'chips chips--sm' }, [0.75, 1].map((r) => h('button', { type: 'button', class: 'chip', 'aria-selected': String(st.rate === r), disabled: !has, onclick: () => { st.rate = r; if (st.playing) play(); paintPlayer(); } }, r + '×'))),
          !has && h('span', { class: 'xs muted' }, t('ieltsListening.noAudio')));
      }
      async function check() {
        const it = items[st.idx];
        const v = String(st.answers[it.id] || '').trim();
        if (!v || st.busy) return;
        st.busy = true; paint();
        try { st.checks[it.id] = await Api.check(test.id, { itemId: it.id, given: v }); st.error = ''; } catch { st.error = t('ieltsReading.checkFailed'); }
        st.busy = false; paint();
      }
      async function next() {
        audio.pause();
        if (st.idx < items.length - 1) { st.idx++; paint(); setTimeout(() => root.querySelector('.dict__input')?.focus(), 50); return; }
        st.busy = true; paint();
        try {
          const answers = {}; for (const k in st.answers) if (String(st.answers[k]).trim() !== '') answers[k] = st.answers[k];
          const res = await Api.submitAttempt(test.id, { mode: 'practice', answers, startedAt: st.startedAt, timeSec: Math.round((Date.now() - Date.parse(st.startedAt)) / 1000), device: innerWidth < 900 ? 'mobile' : 'desktop' });
          st.final = res.attempt || res;
        } catch (e) { st.error = RL.quotaMessage(e); }
        st.busy = false; paint();
      }
      function paint() {
        const n = items.length;
        put(head, h('header', { class: 'runbar' },
          h('a', { class: 'icon-btn', href: back, 'aria-label': t('ieltsReading.close') }, icon('close')),
          h('div', { class: 'runbar__title' }, `${t('ieltsLearn.listening.' + (spelling ? 'spelling' : 'dictation'))} · ${test.title}`,
            h('div', { class: 'xs muted', style: { fontWeight: 500 } }, st.final ? t('ieltsListening.dict.done') : t('ieltsListening.dict.phraseOf', { n: st.idx + 1, total: n })))),
        h('div', { class: 'progress', style: { borderRadius: 0 } }, h('i', { style: { width: ((st.final ? n : st.idx) / Math.max(1, n)) * 100 + '%' } })));
        if (st.final) {
          const f = st.final, pct = Math.round(((f.rawScore || 0) / Math.max(1, f.maxScore || 0)) * 100);
          put(card, h('section', { class: 'card stack', style: { textAlign: 'center', justifyItems: 'center' } },
            h('div', { class: 'ring', style: { '--p': pct } }, h('b', { class: 'num' }, pct + '%')),
            h('h2', null, t('ieltsListening.dict.resultTitle')), h('p', { class: 'muted' }, t('ieltsListening.dict.resultText', { ok: f.rawScore, total: f.maxScore })),
            h('div', { class: 'row', style: { justifyContent: 'center' } },
              h('button', { class: 'btn btn--secondary', type: 'button', onclick: () => { Object.assign(st, { idx: 0, answers: {}, checks: {}, final: null, startedAt: new Date().toISOString() }); paint(); } }, t('ieltsReading.review.again')),
              h('a', { class: 'btn btn--primary', href: back }, t('ieltsListening.dict.toLearn')))));
          return;
        }
        const it = items[st.idx] || {};
        const res = st.checks[it.id];
        const onKey = (e) => { if (e.key === 'Enter' && (spelling || !e.shiftKey)) { e.preventDefault(); res ? next() : check(); } };
        const input = spelling
          ? h('input', { class: 'input dict__input', inputmode: it.inputmode || 'text', value: st.answers[it.id] || '', placeholder: t('ieltsListening.dict.placeholder'), disabled: !!res, autocomplete: 'off', spellcheck: false, oninput: (e) => { st.answers[it.id] = e.target.value; paintActions(); }, onkeydown: onKey })
          : h('textarea', { class: 'input dict__input', rows: 3, placeholder: t('ieltsListening.dict.placeholder'), disabled: !!res, spellcheck: false, oninput: (e) => { st.answers[it.id] = e.target.value; paintActions(); }, onkeydown: onKey }, st.answers[it.id] || '');
        const actions = h('div', { class: 'row row--between' });
        function paintActions() {
          const vals = Object.values(st.checks).filter((c) => c.words).map((c) => c.words.accuracy || 0);
          put(actions, 
            h('span', { class: 'small muted' }, vals.length ? t('ieltsListening.dict.avg', { n: Math.round((vals.reduce((s, x) => s + x, 0) / vals.length) * 100) }) : ''),
            h('div', { class: 'row' }, res ? h('button', { class: 'btn btn--primary', type: 'button', disabled: st.busy, onclick: next }, st.idx < items.length - 1 ? t('ieltsReading.next') : t('ieltsReading.finish'))
              : [h('button', { class: 'btn btn--ghost', type: 'button', onclick: next }, t('ieltsListening.dict.skip')),
                h('button', { class: 'btn btn--primary', type: 'button', disabled: !String(st.answers[it.id] || '').trim() || st.busy, onclick: check }, t('ieltsReading.check'))]));
        }
        paintActions();
        put(card, h('section', { class: 'card stack' },
          it.prompt && h('span', { class: 'eyebrow' }, it.prompt), playerHost, input,
          st.error && h('p', { class: 'error', role: 'alert' }, st.error),
          res?.words && [wordDiff(res.words), spelling && res.reveal?.spoken && h('p', { class: 'small' }, t('ieltsListening.dict.spoken') + ': «' + res.reveal.spoken + '»'),
            h('div', { class: 'chips chips--sm' }, ['ok', 'spelling', 'wrong', 'missing'].map((k) => h('span', { class: 'word word--' + k }, t('ieltsListening.word.' + k))))],
          actions));
        paintPlayer();
      }
      paint();
      put(root, head, card);
      return root;
    },
  };

  window.RLRun = { passage, locate, makePlayer, playerUI, transcriptPanel, wordDiff };
})();
