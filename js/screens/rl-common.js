// Reading / Listening shared model: question entries, type tables, run state, drafts,
// question-group rendering and feedback. Ported from ai-tutor (WB, W5, AE/AL/Az/AF/AO, U6–U9).
(function () {
  const { h, icon } = DOM;

  const AE = [
    { id: 'tfng', types: ['tfng'] }, { id: 'ynng', types: ['ynng'] },
    { id: 'multiple_choice', types: ['multiple_choice_single', 'multiple_choice_multi'] },
    { id: 'matching_headings', types: ['matching_headings'] }, { id: 'matching_information', types: ['matching_information'] },
    { id: 'matching_features', types: ['matching_features'] }, { id: 'matching_sentence_endings', types: ['matching_sentence_endings'] },
    { id: 'sentence_completion', types: ['sentence_completion'] }, { id: 'summary_completion', types: ['summary_completion'] },
    { id: 'note_table_flow_chart', types: ['note_completion', 'table_completion', 'flow_chart_completion'] },
    { id: 'diagram_label', types: ['diagram_label'] }, { id: 'short_answer', types: ['short_answer'] },
  ];
  const AL = (id) => t('ielts.term.qgroup.' + id);  // question-group name
  const AI = {}; AE.forEach((f) => f.types.forEach((ty) => (AI[ty] = f.id)));
  const AF = {
    tfng: 'judgement', ynng: 'judgement', multiple_choice_single: 'choice', multiple_choice_multi: 'multi',
    matching_headings: 'select', matching_information: 'select', matching_features: 'select', matching_sentence_endings: 'select',
  };
  const AO = { tfng: ['TRUE', 'FALSE', 'NOT GIVEN'], ynng: ['YES', 'NO', 'NOT GIVEN'] };
  const typeLabel = (ty) => (I18n.has('ielts.term.qtype.' + ty) ? t('ielts.term.qtype.' + ty) : I18n.has('ielts.term.qgroup.' + (AI[ty] || ty)) ? AL(AI[ty] || ty) : ty);
  const kindOf = (ty) => AF[ty] || 'gap';
  const loc = (o) => (o && typeof o === 'object' ? o[I18n.lang] || o.ru || o.en || '' : o || '');

  function flatten(doc) {
    if (!Array.isArray(doc.parts)) return doc;
    return { ...doc, groups: [...(doc.groups || []), ...doc.parts.flatMap((p) => (p.groups || []).map((g) => ({ ...g, part: p.number })))] };
  }
  function entriesOf(doc) {
    const out = [];
    (doc.groups || []).forEach((g, gi) => {
      let n = Array.isArray(g.range) ? g.range[0] : out.length ? out[out.length - 1].numbers.at(-1) + 1 : 1;
      for (const item of g.items || []) {
        const count = kindOf(g.type) === 'multi' ? Math.max(1, item.marks || 2) : 1;
        out.push({ id: item.id, type: g.type, groupIndex: gi, numbers: Array.from({ length: count }, (_, i) => n + i), item, group: g });
        n += count;
      }
    });
    return out;
  }
  const numLabel = (e) => (e.numbers.length > 1 ? `${e.numbers[0]}–${e.numbers.at(-1)}` : String(e.numbers[0]));
  const totalQ = (entries) => entries.reduce((s, e) => s + e.numbers.length, 0);
  const isAnswered = (v) => (Array.isArray(v) ? v.length > 0 : typeof v === 'string' && v.trim() !== '');
  const answeredCount = (entries, answers) => entries.reduce((s, e) => { const v = answers[e.id]; return isAnswered(v) ? s + (Array.isArray(v) ? Math.min(v.length, e.numbers.length) : e.numbers.length) : s; }, 0);
  const timeLimit = (doc) => doc.timeLimitSec || 1200 * Math.max(1, (doc.texts || []).length);
  const runLabel = (doc) => doc.kind === 'test' ? t('ielts.term.fullTest') : doc.parts?.length ? t('ielts.term.part', { n: doc.parts[0].number }) : doc.passage != null ? t('ielts.term.passage', { n: doc.passage }) : doc.section != null ? t('ielts.term.section', { n: doc.section }) : '';

  // ---------- run state + drafts ----------
  const DRAFT = (id) => `jts_ielts_reading_draft_${id}`;
  function newRun(doc, mode, entries) {
    return { testId: doc.id, mode, startedAt: new Date().toISOString(), endsAt: mode === 'exam' && !doc.parts ? Date.now() + timeLimit(doc) * 1000 : null,
      current: entries[0]?.id || null, answers: {}, flags: {}, checked: {}, questionSec: {}, highlights: [], shownAt: Date.now() };
  }
  const Draft = {
    get(id) { try { return JSON.parse(localStorage.getItem(DRAFT(id)) || 'null'); } catch { return null; } },
    save(run) { try { localStorage.setItem(DRAFT(run.testId), JSON.stringify({ ...run, savedAt: Date.now() })); } catch {} },
    drop(id) { try { localStorage.removeItem(DRAFT(id)); } catch {} },
    remaining(d) { return d?.endsAt ? Math.max(0, Math.round((d.endsAt - (d.savedAt || Date.parse(d.startedAt))) / 1000)) : null; },
  };
  function focusQ(run, id) {
    if (run.current === id) return;
    if (run.current) run.questionSec[run.current] = (run.questionSec[run.current] || 0) + Math.round((Date.now() - run.shownAt) / 1000);
    run.current = id; run.shownAt = Date.now();
  }
  function payload(run) {
    focusQ(run, null);
    const answers = {}; for (const k in run.answers) if (isAnswered(run.answers[k])) answers[k] = run.answers[k];
    return { mode: run.mode, answers, questionSec: run.questionSec, timeSec: Math.round((Date.now() - Date.parse(run.startedAt)) / 1000),
      startedAt: run.startedAt, device: innerWidth < 900 ? 'mobile' : 'desktop', highlights: (run.highlights || []).slice(0, 200) };
  }
  function quotaMessage(err) {
    const quota = err?.code === 'CONTENT_QUOTA_EXCEEDED' || err?.status === 429;
    if (!quota) return t('ieltsReading.submitFailed');
    return err.serverMessage || (err.demoExpired ? t('exam.quota.expired') : (err.contentType && t('exam.quota.type.' + err.contentType, { n: err.limit })) || t('exam.quota.text'));
  }

  // ---------- gap input (U6) ----------
  function gapPrompt(prompt, input) {
    const parts = String(prompt || '').split(/\d*\s*_{3,}/);
    if (parts.length < 2) return [prompt ? prompt + ' ' : '', input];
    return [parts[0], input, parts.slice(1).join(' ____ ')];
  }

  // ---------- feedback (U8) ----------
  function feedback(res, onShow) {
    if (!res) return null;
    const cls = res.correct ? 'ok' : res.spellingOnly ? 'spelling' : 'wrong';
    const rv = res.reveal || {};
    const right = [...(rv.answer || []), ...(rv.acceptable || [])].join(' / ');
    return h('div', { class: 'fb fb--' + cls, role: 'status' },
      h('b', null, t('ieltsReading.verdict.' + cls)),
      !res.correct && right && h('div', null, t('ieltsReading.rightAnswer') + ': ', h('strong', null, right)),
      !res.correct && res.trap && h('span', { class: 'badge badge--warn' }, t('ieltsReading.trap.' + res.trap)),
      rv.explanation && h('p', null, loc(rv.explanation)),
      onShow && (rv.quote || rv.textAnchor || rv.audioStart != null) && h('button', { class: 'link', type: 'button', onclick: () => onShow(rv) }, t('ieltsReading.showInText')));
  }

  // ---------- question group (U9) ----------
  // ctx: { run, mode, paper, entriesById, onFocus(id), onAnswer(id, v, {silent}), onCheck(id), onFlag(id), checking:Set, onShow(rv), selectLetters(group), readonly }
  function group(g, ctx) {
    const ents = ctx.entries.filter((e) => e.group === g);
    if (!ents.length) return null;
    const first = ents[0].numbers[0], last = ents.at(-1).numbers.at(-1);
    const k = kindOf(g.type);
    const paperGap = ctx.paper && k === 'gap';
    const sec = h('section', { class: 'qgroup' },
      h('header', { class: 'qgroup__head' },
        h('h3', null, first === last ? t('ielts.term.question', { n: first }) : t('ielts.term.questions', { from: first, to: last })),
        h('span', { class: 'badge' }, typeLabel(g.type))),
      g.instruction && h('p', { class: 'qgroup__ins' }, String(g.instruction).replace(/^Questions? [\d–-]+\.\s*/, '')));
    if (k === 'select' && (g.headings || g.options)) {
      sec.appendChild(h('div', { class: 'qlist' }, h('b', null, g.headings ? t('ielts.term.headingsList') : g.optionsTitle || t('ieltsReading.options')),
        (g.headings || g.options).map((o) => h('p', null, h('i', null, o.key), ' ', o.text))));
    }
    if (g.summary) sec.appendChild(h('div', { class: 'qlist qlist--text' }, g.title && h('b', null, g.title), h('p', null, g.summary)));
    if (g.table) sec.appendChild(h('div', { class: 'table-wrap' }, h('table', { class: 'table qtable' }, g.table.caption && h('caption', null, g.table.caption),
      g.table.head && h('thead', null, h('tr', null, g.table.head.map((c) => h('th', null, c)))),
      h('tbody', null, (g.table.rows || []).map((r) => h('tr', null, r.map((c) => h('td', null, c))))))));
    if (g.steps) sec.appendChild(h('ol', { class: 'qsteps' }, g.steps.map((s) => h('li', null, s))));
    if (g.figure?.svg) sec.appendChild(h('div', { class: 'qfigure', html: sanitizeSvg(g.figure.svg) }));
    if (g.image?.url) sec.appendChild(h('figure', { class: 'qmap' }, h('img', { src: g.image.url, alt: g.image.alt || '' }),
      (g.markers || []).map((m) => h('span', { class: 'qmap__mark', style: { left: m.x * 100 + '%', top: m.y * 100 + '%' } }, m.id))));
    if (paperGap) {
      sec.appendChild(h('div', { class: 'paper' }, g.title && !g.summary && h('b', null, g.title), ents.map((e) => paperRow(e, ctx))));
    } else {
      ents.forEach((e) => sec.appendChild(itemBlock(e, ctx)));
    }
    return sec;
  }

  function sanitizeSvg(svg) {
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    doc.querySelectorAll('script,foreignObject,iframe').forEach((n) => n.remove());
    doc.querySelectorAll('*').forEach((n) => [...n.attributes].forEach((a) => { if (/^on/i.test(a.name) || /javascript:/i.test(a.value)) n.removeAttribute(a.name); }));
    return doc.documentElement.outerHTML;
  }

  function gapInput(e, ctx, { autoCheck } = {}) {
    const res = ctx.run.checked[e.id];
    const inp = h('input', { class: 'gap' + (res ? (res.correct ? ' gap--ok' : ' gap--bad') : ''), type: 'text', value: ctx.run.answers[e.id] || '',
      autocomplete: 'off', autocapitalize: 'off', spellcheck: false, 'aria-label': t('ieltsReading.answer') + ' ' + numLabel(e),
      disabled: ctx.readonly || (res && ctx.mode === 'study'),
      onfocus: () => ctx.onFocus(e.id),
      oninput: (ev) => ctx.onAnswer(e.id, ev.target.value, { silent: true }),
      onkeydown: (ev) => { if (ev.key === 'Enter') ev.target.blur(); },
      onblur: () => { if (autoCheck && ctx.mode !== 'exam' && isAnswered(ctx.run.answers[e.id]) && !ctx.run.checked[e.id]) ctx.onCheck(e.id); } });
    inp.style.width = Math.max(7, Math.min(22, (inp.value || '').length + 3)) + 'ch';
    inp.addEventListener('input', () => { inp.style.width = Math.max(7, Math.min(22, inp.value.length + 3)) + 'ch'; });
    return inp;
  }

  function paperRow(e, ctx) {
    const res = ctx.run.checked[e.id];
    return h('div', { class: 'paper__row' + (ctx.run.current === e.id ? ' is-current' : ''), id: 'q-' + e.id },
      h('span', { class: 'qnum' }, numLabel(e)),
      h('div', { class: 'paper__prompt' }, gapPrompt(e.item.prompt, gapInput(e, ctx, { autoCheck: true })),
        res && !res.correct && h('div', { class: 'row', style: { marginTop: '6px', gap: '6px' } },
          h('span', { class: 'badge badge--danger' }, t('ieltsListening.rightIs', { answer: res.reveal?.answer?.[0] || '' })),
          res.trap && h('span', { class: 'badge badge--warn' }, t('ieltsReading.trap.' + res.trap))),
        res && ctx.mode === 'study' && feedback(res, ctx.onShow)));
  }

  function itemBlock(e, ctx) {
    const k = kindOf(e.type);
    const run = ctx.run;
    const v = run.answers[e.id];
    const res = run.checked[e.id];
    const locked = ctx.readonly || (res && ctx.mode === 'study');
    const flag = h('button', { class: 'qflag' + (run.flags[e.id] ? ' is-on' : ''), type: 'button', 'aria-pressed': String(!!run.flags[e.id]), 'aria-label': t('ieltsReading.flag'), title: t('ieltsReading.flag'), onclick: () => ctx.onFlag(e.id) }, '⚑');
    let row, below = null;
    if (k === 'select') {
      const letters = ctx.selectLetters(e.group);
      row = [h('strong', { class: 'grow' }, e.item.prompt || ''),
        h('select', { class: 'input qselect', disabled: locked, 'aria-label': t('ieltsReading.answer') + ' ' + numLabel(e), onfocus: () => ctx.onFocus(e.id), onchange: (ev) => ctx.onAnswer(e.id, ev.target.value) },
          h('option', { value: '' }, t('ieltsReading.choose')), letters.map((l) => h('option', { value: l, selected: v === l }, l)))];
    } else if (k === 'gap') {
      row = [h('div', { class: 'grow qprompt' }, gapPrompt(e.item.prompt, gapInput(e, ctx)))];
    } else {
      row = [h('div', { class: 'grow qprompt' }, e.item.prompt || '')];
      if (k === 'judgement') {
        below = h('div', { class: 'pills', role: 'radiogroup' }, AO[e.type].map((o) => h('button', { type: 'button', class: 'pill' + (v === o ? ' is-on' : ''), role: 'radio', 'aria-checked': String(v === o), disabled: locked, onclick: () => ctx.onAnswer(e.id, o) }, o)));
      } else if (k === 'choice') {
        below = h('div', { class: 'opts' }, (e.item.options || []).map((o) => h('button', { type: 'button', class: 'opt' + (v === o.key ? ' is-on' : ''), 'aria-pressed': String(v === o.key), disabled: locked, onclick: () => ctx.onAnswer(e.id, o.key) }, h('i', null, o.key), h('span', null, o.text))));
      } else if (k === 'multi') {
        const arr = Array.isArray(v) ? v : [];
        const n = e.numbers.length;
        below = h('div', { class: 'stack-sm' }, h('p', { class: 'xs muted' }, I18n.tp('ieltsReading.chooseN', n)),
          h('div', { class: 'opts' }, (e.item.options || []).map((o) => h('button', { type: 'button', class: 'opt' + (arr.includes(o.key) ? ' is-on' : ''), 'aria-pressed': String(arr.includes(o.key)), disabled: locked,
            onclick: () => { const nx = arr.includes(o.key) ? arr.filter((x) => x !== o.key) : [...arr, o.key].sort(); ctx.onAnswer(e.id, nx); } }, h('i', null, o.key), h('span', null, o.text)))),
          arr.length > n && h('p', { class: 'error' }, t('ieltsReading.tooMany', { n })));
      }
    }
    const checkBtn = !ctx.readonly && ctx.mode !== 'exam' && !res && h('button', { class: 'btn btn--secondary btn--sm', type: 'button', disabled: !isAnswered(v) || ctx.checking.has(e.id), onclick: () => ctx.onCheck(e.id) }, t('ieltsReading.check'));
    return h('div', { class: 'q' + (k === 'select' ? ' q--select' : '') + (run.current === e.id ? ' is-current' : ''), id: 'q-' + e.id, onclick: () => ctx.onFocus(e.id) },
      h('div', { class: 'q__row' }, h('span', { class: 'qnum' }, numLabel(e)), row, flag),
      below, checkBtn && h('div', null, checkBtn), res && feedback(res, ctx.onShow));
  }

  // ---------- task card (qe) — shown inside Практика when ieltsTest is set ----------
  const MODES = ['exam', 'practice', 'study'];
  const MODE_ICON = { exam: 'clock', practice: 'target', study: 'reading' };
  async function taskCard(p, { skill, back }) {
    const { test, document: doc } = await Api.test(p.ieltsTest);
    const listening = skill === 'listening' || !!doc.parts;
    const draft = Draft.get(test.id);
    const allowed = test.kind === 'test' ? ['exam'] : MODES;
    let mode = draft?.mode || (allowed.includes('practice') ? 'practice' : allowed[0]);
    const lbl = runLabel(doc);
    const nQ = test.maxScore || test.questionCount || totalQ(entriesOf(flatten(doc)));
    const mins = listening ? Math.max(1, Math.round((doc.parts || []).reduce((s, x) => s + (x.audio?.durationSec || 0), 0) / 60)) : Math.round(timeLimit(doc) / 60);
    const types = [...new Set((test.questionTypes || []).map(typeLabel))];
    const SK = listening ? 'Listening' : 'Reading';
    const runScreen = listening ? 'ielts-listening-run' : 'ielts-reading-run';
    const hint = (m) => listening ? t('ieltsListening.modeHint.' + m) : m === 'exam' ? t('ieltsReading.modeHint.exam', { n: mins }) : t('ieltsReading.modeHint.' + m);

    const modeBox = h('div', { class: 'modes', role: 'radiogroup', 'aria-label': t('ieltsReading.modeLabel') });
    const cta = h('a', { class: 'btn btn--primary btn--lg' });
    function paint() {
      modeBox.replaceChildren(...MODES.map((m) => {
        const dis = !allowed.includes(m) || (draft && draft.mode !== m);
        return h('button', { type: 'button', class: 'mode', role: 'radio', 'aria-checked': String(mode === m), disabled: dis, onclick: () => { mode = m; paint(); } },
          icon(MODE_ICON[m]), h('span', null, h('strong', null, t('ieltsReading.mode.' + m)), h('span', { class: 'xs muted' }, hint(m))));
      }));
      cta.textContent = draft ? t('ieltsReading.continue') : t('ieltsReading.start.' + mode);
      cta.href = Router.href({ screen: runScreen, ieltsTest: test.id, mode, ...backParams(back) });
    }
    paint();
    const rem = draft && Draft.remaining(draft);
    const la = test.lastAttempt;
    const view = back?.view;
    const listKey = view ? (listening ? `ieltsLearn.listening.${view.slice(10)}` : `ieltsLearn.reading.${view}`) : null;
    const listLabel = listKey && t(listKey);
    const learn = (v) => Router.href({ screen: 'ielts', ieltsTab: 'learn', ieltsView: v || null });
    return h('div', { class: 'stack' }, Practice.crumbs({ label: t('ieltsHub.tab.learn'), href: learn() }, { label: SK, href: learn('skill-' + SK.toLowerCase()) },
      listLabel && { label: listLabel, href: learn(view) }, { label: test.title }), h('div', { class: 'split' },
      h('div', { class: 'stack' },
        h('section', { class: 'card stack' },
          h('div', { class: 'row' }, h('span', { class: 'item__icon' }, icon(listening ? 'listening' : 'reading')), h('div', { class: 'grow' }, h('h2', null, test.title),
            h('p', { class: 'muted small' }, loc(doc.topic) || (listening ? doc.parts?.[0]?.context : '')))),
          h('div', { class: 'chips' },
            !listening && h('span', { class: 'badge' }, I18n.trackName(test.module)),
            lbl && h('span', { class: 'badge' }, lbl),
            h('span', { class: 'badge' }, t('ieltsReading.questions', { n: nQ })),
            test.words > 0 && h('span', { class: 'badge' }, t('ieltsReading.words', { n: test.words })),
            h('span', { class: 'badge' }, listening ? t('ieltsListening.audioMin', { n: mins }) : t('ieltsReading.aboutMin', { n: mins }))),
          types.length > 0 && h('div', { class: 'row small' }, h('span', { class: 'muted' }, t('ieltsReading.questionTypes')), types.map((x) => h('span', { class: 'badge' }, x))),
          h('div', { class: 'label' }, t('ieltsReading.modeLabel')), modeBox,
          draft && h('div', { class: 'notice row row--between' },
            h('span', null, t('ieltsReading.draftNote', { mode: t('ieltsReading.mode.' + draft.mode), n: Object.keys(draft.answers || {}).length }) + (rem ? ' · ' + t('ieltsReading.draftTimer', { left: I18n.tp('ieltsHub.minutesLeft', Math.round(rem / 60)) }) : '')),
            h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => { Draft.drop(test.id); App.render({ keepScroll: true }); } }, t('ieltsReading.draftDrop'))),
          h('div', null, cta))),
      h('aside', { class: 'stack' },
        h('section', { class: 'card card--brand stack-sm' }, h('h3', null, t(listening ? 'ieltsListening.tools.title' : 'ieltsReading.tools.title')),
          (listening ? ['player', 'transcript', 'segment'] : ['marker', 'vocab', 'paragraph']).map((k) => h('p', { class: 'small' }, '• ' + t((listening ? 'ieltsListening.tools.' : 'ieltsReading.tools.') + k)))),
        h('section', { class: 'card stack-sm' }, h('h3', null, t('ieltsReading.last.title')),
          la ? [h('p', null, h('span', { class: 'num' }, t('ieltsReading.of', { n: la.rawScore, total: la.maxScore })), ' · ', t('ieltsReading.accuracy', { n: Math.round(la.rawScore / Math.max(1, la.maxScore) * 100) })),
            h('p', { class: 'small muted' }, [t('ieltsReading.mode.' + la.mode), DOM.date(la.finishedAt), t('ieltsReading.minSec', { m: Math.floor((la.timeSec || 0) / 60), s: (la.timeSec || 0) % 60 })].join(' · ') + (la.band != null ? ` · band ${DOM.band(la.band)}` : '')),
            h('div', null, h('a', { class: 'btn btn--secondary btn--sm', href: Router.href({ screen: 'ielts-reading-review', ieltsWork: la.id, ...backParams(back) }) }, t('ieltsReading.last.open')))]
            : h('p', { class: 'small muted' }, t('ieltsReading.last.none'))))));
  }

  // back target is carried in the URL so refresh/back keep working
  function backParams(back) { return back ? { backTab: back.tab, backView: back.view } : {}; }
  function backHref(p, testId) {
    return Router.href({ screen: 'ielts', ieltsTab: p.backTab || 'learn', ieltsView: p.backView || null, ieltsTest: testId || null });
  }

  // ---------- run header / confirm ----------
  function confirmSubmit({ exam, unanswered, onConfirm }) {
    DOM.dialog((close) => {
      const ok = h('button', { class: 'btn btn--primary', type: 'button', onclick: async () => { ok.disabled = true; close(); await onConfirm(); } }, t(exam ? 'ieltsReading.submit' : 'ieltsReading.finish'));
      const cancel = h('button', { class: 'btn btn--secondary', type: 'button', onclick: close }, t('ieltsReading.cancel'));
      setTimeout(() => cancel.focus());
      return h('div', { class: 'stack' }, h('h2', null, t('ieltsReading.confirmTitle')),
        h('p', null, unanswered > 0 ? t('ieltsReading.confirmUnanswered', { n: unanswered }) : t('ieltsReading.confirmAll')),
        h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, cancel, ok));
    });
  }

  window.RL = { AE, AL, AI, typeLabel, kindOf, loc, flatten, entriesOf, numLabel, totalQ, isAnswered, answeredCount, timeLimit, runLabel,
    newRun, Draft, focusQ, payload, quotaMessage, group, feedback, gapPrompt, taskCard, backParams, backHref, confirmSubmit };
})();
