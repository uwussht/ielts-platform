// Staff area, part 2 (server/src/staff.js):
//   ?screen=staff-review              writing, speaking and diagnostics waiting for a teacher, and the ones already graded
//   ?screen=staff-review&attempt=ID   one piece of work: the task, the essay or the recordings, the grading form
//   ?screen=staff-tests               the test bank by skill, with attempts and the average band
//   ?screen=staff-tests&test=ID       one test with its answer keys
//   ?screen=staff-student&student=ID  everything one student has done
(function () {
  const { h, icon } = DOM;
  const S = () => Api.staff;
  const bandStr = (v) => (v == null ? '—' : Number(v).toFixed(1));
  const when = (d) => (d ? DOM.dateFull(d) : '—');
  const errText = (reason) => (I18n.has('staff.err.' + reason) ? t('staff.err.' + reason) : t('staff.err.server'));
  const CRITERIA = {
    writing: ['taskResponse', 'coherenceCohesion', 'lexicalResource', 'grammaticalRange'],
    speaking: ['fluencyCoherence', 'lexicalResource', 'grammaticalRange', 'pronunciation'],
  };
  const BANDS = Array.from({ length: 19 }, (_, i) => i / 2);
  const SKILLS = ['reading', 'listening', 'writing', 'speaking', 'vocab', 'mock'];

  /** The staff role is loaded once; without it the screen says who may open it. */
  async function guard(head, perm = 'staff') {
    if (!State.staff) { const r = await Api.staff.me(); if (r.ok) State.staff = r.user; }
    if (App.can(perm)) return null;
    return h('div', { class: 'stack' }, head, Hub.empty({ icon: 'lock', title: t('staff.noAccess'), text: t(State.staff ? 'staff.noAccessNote' : 'staff.noServerNote') }));
  }
  const fail = (wrap, res) => wrap.append(h('p', { class: 'error' }, errText(res?.reason)));
  const back = (label, href) => h('a', { class: 'link small', href }, icon('arrowL', 'ic16'), ' ', label);
  const skillName = (s) => Hub.SKILL_NAME[s] || t('review.skill.' + s);

  // ---------- generic test document (questions with their keys) ----------
  const textOf = (x) => (typeof x === 'string' ? x : x?.text || x?.prompt || x?.question || '');
  function keyLine(it) {
    const ans = [].concat(it.answer || []).filter((x) => x != null && x !== '');
    if (!ans.length) return null;
    return h('div', { class: 'bank-key small' }, h('b', null, t('bank.answer'), ': '), ans.join(' / '),
      it.acceptable?.length > 0 && h('span', { class: 'muted' }, ` (${t('bank.acceptable')}: ${it.acceptable.join(', ')})`),
      it.explanation && h('div', { class: 'muted' }, typeof it.explanation === 'object' ? it.explanation[I18n.lang] || it.explanation.ru || it.explanation.en || '' : it.explanation));
  }
  function itemsBlock(groups) {
    return (groups || []).map((g) => h('section', { class: 'card stack-sm' },
      h('div', { class: 'row row--between' }, h('b', null, g.title || g.type || ''), g.range && h('span', { class: 'badge' }, g.range.join('–'))),
      g.instruction && h('p', { class: 'small muted' }, g.instruction),
      g.summary && h('p', { class: 'small', lang: 'en' }, g.summary),
      g.headings && h('ul', { class: 'bul small' }, g.headings.map((x) => h('li', null, `${x.key}. ${x.text}`))),
      h('ol', { class: 'bank-items stack-sm' }, (g.items || []).map((it) => h('li', { class: 'stack-sm' },
        h('span', { lang: 'en' }, textOf(it) || it.id),
        it.audio?.url && h('audio', { controls: true, preload: 'none', src: it.audio.url, class: 'bank-audio' }),
        it.options && h('ul', { class: 'bul small' }, it.options.map((o) => h('li', null, `${o.key}. ${o.text}`))),
        keyLine(it))))));
  }
  function documentView(doc) {
    if (!doc) return '';
    const parts = doc.parts || [];
    return h('div', { class: 'stack' },
      doc.question && h('section', { class: 'card stack-sm' }, h('b', null, t('review.task')), h('p', { class: 'pre', lang: 'en' }, doc.question)),
      doc.cue && h('section', { class: 'card stack-sm' }, h('b', { lang: 'en' }, doc.cue), h('ul', { class: 'bul small', lang: 'en' }, (doc.bullets || []).map((b) => h('li', null, b)))),
      doc.questions && h('section', { class: 'card stack-sm' }, h('ol', { class: 'bul', lang: 'en' }, doc.questions.map((q) => h('li', null, textOf(q))))),
      (doc.texts || []).map((tx) => h('details', { class: 'card' }, h('summary', null, tx.title || t('bank.text')),
        h('div', { class: 'stack-sm', lang: 'en' }, (tx.paragraphs || []).map((p) => h('p', { class: 'small' }, p.label ? h('b', null, p.label + ' ') : null, textOf(p)))))),
      parts.map((p) => h('div', { class: 'stack-sm' },
        h('h3', null, t('ielts.term.part', { n: p.number || '' })),
        p.audio?.url && h('audio', { controls: true, preload: 'none', src: p.audio.url, class: 'bank-audio' }),
        itemsBlock(p.groups))),
      itemsBlock(doc.groups));
  }

  // ---------- grading form ----------
  function gradeForm(a, skill, onDone) {
    const keys = CRITERIA[skill];
    const prev = (a.skill === 'diagnostic' ? a.result?.[skill] : a.result) || {};
    const sel = Object.fromEntries(keys.map((k) => [k, h('select', { class: 'input input--sm', id: 'g-' + k, 'aria-label': t('review.crit.' + k) },
      h('option', { value: '' }, '—'), BANDS.map((b) => h('option', { value: b, selected: prev.criteria?.[k] === b }, b.toFixed(1))))]));
    const fb = h('textarea', { class: 'input', rows: 5, id: 'g-feedback', maxlength: 5000, placeholder: t('review.feedbackHint') });
    fb.value = prev.feedback || '';
    const err = h('p', { class: 'error', role: 'alert' });
    const btn = h('button', { class: 'btn btn--primary', type: 'submit' }, t('review.save'));
    return h('form', { class: 'card stack', novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      const criteria = {};
      for (const k of keys) { if (sel[k].value === '') { err.textContent = t('review.fillAll'); sel[k].focus(); return; } criteria[k] = Number(sel[k].value); }
      btn.disabled = true;
      const r = await S().grade(a.id, { skill, criteria, feedback: fb.value });
      btn.disabled = false;
      if (!r.ok) { err.textContent = errText(r.reason); return; }
      DOM.toast(t('review.saved', { band: bandStr(r.band) }));
      onDone();
    } },
      h('h3', null, t('review.gradeTitle', { skill: skillName(skill) })),
      h('div', { class: 'review-crit' }, keys.map((k) => h('label', { class: 'field', for: 'g-' + k }, h('span', { class: 'small' }, t('review.crit.' + k)), sel[k]))),
      h('label', { class: 'field', for: 'g-feedback' }, h('span', { class: 'small' }, t('review.feedback')), fb),
      err, h('div', null, btn));
  }

  function recordings(a, questions) {
    if (!a.audio?.length) return h('p', { class: 'small muted' }, t('review.noAudio'));
    return h('ol', { class: 'stack-sm review-audio' }, a.audio.map((x) => {
      const player = h('audio', { controls: true, preload: 'none' });
      const load = h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: async () => {
        load.disabled = true;
        try { player.src = await S().audio(x.id); load.replaceWith(player); player.play().catch(() => {}); }
        catch { load.disabled = false; DOM.toast(t('staff.err.server')); }
      } }, icon('play', 'ic16'), t('review.listen'));
      return h('li', { class: 'stack-sm' }, h('span', { class: 'small', lang: 'en' }, questions[x.itemId] || x.itemId),
        h('div', { class: 'row' }, load, x.durationSec != null && h('span', { class: 'xs muted' }, DOM.mmss(Math.round(x.durationSec)))));
    }));
  }
  const questionsOf = (doc) => {
    const out = {};
    for (const q of doc?.questions || []) out[q.id] = textOf(q);
    if (doc?.cue) out[doc.id + '-cue'] = doc.cue;
    for (const g of doc?.groups || []) for (const it of g.items || []) out[it.id] = textOf(it);
    return out;
  };

  /** One attempt for a teacher: the task, what the student did, the form. */
  async function attemptPage(id, head) {
    const wrap = h('div', { class: 'stack review' }, head, back(t('review.back'), Router.href({ screen: 'staff-review' })));
    const r = await S().attempt(id);
    if (!r.ok) { fail(wrap, r); return wrap; }
    const a = r.attempt, res = a.result || {};
    const reload = () => App.render({ keepScroll: false });
    wrap.append(h('section', { class: 'card stack-sm' },
      h('div', { class: 'row row--between' }, h('h2', null, a.title || a.testId), DOM.statusBadge(a.status === 'done' ? 'ok' : 'warn', t('review.status.' + a.status))),
      h('p', { class: 'small muted' }, [a.student, skillName(a.skill), a.testId, when(a.finishedAt)].filter(Boolean).join(' · ')),
      a.band != null && h('p', null, t('ieltsWriting.band'), ': ', h('b', null, bandStr(a.band))),
      h('a', { class: 'link small', href: Router.href({ screen: 'staff-student', student: a.userId }) }, t('review.allWork'))));

    if (a.skill === 'writing') {
      wrap.append(documentView(a.document),
        h('section', { class: 'card stack-sm' }, h('div', { class: 'row row--between' }, h('b', null, t('review.essay')), h('span', { class: 'badge' }, t('ieltsWriting.wordsN', { n: res.words ?? 0 }))),
          h('div', { class: 'review-essay', lang: 'en' }, String(a.answers?.text || '').split(/\n+/).map((p) => h('p', null, p)))),
        gradeForm(a, 'writing', reload));
    } else if (a.skill === 'speaking') {
      wrap.append(documentView(a.document), h('section', { class: 'card stack-sm' }, h('b', null, t('review.recordings')), recordings(a, questionsOf(a.document))), gradeForm(a, 'speaking', reload));
    } else if (a.skill === 'diagnostic') {
      const b = res.bands || {};
      wrap.append(h('section', { class: 'card stack-sm' }, h('b', null, t('review.diagBands')),
        h('p', { class: 'small' }, ['listening', 'reading', 'writing', 'speaking'].map((s) => `${skillName(s)} ${bandStr(b[s])}`).join(' · '), ' · ', h('b', null, `Overall ${bandStr(b.overall)}`))));
      if (res.writing) wrap.append(h('section', { class: 'card stack-sm' }, h('b', null, t('review.task')), h('p', { class: 'small', lang: 'en' }, res.writing.question || ''),
        h('b', null, t('review.essay')), h('div', { class: 'review-essay', lang: 'en' }, String(res.writing.text || '').split(/\n+/).map((p) => h('p', null, p)))), gradeForm(a, 'writing', reload));
      if (res.speaking) wrap.append(h('section', { class: 'card stack-sm' }, h('b', null, t('review.recordings')), recordings(a, {})), gradeForm(a, 'speaking', reload));
    } else {
      wrap.append(h('p', { class: 'small' }, t('review.autoChecked', { n: a.rawScore ?? 0, total: a.maxScore ?? 0 })), documentView(a.document));
    }
    return wrap;
  }

  function attemptsTable(list, { student = true } = {}) {
    return h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', null, h('tr', null, [student && 'student', 'work', 'skill', 'date', 'result'].filter(Boolean).map((k) => h('th', { scope: 'col' }, t('review.col.' + k))))),
      h('tbody', null, list.map((a) => h('tr', null,
        student && h('td', null, h('a', { class: 'link', href: Router.href({ screen: 'staff-student', student: a.userId }) }, a.student || '—')),
        h('td', null, h('a', { class: 'link', href: Router.href({ screen: 'staff-review', attempt: a.id }) }, a.title || a.testId), h('div', { class: 'xs muted' }, a.testId)),
        h('td', { class: 'small' }, skillName(a.skill)),
        h('td', { class: 'small' }, when(a.finishedAt)),
        h('td', null, a.status === 'pending_review' ? DOM.statusBadge('warn', t('review.status.pending_review'))
          : h('b', { class: 'num' }, a.band != null ? bandStr(a.band) : a.maxScore ? `${a.rawScore}/${a.maxScore}` : '—')))))));
  }

  Screens['staff-review'] = {
    title: () => t('review.title'),
    async render(p) {
      const head = Hub.pageHead({ title: t('review.title'), sub: t('review.sub'), eyebrow: t('staff.nav.group') });
      const no = await guard(head, 'review');
      if (no) return no;
      if (p.attempt) return attemptPage(p.attempt, head);
      const done = p.tab === 'done';
      const wrap = h('div', { class: 'stack' }, head,
        Hub.seg([['queue', t('review.queue')], ['done', t('review.done')]], done ? 'done' : 'queue', (v) => Router.patch({ tab: v === 'done' ? 'done' : null })));
      const r = await S().reviews(done);
      if (!r.ok) { fail(wrap, r); return wrap; }
      wrap.append(r.attempts.length ? attemptsTable(r.attempts) : Hub.empty({ icon: 'check', title: t(done ? 'review.noneDone' : 'review.none') }));
      return wrap;
    },
  };

  Screens['staff-student'] = {
    title: () => t('review.studentTitle'),
    async render(p) {
      const head = Hub.pageHead({ title: t('review.studentTitle'), eyebrow: t('staff.nav.group') });
      const no = await guard(head);
      if (no) return no;
      const wrap = h('div', { class: 'stack' }, head, back(t('staff.title'), Router.href({ screen: 'staff' })));
      const r = await S().userAttempts(p.student);
      if (!r.ok) { fail(wrap, r); return wrap; }
      wrap.append(r.attempts.length ? attemptsTable(r.attempts, { student: false }) : Hub.empty({ icon: 'progress', title: t('review.noWork') }));
      return wrap;
    },
  };

  Screens['staff-tests'] = {
    title: () => t('bank.title'),
    async render(p) {
      const head = Hub.pageHead({ title: t('bank.title'), sub: t('bank.sub'), eyebrow: t('staff.nav.group') });
      const no = await guard(head);
      if (no) return no;
      if (p.test) {
        const wrap = h('div', { class: 'stack' }, head, back(t('bank.back'), Router.href({ screen: 'staff-tests', skill: p.skill })));
        const r = await S().test(p.test);
        if (!r.ok) { fail(wrap, r); return wrap; }
        const tt = r.test || {};
        wrap.append(h('section', { class: 'card stack-sm' }, h('h2', null, tt.title || p.test),
          h('div', { class: 'chips' }, [p.test, tt.kind, tt.module, tt.category, tt.questionCount && t('bank.questionsN', { n: tt.questionCount }), tt.bandMin != null && `${bandStr(tt.bandMin)}–${bandStr(tt.bandMax)}`]
            .filter(Boolean).map((x) => h('span', { class: 'badge' }, x)), h('span', { class: 'badge ' + (r.hasKey ? 'badge--ok' : '') }, t(r.hasKey ? 'bank.hasKey' : 'bank.noKey')))),
        !r.document?.sections ? '' : h('section', { class: 'card stack-sm' }, h('b', null, t('bank.sections')),
          h('ul', { class: 'bul small' }, Object.entries(r.document.sections).map(([k, v]) => h('li', null, `${skillName(k)}: `,
            [].concat(v).map((id, i) => [i ? ', ' : '', h('a', { class: 'link', href: Router.href({ screen: 'staff-tests', test: id }) }, id)]))))),
        documentView(r.document));
        return wrap;
      }
      const skill = SKILLS.includes(p.skill) ? p.skill : 'reading';
      const list = h('div');
      const search = h('input', { class: 'input staff-search', type: 'search', placeholder: t('bank.search'), 'aria-label': t('bank.search') });
      const count = h('span', { class: 'muted small staff-count' });
      let timer;
      search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 300); });
      async function load() {
        const r = await S().tests(skill, search.value.trim());
        if (!r.ok) { list.replaceChildren(h('p', { class: 'error' }, errText(r.reason))); return; }
        count.textContent = t('bank.count', { n: r.tests.length });
        list.replaceChildren(h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
          h('thead', null, h('tr', null, ['test', 'kind', 'questions', 'level', 'attempts', 'avg', 'key'].map((k) => h('th', { scope: 'col' }, t('bank.col.' + k))))),
          h('tbody', null, r.tests.map((x) => h('tr', null,
            h('td', null, h('a', { class: 'link', href: Router.href({ screen: 'staff-tests', skill, test: x.id }) }, x.title || x.id), h('div', { class: 'xs muted' }, x.id)),
            h('td', { class: 'small' }, [x.kind, x.category, x.module].filter(Boolean).join(' · ')),
            h('td', { class: 'num' }, x.questionCount ?? '—'),
            h('td', { class: 'small num' }, x.bandMin != null ? `${bandStr(x.bandMin)}–${bandStr(x.bandMax)}` : '—'),
            h('td', { class: 'num' }, x.attempts),
            h('td', { class: 'num' }, bandStr(x.avgBand)),
            h('td', null, x.hasKey ? icon('check', 'ic16') : h('span', { class: 'muted' }, '—'))))))));
      }
      load();
      return h('div', { class: 'stack' }, head,
        Hub.seg(SKILLS.map((s) => [s, skillName(s)]), skill, (v) => Router.patch({ skill: v })),
        h('div', { class: 'row staff-tools' }, search, count), list);
    },
  };
})();
