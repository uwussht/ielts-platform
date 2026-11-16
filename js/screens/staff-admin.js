// Staff area, part 2 (server/src/staff.js):
//   ?screen=staff-tests               the test bank by skill, with attempts and the average band
//   ?screen=staff-tests&test=ID       one test with its answer keys
//   ?screen=staff-student&student=ID  everything one student has done
(function () {
  const { h, icon } = DOM;
  const S = () => Api.staff;
  const bandStr = (v) => (v == null ? '—' : Number(v).toFixed(1));
  const when = (d) => (d ? DOM.dateFull(d) : '—');
  const errText = (reason) => (I18n.has('staff.err.' + reason) ? t('staff.err.' + reason) : t('staff.err.server'));
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

  /** A student's work: Writing and Speaking are graded by the AI (server/src/ai.js). */
  function attemptsTable(list) {
    return h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', null, h('tr', null, ['work', 'skill', 'date', 'result'].map((k) => h('th', { scope: 'col' }, t('review.col.' + k))))),
      h('tbody', null, list.map((a) => h('tr', null,
        h('td', null, h('b', null, a.skill === 'diagnostic' ? t('ieltsProgressV.src.diagnostic') : a.title || a.testId), h('div', { class: 'xs muted' }, a.testId)),
        h('td', { class: 'small' }, skillName(a.skill)),
        h('td', { class: 'small' }, when(a.finishedAt)),
        h('td', null, ['pending_ai', 'grading'].includes(a.status) ? DOM.statusBadge('warn', t('ieltsGoal.checking'))
          : a.status === 'failed' ? DOM.statusBadge('danger', t('ieltsMock.result.cell.failed'))
          : h('b', { class: 'num' }, a.band != null ? bandStr(a.band) : a.maxScore ? `${a.rawScore}/${a.maxScore}` : '—')))))));
  }

  Screens['staff-student'] = {
    title: () => t('review.studentTitle'),
    async render(p) {
      const head = Hub.pageHead({ title: t('review.studentTitle'), eyebrow: t('staff.nav.group') });
      const no = await guard(head);
      if (no) return no;
      const wrap = h('div', { class: 'stack' }, head, back(t('staff.title'), Router.href({ screen: 'staff' })));
      const r = await S().userAttempts(p.student);
      if (!r.ok) { fail(wrap, r); return wrap; }
      wrap.append(r.attempts.length ? attemptsTable(r.attempts) : Hub.empty({ icon: 'progress', title: t('review.noWork') }));
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
