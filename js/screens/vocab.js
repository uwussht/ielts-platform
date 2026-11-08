// Словарь (ai-tutor vocab, IELTS part + Мой словарь): IELTS topic sets and Academic Word List with
// server-scheduled spaced repetition (/mobile/vocab-progress), set view, practice
// (choice / match / dictation / write) and the user's own saved words (/mobile/lesson-vocab).
// General-English levels and professional fields are not part of the IELTS product here.
(function () {
  const { h, icon } = DOM;
  const put = (el, ...k) => el.replaceChildren(...k.flat(9).filter((x) => x != null && x !== false && x !== ''));
  const V = (k, v) => t('vocab.' + k, v);
  const QN = ['environment', 'education', 'technology', 'health', 'work', 'society', 'culture', 'travel'];
  const keyOf = (w) => String(w.id || w.en || w.word || '').toLowerCase();
  const stOf = (s) => (!s?.box ? 'new' : s.due ? 'due' : s.learned ? 'learned' : 'learning');
  const trOf = (w) => (I18n.lang === 'kk' ? w.kk || w.ru : w.ru || w.kk) || '';
  // the set's topic in the UI language, without the AWL prefix; empty when it only repeats the title (English UI)
  const topicOf = (s) => {
    const v = String(s.topic?.[I18n.lang] || s.topic?.ru || '').replace(/^AWL · /, '');
    return v && v !== s.title && v !== String(s.title).replace(/^AWL · /, '') ? v : '';
  };
  const href = (o) => Router.href({ screen: 'ielts', ieltsTab: 'vocab', ...o });
  const imgOf = (s) => s.imageUrl || null;
  const summary = (x = {}, total) => (x.learned >= total && total > 0 ? 'done' : x.due > 0 ? 'due' : x.seen > 0 ? 'progress' : 'new');
  const toast = (m) => DOM.toast?.(m);

  // local stores (same keys as ai-tutor)
  const LS = { learned: 'jts.vocab.learned.v1', misses: 'jts.vocab.misses.v1' };
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  function speak(text, rate = 1) {
    try {
      if (!('speechSynthesis' in window)) throw 0;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text); u.lang = 'en-GB'; u.rate = rate;
      const v = speechSynthesis.getVoices().find((x) => /^en(-|_)/i.test(x.lang)); if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch { toast(t('vocab.lesson.noVoice')); }
  }
  const speakBtn = (word, cls = 'icon-btn') => h('button', { class: cls, type: 'button', 'aria-label': V('ielts.listen', { word }), onclick: (e) => { e.stopPropagation(); speak(word); } }, icon('volume', 'ic16'));

  async function loadSets() {
    const sets = (await Api.vocabSets().catch(() => [])) || [];
    const ord = (c) => (QN.includes(c) ? QN.indexOf(c) : 99);
    sets.sort((a, b) => ord(a.category) - ord(b.category) || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
    const sums = sets.length ? await Api.vocabProgress(sets.map((s) => 'ielts-' + s.id)).catch(() => ({})) : {};
    return sets.map((s) => ({ ...s, scope: 'ielts-' + s.id, sum: sums?.['ielts-' + s.id] || {}, total: s.questionCount || 0, awl: s.category === 'awl' }));
  }
  function metaLine(s) {
    const k = summary(s.sum, s.total), sm = s.sum;
    return k === 'done' ? V('ielts.done', { n: sm.learned, total: s.total }) : k === 'due' ? I18n.tp('vocab.ielts.due', sm.due) : k === 'progress' ? V('ielts.learnedOf', { n: sm.learned || 0, total: s.total }) : V('home.words', { n: s.total });
  }
  // examples come with a gap for the word ("Cars are a major source of carbon ___s."): show it filled in
  const filled = (ex, word) => {
    const parts = String(ex).split(/_{2,}/);
    if (parts.length < 2) return ex;
    const first = parts[0].trim() ? word : word[0].toUpperCase() + word.slice(1); // the gap opens the sentence
    return [parts[0], h('b', null, first), parts.slice(1).join(word)];
  };
  const awlNum = (s) => (String(s.title).match(/\d+/) || [''])[0];

  // ---------- home ----------
  async function home() {
    const [sets, mine] = await Promise.all([loadSets(), Api.savedVocab().then((r) => (r?.words || []).slice().reverse()).catch(() => null)]);
    const topics = sets.filter((s) => !s.awl), awl = sets.filter((s) => s.awl);
    const misses = Object.values(read(LS.misses, { words: {} }).words || {}).sort((a, b) => b.misses - a.misses).slice(0, 3);
    // ai-tutor card: title, topic and progress on the left, picture (or the sublist number) on the right
    const card = (s) => h('a', { class: 'vcard' + (s.awl ? ' vcard--awl' : ''), href: href({ ieltsView: 'ielts-set', ieltsTest: s.id }) },
      h('span', { class: 'vcard__text' },
        h('b', { class: 'vcard__title', lang: 'en' }, s.title), h('span', { class: 'vcard__topic' }, topicOf(s)),
        h('span', { class: 'vcard__meta is-' + summary(s.sum, s.total) }, metaLine(s))),
      s.awl ? h('span', { class: 'vcard__num', 'aria-hidden': 'true' }, awlNum(s))
        : imgOf(s) ? h('img', { class: 'vcard__img', src: imgOf(s), alt: '', loading: 'lazy', width: 96, height: 96 }) : h('span', { class: 'vcard__ic' }, icon('vocab')));
    const section = (id, title, sub, more, body) => h('section', { class: 'stack-sm vsec', id }, h('div', { class: 'vsec__head' }, h('div', { class: 'grow' }, h('h2', null, title), sub && h('p', { class: 'small muted' }, sub)), more), body);
    // the round "→" in a section header (ai-tutor), named for screen readers
    const more = (label, to) => h('a', { class: 'vmore', href: href(to), 'aria-label': label, title: label }, icon('arrowR'));
    return h('div', { class: 'stack vocab' },
      Hub.pageHead({ title: V('home.title'), sub: V('home.pickWay') }),
      !sets.length && mine == null && Hub.empty({ icon: 'vocab', title: V('home.empty'), text: '' }),
      topics.length > 0 && section('vsec-ielts', V('ielts.title'), V('ielts.sub'), more(V('ielts.pick'), { ieltsView: 'ielts-list', set: 'topics' }), h('div', { class: 'vrow' }, topics.map(card))),
      awl.length > 0 && section('vsec-ielts-awl', V('ielts.awl.title'), V('ielts.awl.sub'), more(V('ielts.awl.heading', { n: awl.length }), { ieltsView: 'ielts-list', set: 'awl' }), h('div', { class: 'vrow' }, awl.map(card))),
      section('vsec-mine', V('home.mine'), V('home.mineSaved'), mine?.length ? more(V('home.mine'), { ieltsView: 'mine' }) : null,
        mine == null ? h('p', { class: 'small muted' }, V('home.mineError'))
          : mine.length ? h('div', { class: 'chips' }, mine.slice(0, 8).map((w) => h('a', { class: 'chip vmchip', href: href({ ieltsView: 'mine' }) }, h('b', { lang: 'en' }, w.word), (w.translationRu || w.translationKz) && h('span', { class: 'muted' }, I18n.lang === 'kk' ? w.translationKz || w.translationRu : w.translationRu || w.translationKz))), h('a', { class: 'btn btn--secondary btn--sm', href: href({ ieltsView: 'practice', ieltsTest: 'mine' }) }, V('home.practiceAll', { n: mine.length })))
            : h('div', { class: 'row' }, h('p', { class: 'small muted grow' }, t('vocab.lesson.empty')), h('a', { class: 'btn btn--secondary btn--sm', href: href({ ieltsView: 'mine' }) }, icon('plus', 'ic16'), V('add')))),
      // ai-tutor order: … Мой словарь, then the three most-missed words with a practice button
      misses.length > 0 && section('vsec-top', V('home.top3'), V('home.top3Lead'), null,
        h('div', { class: 'card stack-sm vtop' }, h('div', { class: 'eyebrow' }, V('prac.review')),
          h('ul', { class: 'vtop__list' }, misses.map((m) => h('li', null, h('b', { lang: 'en' }, m.word), h('span', { class: 'small muted' }, I18n.lang === 'kk' ? m.kk || m.ru : m.ru)))),
          h('div', null, h('a', { class: 'btn btn--primary btn--sm', href: href({ ieltsView: 'practice', ieltsTest: 'misses' }) }, V('startPractice'))))));
  }

  // ---------- list ----------
  async function list(p) {
    const sets = await loadSets();
    const topics = sets.filter((s) => !s.awl), awl = sets.filter((s) => s.awl);
    const isAwl = p.set === 'awl' || !topics.length;
    const rows = isAwl ? awl : topics;
    return h('div', { class: 'stack vocab' },
      h('a', { class: 'link small', href: href({}) }, icon('arrowL', 'ic16'), ' ', V('back')),
      Hub.pageHead({ title: isAwl ? V('ielts.awl.title') : V('ielts.pick'), sub: isAwl ? V('ielts.awl.lead', { n: awl.length }) : V('ielts.sub') }),
      topics.length > 0 && awl.length > 0 && Hub.seg([['topics', V('ielts.tabTopics', { n: topics.length })], ['awl', V('ielts.tabAwl', { n: awl.length })]], isAwl ? 'awl' : 'topics', (v) => Router.go({ screen: 'ielts', ieltsTab: 'vocab', ieltsView: 'ielts-list', set: v }), { label: V('ielts.pick') }),
      h('h2', null, isAwl ? V('ielts.awl.heading', { n: awl.length }) : V('ielts.topics')),
      h('div', { class: 'card vlist' }, rows.map((s) => {
        const k = summary(s.sum, s.total), pct = s.total ? Math.round(((s.sum.learned || 0) / s.total) * 100) : 0;
        return h('a', { class: 'virow is-' + k, href: href({ ieltsView: 'ielts-set', ieltsTest: s.id }) },
          s.awl ? h('span', { class: 'vcard__num vcard__num--sm' }, awlNum(s)) : imgOf(s) ? h('img', { src: imgOf(s), alt: '', loading: 'lazy', width: 56, height: 56 }) : h('span', { class: 'vcard__ic vcard__ic--sm' }, icon('vocab')),
          h('div', { class: 'grow' }, h('span', { class: 'xs muted' }, s.awl ? s.title.replace(/^AWL · /, '') : k === 'done' ? V('ielts.kick.done', { total: s.total }) : k === 'due' ? V('ielts.kick.due', { total: s.total, n: s.sum.due }) : k === 'progress' ? V('ielts.kick.progress', { total: s.total }) : V('home.words', { n: s.total })),
            h('b', { class: 'virow__title', lang: 'en' }, s.awl ? s.title : s.title), h('span', { class: 'xs muted' }, s.awl ? V('home.words', { n: s.total }) : topicOf(s))),
          h('span', { class: 'vring', style: { '--p': pct }, role: 'img', 'aria-label': V('ielts.learnedOf', { n: s.sum.learned || 0, total: s.total }) }, h('span', null, pct + '%')));
      })));
  }

  // ---------- set ----------
  async function loadSet(id) {
    const [{ test, document: doc }, states] = await Promise.all([Api.test(id), Api.vocabStates('ielts-' + id).catch(() => ({}))]);
    const words = (doc.words || []).map((w) => ({ ...w, key: keyOf(w) }));
    return { test, words, states: states || {}, scope: 'ielts-' + id };
  }
  function queue(words, states, mode) {
    const due = words.filter((w) => stOf(states[w.key]) === 'due'), fresh = words.filter((w) => stOf(states[w.key]) === 'new');
    return mode === 'review' ? due.slice(0, 15) : mode === 'new' ? fresh.slice(0, 10) : mode === 'auto' ? (due.length ? due.slice(0, 15) : fresh.slice(0, 10)) : words;
  }
  async function setView(p) {
    const S = await loadSet(p.ieltsTest);
    const n = (k) => S.words.filter((w) => stOf(S.states[w.key]) === k).length;
    const learned = n('learned'), due = n('due'), fresh = n('new'), total = S.words.length;
    const go = (mode) => Router.go({ screen: 'ielts', ieltsTab: 'vocab', ieltsView: 'practice', ieltsTest: S.test.id, mode });
    const awl = S.test.category === 'awl';
    // ai-tutor set page: picture (or sublist number), kicker, title and topic; progress; the two buttons; a grid of word cards
    return h('div', { class: 'stack vocab' },
      h('a', { class: 'link small', href: href({ ieltsView: 'ielts-list', set: awl ? 'awl' : 'topics' }) }, icon('arrowL', 'ic16'), ' ', V('back')),
      h('header', { class: 'vset__head' },
        awl ? h('span', { class: 'vcard__num vset__num', 'aria-hidden': 'true' }, awlNum(S.test))
          : imgOf(S.test) && h('img', { class: 'vset__img', src: imgOf(S.test), alt: '', width: 112, height: 112 }),
        h('div', { class: 'stack-sm' }, h('span', { class: 'ph__eyebrow' }, awl ? V('ielts.awl.title') : V('ielts.title')),
          h('h1', { class: 'ph__title', lang: 'en' }, S.test.title), h('p', { class: 'muted' }, topicOf(S.test)))),
      h('div', { class: 'vset__progress' },
        h('div', { class: 'progress grow', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-valuenow': learned, 'aria-label': V('ielts.learnedOf', { n: learned, total }) },
          h('i', { style: { width: (total ? (learned / total) * 100 : 0) + '%' } })),
        h('span', { class: 'small muted' }, V('ielts.progress', { n: learned, total, due }))),
      h('div', { class: 'row vset__actions' },
        due > 0 && h('button', { class: 'btn btn--primary btn--lg', type: 'button', onclick: () => go('review') }, icon('play', 'ic16'), V('ielts.review', { n: Math.min(15, due) })),
        fresh > 0 && h('button', { class: 'btn ' + (due > 0 ? 'btn--secondary' : 'btn--primary') + ' btn--lg', type: 'button', onclick: () => go('new') }, due > 0 ? null : icon('play', 'ic16'), V('ielts.learnNew', { n: Math.min(10, fresh) })),
        !due && !fresh && h('button', { class: 'btn btn--primary btn--lg', type: 'button', onclick: () => go('all') }, icon('play', 'ic16'), V('ielts.practiceAll'))),
      h('p', { class: 'small muted' }, V('ielts.hint')),
      h('ul', { class: 'vgrid' }, S.words.map((w) => {
        const st = stOf(S.states[w.key]);
        return h('li', { class: 'vwcard' }, speakBtn(w.en, 'icon-btn vwcard__say'),
          h('div', { class: 'grow' }, h('b', { class: 'vwcard__en', lang: 'en' }, w.en),
            w.ipa && h('div', { class: 'xs muted' }, `/${w.ipa.replace(/^\/|\/$/g, '')}/`),
            h('div', { class: 'small' }, trOf(w))),
          h('span', { class: 'badge vst--' + st }, V('ielts.st.' + st)));
      })));
  }

  // ---------- practice ----------
  const norm = (s) => String(s || '').normalize('NFKC').toLowerCase().replace(/ё/g, 'е').replace(/\([^)]*\)/g, (m) => m.slice(1, -1))
    .replace(/[аеорсхукАЕОРСХУК]/g, (c) => ({ а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', х: 'x', у: 'y', к: 'k' }[c.toLowerCase()] || c)).replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, ' ').trim();
  const alts = (s) => String(s || '').split(/[/;,]/).map((x) => x.trim()).filter(Boolean);
  const matches = (given, answer) => { const g = norm(given); if (!g) return false; return alts(answer).some((a) => norm(a) === g || norm(a.replace(/\([^)]*\)/g, '')) === g); };
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  async function practice(p, root) {
    let words, scope, title, back, mine = false;
    if (p.ieltsTest === 'misses') {
      words = Object.values(read(LS.misses, { words: {} }).words || {}).sort((a, b) => b.misses - a.misses)
        .map((m) => ({ en: m.word, ru: m.ru, kk: m.kk, key: String(m.word).toLowerCase() }));
      scope = 'misses'; title = V('home.top3'); back = href({});
    } else if (p.ieltsTest === 'mine') {
      const r = await Api.savedVocab();
      words = (r?.words || []).map((w) => ({ id: w.id, en: w.word, ru: w.translationRu, kk: w.translationKz, ipa: w.ipa, example: w.example, key: String(w.word).toLowerCase(), learned: w.learned }));
      scope = 'mine'; title = V('home.mine'); back = href({ ieltsView: 'mine' }); mine = true;
    } else {
      const S = await loadSet(p.ieltsTest);
      words = queue(S.words, S.states, ['review', 'new', 'all'].includes(p.mode) ? p.mode : 'auto'); scope = S.scope; title = S.test.title;
      back = href({ ieltsView: 'ielts-set', ieltsTest: S.test.id });
    }
    const learnedLS = read(LS.learned, { scopes: {} });
    const known = new Set(learnedLS.scopes[scope] || []);
    const st = { phase: 'setup', pool: 'new', count: 10, fmt: { choice: true, match: true, spell: true }, studyFirst: true, items: [], i: 0, si: 0, results: [], answer: null, given: '' };
    const pool = () => { const f = st.pool === 'new' ? words.filter((w) => !known.has(w.key)) : st.pool === 'review' ? words.filter((w) => known.has(w.key)) : words; return f.length ? f : words; };
    function build() {
      const pickd = shuffle(pool()).slice(0, st.count === 'all' ? undefined : st.count);
      const fmts = ['choice', 'match', 'dictation', 'write'].filter((f) => (f === 'dictation' || f === 'write' ? st.fmt.spell : st.fmt[f]));
      if (!fmts.length) fmts.push('choice');
      const items = []; let k = 0, i = 0;
      while (i < pickd.length) {
        let f = fmts[k++ % fmts.length];
        const w = pickd[i];
        if (!trOf(w)) f = 'dictation';
        if (f === 'match') {
          const group = []; const seen = new Set();
          for (let j = i; j < pickd.length && group.length < 4; j++) { const tr = trOf(pickd[j]); if (tr && !seen.has(tr)) { seen.add(tr); group.push(pickd[j]); } else break; }
          if (group.length >= 3) { items.push({ f, words: group }); i += group.length; continue; }
          f = 'choice';
        }
        if (f === 'choice') {
          const others = shuffle(words.filter((x) => x.key !== w.key && trOf(x) && trOf(x) !== trOf(w))).slice(0, 3);
          if (others.length < 2) f = 'write'; else { items.push({ f, w, opts: shuffle([w, ...others]) }); i++; continue; }
        }
        items.push({ f, w }); i++;
      }
      return { pickd, items };
    }
    let picked = [];
    const record = (w, ok) => st.results.push({ key: w.key, ok, w });
    const goBack = () => { history.pushState(null, '', back); Router.emit(); };
    function exit() {
      if (st.phase !== 'run') return goBack();
      DOM.dialog((close) => h('div', { class: 'stack' }, h('h2', null, V('prac.exitTitle')), h('p', null, V('prac.exitLead')),
        h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn btn--secondary', type: 'button', onclick: close }, V('prac.exitStay')),
          h('a', { class: 'btn btn--primary', href: back, onclick: close }, V('prac.exitLeave')))));
    }
    async function finish() {
      st.phase = 'result'; paint();
      const misses = read(LS.misses, { words: {} });
      for (const r of st.results) {
        if (r.ok) { delete misses.words[r.key]; known.add(r.key); }
        else { const m = misses.words[r.key] || { word: r.w.en, ru: r.w.ru, kk: r.w.kk, misses: 0 }; m.misses++; m.at = Date.now(); misses.words[r.key] = m; }
      }
      write(LS.misses, misses); learnedLS.scopes[scope] = [...known]; write(LS.learned, learnedLS);
      try {
        if (scope.startsWith('ielts-')) await Api.vocabSave(scope, st.results.map((r) => ({ key: r.key, ok: r.ok })));
        else if (mine) { const ok = st.results.filter((r) => r.ok).map((r) => r.w.id).filter(Boolean); if (ok.length) await Api.markVocabLearned(ok); }
      } catch { toast(V('ielts.saveError')); }
    }
    const next = () => { st.answer = null; st.given = ''; st.i++; if (st.i >= st.items.length) finish(); else paint(); };
    function chips(opts, cur, onPick) { return h('div', { class: 'chips', role: 'radiogroup' }, opts.map(([v, l]) => h('button', { type: 'button', class: 'chip', role: 'radio', 'aria-checked': String(cur === v), onclick: () => onPick(v) }, l))); }
    function feedback(ok, right) {
      return h('div', { class: 'notice ' + (ok ? 'ob__ok' : 'notice--danger') + ' stack-sm', role: 'status' }, h('b', null, ok ? V('prac.correct') : V('prac.incorrect')),
        !ok && h('p', { class: 'small' }, V('prac.rightAnswer'), ' ', h('b', null, right)),
        h('div', null, h('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: next }, V('prac.continue'))));
    }
    function itemView(it) {
      if (it.f === 'choice') {
        const w = it.w;
        return [h('p', { class: 'small muted' }, V('prac.askChoice')), h('div', { class: 'row' }, h('h2', { class: 'vq__word', lang: 'en' }, w.en), speakBtn(w.en)),
          h('div', { class: 'opts' }, it.opts.map((o, i) => h('button', { type: 'button', class: 'opt' + (st.answer ? (o.key === w.key ? ' is-ok' : st.answer === o.key ? ' is-bad' : '') : ''), disabled: !!st.answer,
            onclick: () => { st.answer = o.key; record(w, o.key === w.key); paint(); } }, h('i', null, 'ABCD'[i]), h('span', null, trOf(o))))),
          st.answer && feedback(st.answer === w.key, trOf(w))];
      }
      if (it.f === 'match') {
        it.left ||= shuffle(it.words); it.right ||= shuffle(it.words); it.done ||= {}; it.bad ||= 0;
        const all = it.words.every((w) => it.done[w.key]);
        const pickL = (w) => { if (it.done[w.key]) return; it.sel = w.key; paint(); };
        const pickR = (w) => {
          if (!it.sel || it.done[w.key]) return;
          const ok = it.sel === w.key;
          if (ok) it.done[w.key] = true; else { it.miss ||= {}; it.miss[it.sel] = true; it.flash = w.key; setTimeout(() => { it.flash = null; paint(); }, 500); }
          it.sel = null;
          if (it.words.every((x) => it.done[x.key])) it.words.forEach((x) => record(x, !it.miss?.[x.key]));
          paint();
        };
        return [h('p', { class: 'small muted' }, V('prac.askMatch')), h('p', { class: 'xs muted' }, V('prac.matchTip')),
          h('div', { class: 'vmatch' }, h('div', { class: 'stack-sm' }, it.left.map((w) => h('button', { type: 'button', class: 'opt' + (it.done[w.key] ? ' is-ok' : it.sel === w.key ? ' is-on' : ''), disabled: !!it.done[w.key], 'aria-pressed': String(it.sel === w.key), lang: 'en', onclick: () => pickL(w) }, w.en))),
            h('div', { class: 'stack-sm' }, it.right.map((w) => h('button', { type: 'button', class: 'opt' + (it.done[w.key] ? ' is-ok' : it.flash === w.key ? ' is-bad' : ''), disabled: !!it.done[w.key], onclick: () => pickR(w) }, trOf(w))))),
          all && h('div', null, h('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: next }, V('prac.continue')))];
      }
      const dict = it.f === 'dictation', w = it.w, right = dict ? w.en : trOf(w);
      const inp = h('input', { class: 'input', autocomplete: 'off', spellcheck: false, lang: dict ? 'en' : null, placeholder: dict ? V('prac.typeWord') : V('prac.typeTr'), 'aria-label': dict ? V('prac.typeWord') : V('prac.typeTr'), disabled: !!st.answer });
      inp.value = st.given;
      const check = () => { if (st.answer || !inp.value.trim()) return; st.given = inp.value; const ok = matches(inp.value, right); st.answer = ok ? 'ok' : 'bad'; record(w, ok); paint(); };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); check(); } });
      if (!st.answer) setTimeout(() => { inp.focus(); if (dict && !it.played) { it.played = true; speak(w.en); } });
      return [h('p', { class: 'small muted' }, dict ? V('prac.askListen') : V('prac.askWrite')),
        dict ? h('div', { class: 'row' }, h('button', { class: 'btn btn--secondary', type: 'button', onclick: () => speak(w.en) }, icon('volume', 'ic16'), V('speak')), h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => speak(w.en, 0.6) }, V('prac.listenSlow')),
          w.def && h('span', { class: 'xs muted' }, V('prac.meaning', { m: w.def })))
          : h('div', { class: 'row' }, h('h2', { class: 'vq__word', lang: 'en' }, w.en), speakBtn(w.en)),
        h('div', { class: 'row' }, inp, !st.answer && h('button', { class: 'btn btn--primary', type: 'button', onclick: check }, V('prac.continue')),
          !st.answer && h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => { st.answer = 'bad'; st.given = ''; record(w, false); paint(); } }, V('prac.dontKnow'))),
        st.answer && feedback(st.answer === 'ok', right)];
    }
    function paint() {
      let body;
      if (!words.length) body = Hub.empty({ icon: 'vocab', title: t('vocab.lesson.empty'), text: '', action: h('a', { class: 'btn btn--secondary', href: back }, V('back')) });
      else if (st.phase === 'setup') {
        const pl = pool().length;
        body = h('section', { class: 'card stack vprac__setup' }, h('span', { class: 'badge badge--brand', style: { justifySelf: 'start' } }, V('prac.check')),
          h('h2', null, V('prac.introTitle')), h('p', { class: 'small muted' }, V('prac.setupLead')),
          h('div', { class: 'stack-sm' }, h('b', { class: 'small' }, V('prac.pool')), chips([['new', V('prac.poolNew')], ['review', V('prac.poolReview')], ['all', V('prac.poolAll')]], st.pool, (v) => { st.pool = v; paint(); })),
          h('div', { class: 'stack-sm' }, h('b', { class: 'small' }, V('prac.howMany')), chips([[5, '5'], [10, '10'], [20, '20'], ['all', V('prac.countAll') + ' · ' + pl]], st.count, (v) => { st.count = v; paint(); })),
          h('div', { class: 'stack-sm' }, h('b', { class: 'small' }, V('prac.formats')), h('div', { class: 'chips' }, [['choice', V('prac.fmtChoice')], ['match', V('prac.fmtMatch')], ['spell', V('prac.fmtSpell')]].map(([k, l]) =>
            h('button', { type: 'button', class: 'chip', 'aria-pressed': String(st.fmt[k]), onclick: () => { st.fmt[k] = !st.fmt[k]; paint(); } }, st.fmt[k] && icon('check', 'ic12'), ' ', l)))),
          h('label', { class: 'row mcheck__agree' }, h('input', { type: 'checkbox', checked: st.studyFirst, onchange: (e) => { st.studyFirst = e.target.checked; } }), h('span', { class: 'small' }, V('prac.studyFirst'))),
          h('div', null, h('button', { class: 'btn btn--primary btn--lg', type: 'button', onclick: () => { const b = build(); picked = b.pickd; st.items = b.items; st.i = 0; st.results = []; st.phase = st.studyFirst ? 'study' : 'run'; st.si = 0; paint(); } }, V('prac.start'))));
      } else if (st.phase === 'study') {
        const w = picked[st.si];
        body = h('section', { class: 'card stack vprac__study' }, h('span', { class: 'badge', style: { justifySelf: 'start' } }, V('prac.studyBadge', { n: st.si + 1, total: picked.length })),
          h('p', { class: 'small muted' }, V('prac.studyLead')), h('div', { class: 'row' }, h('h2', { class: 'vq__word', lang: 'en' }, w.en), speakBtn(w.en)),
          w.ipa && h('p', { class: 'small muted' }, `/${w.ipa.replace(/^\/|\/$/g, '')}/`), h('p', null, h('b', null, trOf(w))), w.example && h('p', { class: 'small muted', lang: 'en' }, filled(w.example, w.en)),
          h('div', null, h('button', { class: 'btn btn--primary', type: 'button', onclick: () => { if (st.si + 1 < picked.length) st.si++; else st.phase = 'run'; paint(); } }, st.si + 1 < picked.length ? V('prac.studyNext') : V('prac.studyStart'))));
      } else if (st.phase === 'run') {
        const it = st.items[st.i];
        body = h('section', { class: 'card stack vq' }, h('div', { class: 'row row--between' }, h('span', { class: 'small muted' }, V('prac.questionOf', { n: st.i + 1, total: st.items.length }))),
          h('div', { class: 'progress' }, h('i', { style: { width: (st.i / st.items.length) * 100 + '%' } })), itemView(it));
      } else {
        const ok = st.results.filter((r) => r.ok).length, tot = st.results.length || 1, pct = Math.round((ok / tot) * 100);
        const wrong = st.results.filter((r) => !r.ok).slice(0, 3);
        body = h('section', { class: 'card stack' }, h('span', { class: 'eyebrow' }, V('prac.resTitle')), h('h2', null, pct >= 85 ? V('prac.resGreat') : pct >= 50 ? V('prac.resOk') : V('prac.resBad')),
          h('div', { class: 'row' }, h('span', { class: 'badge badge--ok' }, V('prac.correctN', { n: ok })), h('span', { class: 'badge badge--danger' }, V('prac.wrongN', { n: st.results.length - ok }))),
          wrong.length > 0 && h('div', { class: 'stack-sm' }, h('b', { class: 'small' }, V('prac.review')), wrong.map((r) => h('p', { class: 'small' }, h('b', { lang: 'en' }, r.w.en), ' — ', trOf(r.w)))),
          h('div', { class: 'row' }, h('a', { class: 'btn btn--secondary', href: back }, V('prac.backDict')), h('button', { class: 'btn btn--primary', type: 'button', onclick: () => { st.phase = 'setup'; paint(); } }, V('prac.again'))));
      }
      put(root, h('div', { class: 'stack vocab vprac' }, h('div', { class: 'row row--between' }, h('b', { lang: 'en' }, title),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: exit }, icon('close', 'ic16'), V('prac.exit'))), body));
    }
    paint();
  }

  // ---------- mine ----------
  async function mineView(root) {
    let words = [], err = false;
    async function load() { try { words = ((await Api.savedVocab())?.words || []).slice().reverse(); err = false; } catch { err = true; } }
    function addDialog() {
      DOM.dialog((close) => {
        const w = h('input', { class: 'input', id: 'v-add-w', lang: 'en', autocomplete: 'off' }), tr = h('input', { class: 'input', id: 'v-add-t', autocomplete: 'off' });
        const save = h('button', { class: 'btn btn--primary', type: 'button', disabled: true, onclick: async () => {
          save.disabled = true;
          try { await Api.addVocab({ word: w.value.trim(), source: 'manual', [I18n.lang === 'kk' ? 'translationKz' : 'translationRu']: tr.value.trim() }); close(); toast(V('addOk')); await load(); paint(); }
          catch { save.disabled = false; toast(V('addFail')); }
        } }, V('save'));
        const upd = () => { save.disabled = !(w.value.trim() && tr.value.trim()); };
        w.addEventListener('input', upd); tr.addEventListener('input', upd);
        setTimeout(() => w.focus());
        return h('div', { class: 'stack' }, h('h2', null, V('add')), h('div', { class: 'field' }, h('label', { for: 'v-add-w' }, V('addWord')), w), h('div', { class: 'field' }, h('label', { for: 'v-add-t' }, V('addTr')), tr),
          h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn btn--secondary', type: 'button', onclick: close }, t('ieltsReading.cancel')), save));
      });
    }
    function sheet(x) {
      DOM.dialog((close) => h('div', { class: 'stack' }, h('div', { class: 'row' }, h('h2', { class: 'grow', lang: 'en' }, x.word), speakBtn(x.word)),
        x.ipa && h('p', { class: 'small muted' }, `/${String(x.ipa).replace(/^\/|\/$/g, '')}/`),
        h('div', null, h('span', { class: 'xs muted' }, V('translation')), h('p', null, (I18n.lang === 'kk' ? x.translationKz || x.translationRu : x.translationRu || x.translationKz) || '—')),
        x.example && h('div', null, h('span', { class: 'xs muted' }, V('example')), h('p', { lang: 'en' }, x.example), h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => speak(x.example) }, icon('volume', 'ic16'), V('listenExample'))),
        h('div', { class: 'row', style: { justifyContent: 'space-between' } },
          h('button', { class: 'btn btn--danger btn--sm', type: 'button', onclick: async () => { try { await Api.deleteVocab(x.id); close(); await load(); paint(); } catch { toast(V('delFail')); } } }, t('common.delete')),
          h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: close }, t('common.close')))));
    }
    function paint() {
      put(root, h('div', { class: 'stack vocab' }, h('a', { class: 'link small', href: href({}) }, icon('arrowL', 'ic16'), ' ', V('back')),
        Hub.pageHead({ title: V('home.mine'), sub: V('mineLead') }),
        h('div', { class: 'row', style: { flexWrap: 'wrap' } }, words.length > 0 && h('a', { class: 'btn btn--primary', href: href({ ieltsView: 'practice', ieltsTest: 'mine' }) }, V('startPractice')),
          h('button', { class: 'btn btn--secondary', type: 'button', onclick: addDialog }, icon('plus', 'ic16'), V('add'))),
        err ? h('p', { class: 'notice notice--danger' }, V('home.mineError')) : !words.length ? h('p', { class: 'small muted' }, t('vocab.lesson.empty'))
          : h('div', { class: 'vmine' }, words.map((x) => h('div', { class: 'vmine__w', role: 'button', tabindex: '0', onclick: () => sheet(x), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sheet(x); } } },
            h('div', { class: 'row' }, h('b', { class: 'grow', lang: 'en' }, x.word), speakBtn(x.word)),
            h('span', { class: 'small' }, (I18n.lang === 'kk' ? x.translationKz || x.translationRu : x.translationRu || x.translationKz) || ''),
            h('span', { class: 'badge' + (x.learned ? ' badge--ok' : '') }, x.learned ? V('learnedBadge') : x.source && x.source !== 'manual' ? x.source : V('home.mine')))))));
    }
    await load(); paint();
  }

  Screens['tab:vocab'] = {
    title: () => t('app.nav.vocab'),
    async render(p) {
      const root = h('div');
      App.onLeave(() => { try { speechSynthesis.cancel(); } catch {} });
      if (p.ieltsView === 'ielts-list') return list(p);
      if (p.ieltsView === 'ielts-set' && p.ieltsTest) return setView(p);
      if (p.ieltsView === 'practice' && p.ieltsTest) { await practice(p, root); return root; }
      if (p.ieltsView === 'mine') { await mineView(root); return root; }
      return home();
    },
  };
})();
