// IELTS onboarding (V5), diagnostic (Z4), diagnostic result (Jl) and route choice (Jd).
// Profile and diagnostic live on prod-server; writing/speaking of the diagnostic are graded by
// ai-tutor's /api/ielts/diagnostic/assess (proxied). Mascot artwork is replaced by line icons.
(function () {
  const { h, icon } = DOM;
  const put = (el, ...k) => el.replaceChildren(...k.flat(9).filter((x) => x != null && x !== false && x !== ''));
  const loc = (o) => RL.loc(o);
  const D = (k, v) => t('ieltsOb.p.diag.' + k, v);
  const DP = (k, n, v) => I18n.tp('ieltsOb.p.diag.' + k, n, v);
  const today = () => Router.go({ screen: 'ielts', ieltsTab: 'today' });
  const trackName = I18n.trackName;
  const fmtLong = (iso) => DOM.dateFull(iso).replace(/\s*г\.$/, '');

  // ---------- constants ----------
  const VP = [{ id: 'study', recommend: 'academic', ic: 'cap' }, { id: 'immigration', recommend: 'general', ic: 'globe' }, { id: 'work', recommend: 'general', ic: 'target' }, { id: 'school', recommend: 'academic', ic: 'reading' }];
  const VB = [5.5, 6, 6.5, 7, 7.5, 8];
  const VW = ['1-2m', '3-6m', 'unknown'];
  const Vq = [30, 60, 90, 120];
  const VH = [{ id: 'new', level: 'light', next: 'guide', ic: 'bulb' }, { id: 'some', level: 'standard', next: 'quiz', ic: 'about' }, { id: 'exp', level: 'full', next: 'diagnostic', ic: 'shield' }];
  const VU = ['purpose', 'track', 'target', 'date', 'daily', 'familiarity'];
  const VK = [2, 3, 1, 4, 2, 3];
  function VV(gap, daily, speedup = 1) {
    const hours = 160 * Math.max(0.5, gap);
    const weeks = hours / ((6 * (daily || 60)) / 60) / speedup;
    const months = weeks / 4.345;
    return { long: gap > 2 || months > 18, weeks: Math.max(1, Math.round(weeks)), months: Math.max(1, Math.round(2 * months) / 2) };
  }
  const daysTo = (iso) => (iso ? DOM.daysBetween(new Date(), iso) : null);
  function VG(term, date) { if (!date || term.long) return date ? false : null; return daysTo(date) >= 7 * term.weeks; }
  const VY = (target, now) => (target == null || now == null ? null : Math.max(0, Math.round((target - now) * 10) / 10));
  const numFmt = (n) => (I18n.lang === 'en' ? String(n) : String(n).replace('.', ','));
  function termText(term) {
    if (term.long) return t('ieltsOb.termLong');
    return Number.isInteger(term.months) ? I18n.tp('ieltsOb.termToGoal', term.months) : t('ieltsOb.termToGoal.few', { n: numFmt(term.months) });
  }
  const dailyText = (min) => { const hh = Math.floor(min / 60), mm = min % 60; return [hh && t('ieltsHub.hours', { n: hh }), mm && t('ieltsHub.minutes', { n: mm })].filter(Boolean).join(' ') || t('ieltsHub.minutes', { n: min }); };

  // ---------- shared frame ----------
  function frame({ onBack, main, exitLabel = t('ieltsOb.exit'), onExit = today }) {
    return h('div', { class: 'ob' },
      h('header', { class: 'ob__top' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('ieltsReading.back'), onclick: onBack }, icon('arrowL')),
        h('span', { class: 'brand__mark runbar__mark', 'aria-hidden': 'true' }, DOM.svg(DOM.BRAND)),
        h('span', { class: 'badge badge--brand' }, 'IELTS'), h('span', { class: 'grow' }),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: onExit }, exitLabel, icon('close', 'ic16'))),
      h('main', { class: 'ob__main' }, main));
  }
  const bars = (n, on) => h('div', { class: 'ob__bars', 'aria-hidden': 'true' }, Array.from({ length: n }, (_, i) => h('i', { class: on(i) ? 'is-on' : null })));
  function option({ on, title, hint, ic, onclick, extra, cls = '' }) {
    return h('button', { type: 'button', role: 'radio', 'aria-checked': String(!!on), class: 'obopt ' + cls + (on ? ' is-on' : ''), onclick },
      ic && h('span', { class: 'obopt__ic' }, icon(ic)), h('span', { class: 'obopt__body' }, h('b', null, title), hint && h('span', { class: 'small muted' }, hint), extra),
      h('span', { class: 'obopt__radio', 'aria-hidden': 'true' }));
  }

  // ---------- month calendar (V0) ----------
  function calendar(value, onPick) {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    let view = value ? DOM.parseDate(value) : new Date(now);
    view = new Date(view.getFullYear(), view.getMonth(), 1);
    const box = h('div', { class: 'obcal' });
    function paint() {
      const y = view.getFullYear(), m = view.getMonth();
      const first = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
      const loc2 = DOM.locale();
      const wd = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(loc2, { weekday: 'short' }));
      put(box,
        h('div', { class: 'obcal__head' },
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('ieltsPlanV.prevMonth'), onclick: () => { view = new Date(y, m - 1, 1); paint(); } }, icon('arrowL', 'ic16')),
          h('b', null, new Intl.DateTimeFormat(loc2, { month: 'long', year: 'numeric' }).formatToParts(view).filter((x) => x.type === 'month' || x.type === 'year').map((x) => x.value).join(' ')),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('ieltsPlanV.nextMonth'), onclick: () => { view = new Date(y, m + 1, 1); paint(); } }, icon('arrowR', 'ic16'))),
        h('div', { class: 'obcal__grid' }, wd.map((w) => h('span', { class: 'xs muted' }, w)),
          Array.from({ length: first }, () => h('span')),
          Array.from({ length: days }, (_, i) => {
            const d = new Date(y, m, i + 1), iso = DOM.isoDay(d);
            return h('button', { type: 'button', class: 'obcal__d' + (iso === value ? ' is-on' : ''), disabled: d < now, 'aria-pressed': String(iso === value), onclick: () => onPick(iso) }, i + 1);
          })));
    }
    paint();
    return box;
  }

  // ---------- onboarding ----------
  Screens['ielts-onboarding'] = {
    fullscreen: true,
    title: () => 'IELTS',
    async render(p) {
      const ans = { target: null, daily: 60, window: null, targetUnknown: false, purpose: null, track: null, examDate: null, familiarity: null };
      try {
        const pr = await Api.profile();
        if (pr?.onboarded) Object.assign(ans, { purpose: pr.purpose, track: pr.track, target: pr.targetBand ?? null, examDate: pr.examDate || null, window: pr.examDate ? 'date' : pr.examWindow || null, daily: pr.dailyMinutes || 60, familiarity: pr.familiarity || null });
      } catch {}
      const st = { step: Math.max(0, VU.indexOf(p.step)), mode: 'steps', page: 1, quiz: {}, qi: 0, saving: false, error: '' };
      const root = h('div');
      const valid = () => [ans.purpose, ans.track, ans.target != null, ans.window === 'date' ? ans.examDate : ans.window, ans.daily, ans.familiarity][st.step];
      function back() {
        if (st.mode === 'guide' && st.page > 1) st.page--;
        else if (st.mode === 'quiz' && st.qi > 0) st.qi--;
        else if (st.mode === 'quizResult') st.mode = 'quiz';
        else if (st.mode !== 'steps') st.mode = 'steps';
        else if (st.step > 0) st.step--;
        else return today();
        paint();
      }
      async function save() {
        st.saving = true; st.error = ''; paint();
        try {
          await Api.saveProfile({ purpose: ans.purpose || null, track: ans.track || 'academic', targetBand: ans.target ?? 6.5, examDate: ans.window === 'date' ? ans.examDate : null,
            examWindow: ans.window || 'unknown', dailyMinutes: ans.daily || 60, familiarity: ans.familiarity || null });
          State.me = null;
          const next = VH.find((x) => x.id === ans.familiarity)?.next;
          st.saving = false;
          if (next === 'guide') { st.mode = 'guide'; st.page = 1; } else if (next === 'quiz') { st.mode = 'quiz'; st.qi = 0; st.quiz = {}; } else return Router.go({ screen: 'ielts-diagnostic' });
        } catch (e) { st.saving = false; st.error = e?.serverMessage || e?.message || t('ieltsReading.errorText'); }
        paint();
      }
      const toDiag = () => Router.go({ screen: 'ielts-diagnostic' });

      function stepBody() {
        const s = VU[st.step];
        const pick = (patch) => { Object.assign(ans, patch); paint(); };
        if (s === 'purpose') return h('div', { class: 'obcards', role: 'radiogroup' }, VP.map((x) => option({ on: ans.purpose === x.id, ic: x.ic, title: t('ieltsOb.purpose.' + x.id), hint: t('ieltsOb.purposeHint.' + x.id), cls: 'obopt--card', onclick: () => pick({ purpose: x.id, track: ans.track || x.recommend }) })));
        if (s === 'track') {
          const rec = VP.find((x) => x.id === ans.purpose)?.recommend;
          return [h('div', { class: 'obcards obcards--2', role: 'radiogroup' }, ['academic', 'general'].map((tr) => option({ on: ans.track === tr, ic: tr === 'academic' ? 'cap' : 'globe', cls: 'obopt--card', title: t('ieltsOb.p.ob.goal.' + tr), hint: t(`ieltsOb.p.ob.goal.${tr}Hint`),
            extra: [rec === tr && h('span', { class: 'badge badge--brand' }, t('ieltsOb.p.ob.goal.recommend')), h('span', { class: 'xs muted' }, t('ieltsOb.trackMore.' + tr))], onclick: () => pick({ track: tr }) }))),
          h('p', { class: 'small muted' }, t('ieltsOb.p.ob.goal.canChange'))];
        }
        if (s === 'target') {
          return [h('div', { class: 'obgrid', role: 'radiogroup' }, VB.map((b) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(ans.target === b && !ans.targetUnknown), class: 'obband' + (ans.target === b && !ans.targetUnknown ? ' is-on' : ''), onclick: () => pick({ target: b, targetUnknown: false }) },
            h('b', null, b === 8 ? '8.0+' : b.toFixed(1)), h('span', { class: 'xs' }, t('ieltsOb.targetHint.' + String(b).replace('.', '_')))))),
          option({ on: ans.targetUnknown, ic: 'about', title: t('ieltsOb.targetUnknownTitle'), hint: t('ieltsOb.targetUnknownHint'), onclick: () => pick({ target: 6.5, targetUnknown: true }) })];
        }
        if (s === 'date') {
          const d = ans.window === 'date' && ans.examDate ? daysTo(ans.examDate) : null;
          return h('div', { class: 'stack-sm', role: 'radiogroup' },
            option({ on: ans.window === 'date', ic: 'calendar', title: t('ieltsOb.dateKnown'), hint: d != null ? `${fmtLong(ans.examDate)} · ${I18n.tp('ieltsOb.daysLeftN', d)}` : null, onclick: () => pick({ window: 'date' }) }),
            ans.window === 'date' && calendar(ans.examDate, (iso) => pick({ examDate: iso })),
            VW.map((w) => option({ on: ans.window === w, ic: w === 'unknown' ? 'about' : 'clock', title: t('ieltsOb.window.' + w), hint: t('ieltsOb.windowHint.' + w), onclick: () => pick({ window: w, examDate: null }) })));
        }
        if (s === 'daily') {
          const gap = Math.min(1.5, Math.max(0.5, (ans.target ?? 6.5) - 5.5));
          const term = VV(gap, ans.daily), fits = ans.examDate ? VG(term, ans.examDate) : null;
          return [h('div', { class: 'obdaily', role: 'radiogroup' }, Vq.map((n) => {
            const tm = VV(gap, n);
            return h('button', { type: 'button', role: 'radio', 'aria-checked': String(ans.daily === n), class: 'obband obband--daily' + (ans.daily === n ? ' is-on' : ''), onclick: () => pick({ daily: n }) },
              icon('clock', 'ic16'), h('b', null, t('ieltsOb.p.ob.goal.d' + n)), h('span', { class: 'xs' }, t('ieltsOb.pace.' + n)), n === 60 && h('span', { class: 'badge badge--brand' }, t('ieltsOb.recommended')), h('span', { class: 'xs muted' }, termText(tm)));
          })),
          fits != null && h('p', { class: 'notice ' + (fits ? 'ob__ok' : 'ob__warn') }, t(fits ? 'ieltsOb.fits' : 'ieltsOb.notFits', { date: fmtLong(ans.examDate) })),
          h('p', { class: 'small muted' }, t('ieltsOb.estimateNote'))];
        }
        return [h('div', { class: 'stack-sm', role: 'radiogroup' }, VH.map((x) => option({ on: ans.familiarity === x.id, ic: x.ic, title: t('ieltsOb.p.ob.familiar.' + x.id), hint: t(`ieltsOb.p.ob.familiar.${x.id}Hint`), onclick: () => pick({ familiarity: x.id }) }))),
          h('div', { class: 'ob__summary' }, h('span', { class: 'small muted' }, t('ieltsOb.yourAnswers')),
            h('div', { class: 'chips' }, [ans.purpose && t('ieltsOb.purpose.' + ans.purpose), ans.track && trackName(ans.track), ans.target != null && t('ieltsOb.goalChip', { n: ans.target.toFixed(1) }),
              ans.window === 'date' && ans.examDate ? fmtLong(ans.examDate) : t('ieltsOb.window.' + (ans.window || 'unknown')), t('ieltsOb.p.ob.goal.d' + ans.daily)].filter(Boolean).map((c) => h('span', { class: 'badge' }, c))))];
      }
      function main() {
        if (st.mode === 'guide') {
          const n = st.page;
          const paras = [1, 2, 3, 4, 5].map((i) => t(`ieltsOb.p.guide.s${n}.p${i}`)).filter(Boolean);
          return [bars(9, (i) => i < n), h('p', { class: 'small muted' }, `${t('ieltsOb.p.guide.title')} · ${n} / 9`),
            h('h1', { class: 'ob__title' }, t(`ieltsOb.p.guide.s${n}.title`)), h('p', { class: 'muted' }, t('ieltsOb.p.guide.sub')),
            h('section', { class: 'card stack-sm' }, paras.map((x) => h('p', null, x))),
            h('button', { class: 'btn btn--primary btn--lg', type: 'button', onclick: () => { if (n < 9) { st.page++; paint(); } else toDiag(); } }, n < 9 ? t('ieltsSpeaking.next') : t('ieltsOb.p.ob.done.toDiagnostic'))];
        }
        if (st.mode === 'quiz') {
          const q = st.qi + 1, a = st.quiz[st.qi];
          return [bars(6, (i) => i <= st.qi), h('p', { class: 'small muted' }, `${t('ieltsOb.p.quiz.titleA')} · ${t('ieltsOb.p.quiz.progress', { n: q, total: 6 })}`),
            h('h1', { class: 'ob__title' }, t(`ieltsOb.p.quiz.a${q}.q`)), h('p', { class: 'muted' }, t('ieltsOb.p.quiz.subA')),
            h('div', { class: 'stack-sm', role: 'radiogroup' }, [1, 2, 3, 4].map((o) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(a === o), class: 'opt' + (a === o ? ' is-on' : ''), onclick: () => { st.quiz[st.qi] = o; paint(); } },
              h('i', null, 'ABCD'[o - 1]), h('span', null, t(`ieltsOb.p.quiz.a${q}.o${o}`))))),
            h('button', { class: 'btn btn--primary btn--lg', type: 'button', disabled: !a, onclick: () => { if (st.qi < 5) st.qi++; else st.mode = 'quizResult'; paint(); } }, st.qi < 5 ? t('ieltsOb.continue') : t('ieltsOb.checkQuiz'))];
        }
        if (st.mode === 'quizResult') {
          const score = VK.filter((v, i) => st.quiz[i] === v).length, pass = score >= 4;
          return [h('h1', { class: 'ob__title' }, t('ieltsOb.p.quiz.resultTitle')), h('p', { class: 'muted' }, t(pass ? 'ieltsOb.p.quiz.passA' : 'ieltsOb.p.quiz.failA')),
            h('section', { class: 'card row' }, h('b', { class: 'grow' }, t('ieltsOb.p.quiz.score', { n: score, total: 6 })),
              h('span', { class: 'ob__dots' }, VK.map((v, i) => h('i', { class: st.quiz[i] === v ? 'is-ok' : 'is-bad' })))),
            VK.map((v, i) => st.quiz[i] !== v && h('section', { class: 'card stack-sm' }, h('b', null, `${i + 1}. ${t(`ieltsOb.p.quiz.a${i + 1}.q`)}`),
              h('p', { class: 'small' }, h('span', { class: 'muted' }, t('ieltsOb.p.quiz.yours') + ': '), t(`ieltsOb.p.quiz.a${i + 1}.o${st.quiz[i]}`)),
              h('p', { class: 'small' }, h('span', { class: 'muted' }, t('ieltsOb.p.quiz.right') + ': '), h('b', null, t(`ieltsOb.p.quiz.a${i + 1}.o${v}`))),
              h('p', { class: 'small muted' }, t(`ieltsOb.p.quiz.a${i + 1}.ex`)))),
            pass ? h('button', { class: 'btn btn--primary btn--lg', type: 'button', onclick: toDiag }, t('ieltsOb.p.ob.done.toDiagnostic'))
              : h('div', { class: 'row' }, h('button', { class: 'btn btn--primary btn--lg', type: 'button', onclick: () => { st.mode = 'guide'; st.page = 1; paint(); } }, t('ieltsOb.p.quiz.toGuide')),
                h('button', { class: 'link', type: 'button', onclick: toDiag }, t('ieltsOb.p.ob.done.toDiagnostic')))];
        }
        const last = st.step === VU.length - 1;
        const cta = last && ans.familiarity ? t('ieltsOb.cta.' + ans.familiarity) : t('ieltsOb.continue');
        return [bars(6, (i) => i <= st.step), h('p', { class: 'small muted' }, t('ieltsOb.p.ob.step', { n: st.step + 1, total: 6 })),
          h('h1', { class: 'ob__title' }, t('ieltsOb.title.' + VU[st.step])), h('p', { class: 'muted' }, t('ieltsOb.sub.' + VU[st.step])),
          stepBody(),
          st.error && h('p', { class: 'notice notice--danger', role: 'alert' }, st.error),
          h('button', { class: 'btn btn--primary btn--lg', type: 'button', disabled: !valid() || st.saving, onclick: () => { if (last) save(); else { st.step++; paint(); } } }, cta, icon('arrowR', 'ic16'))];
      }
      function paint() { put(root, frame({ onBack: back, main: main() })); window.scrollTo(0, 0); }
      paint();
      return root;
    },
  };

  // ---------- diagnostic ----------
  const DRAFT = 'jts_ielts_diag_draft';
  const Z0 = ['listening', 'reading', 'writing', 'speaking'];
  const Z1 = ['light', 'standard', 'full'];
  const wavs = {}; // diag recordings kept in memory for AI grading (also IndexedDB diag:<id>)
  function counts(form, level, module) {
    const L = form.levels?.[level] || {};
    const slots = L.listening?.slots || [];
    const listening = slots.reduce((s, sl) => { const clip = form.listening?.slots?.find((x) => x.slot === sl)?.clips?.[0]; return s + (L.listening?.take?.[sl] ?? clip?.items?.length ?? 0); }, 0);
    const R = form.reading?.[module === 'general' ? 'general' : 'academic'] || {};
    const reading = L.reading?.light ? (R.lightItems || []).length : (R.items || []).length;
    const minutes = L.minutes ?? Z0.reduce((s, b) => s + (L[b]?.minutes || 0), 0);
    return { listening, reading, words: L.writing?.words, part1: L.speaking?.part1, mono: L.speaking?.monologueSec, minutes };
  }
  function question(n, item, value, onChange, headings) {
    const lbl = `${D('input.answerLabel')} ${n}`;
    let ctrl;
    // choices update in place (no repaint) so a running clip/countdown is never restarted
    const pick = (btn, v, attr) => { for (const b of btn.parentNode.children) { const on = b === btn; b.classList.toggle('is-on', on); b.setAttribute(attr, String(on)); } onChange(v, true); };
    if (item.type === 'tfng' || item.type === 'ynng') {
      ctrl = h('div', { class: 'pills', role: 'radiogroup', 'aria-label': lbl }, (item.type === 'tfng' ? ['TRUE', 'FALSE', 'NOT GIVEN'] : ['YES', 'NO', 'NOT GIVEN']).map((o) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(value === o), class: 'pill' + (value === o ? ' is-on' : ''), onclick: (e) => pick(e.currentTarget, o, 'aria-checked') }, o)));
    } else if (item.type === 'matching_headings') {
      ctrl = h('select', { class: 'input qselect', 'aria-label': lbl, onchange: (e) => onChange(e.target.value, true) }, h('option', { value: '' }, D('input.choose') || t('ieltsReading.choose')), (headings || []).map((o) => h('option', { value: o.key, selected: value === o.key }, `${o.key} · ${o.text}`)));
    } else if (item.options?.length) {
      ctrl = h('div', { class: 'opts' }, item.options.map((o) => h('button', { type: 'button', class: 'opt' + (value === o.key ? ' is-on' : ''), 'aria-pressed': String(value === o.key), onclick: (e) => pick(e.currentTarget, o.key, 'aria-pressed') }, h('i', null, o.key), h('span', null, o.text))));
    } else {
      const inp = h('input', { class: 'gap', type: 'text', value: value || '', inputmode: item.inputmode === 'numeric' ? 'numeric' : null, autocomplete: 'off', spellcheck: false, 'aria-label': lbl, oninput: (e) => onChange(e.target.value, true) });
      return h('div', { class: 'q' }, h('div', { class: 'q__row' }, h('span', { class: 'qnum' }, n), h('div', { class: 'grow qprompt', lang: 'en' }, RL.gapPrompt(item.prompt, inp))));
    }
    return h('div', { class: 'q' }, h('div', { class: 'q__row' }, h('span', { class: 'qnum' }, n), h('div', { class: 'grow qprompt', lang: 'en' }, item.prompt || '')), ctrl);
  }

  Screens['ielts-diagnostic'] = {
    fullscreen: true,
    title: () => t('ieltsOb.p.diag.title'),
    async render(p) {
      const root = h('div');
      let start, recommended = null, error = null;
      async function load(level) {
        try { start = await Api.diagnostic({ level, module: p.module || undefined }); recommended ??= start.level; error = null; }
        catch (e) { error = e; }
      }
      await load(p.level);
      if (error) {
        const guest = error.status === 401;
        return frame({ onBack: today, main: Hub.empty({ icon: guest ? 'lock' : 'about', title: t(guest ? 'ieltsReading.guestTitle' : 'ieltsReading.errorTitle'), text: t(guest ? 'ieltsReading.guestText' : 'ieltsReading.errorText'),
          action: h('button', { class: 'btn btn--secondary', type: 'button', onclick: today }, t('ieltsReading.back')) }) });
      }
      let S;
      function fresh() { return { formId: start.formId, level: start.level, module: start.module, block: null, slotIdx: 0, path: {}, answers: {}, writing: '', speakingSec: {}, played: {}, highlights: [], startedAt: new Date().toISOString() }; }
      function restore() { try { const d = JSON.parse(localStorage.getItem(DRAFT) || 'null'); S = d && d.formId === start.formId && d.level === start.level && d.module === start.module ? d : fresh(); } catch { S = fresh(); } }
      restore();
      const save = () => { try { localStorage.setItem(DRAFT, JSON.stringify(S)); } catch {} };
      const takes = {};
      let rec = null, busy = false, err = '', player = null;
      const stopAll = () => { rec?.release(); rec = null; player?.stop(); Speaking.stopTts(); };
      App.onLeave(stopAll);
      const form = () => start.form;
      const L = () => form().levels?.[S.level] || {};
      const blockIdx = () => Z0.indexOf(String(S.block || '').replace('-intro', ''));

      async function fetchPath() {
        const r = await Api.diagnosticPath({ formId: S.formId, level: S.level, answers: S.answers });
        S.path = r?.path || r || {}; save();
      }
      async function startBlock(b) {
        err = '';
        if (b === 'listening') {
          try { speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch {}
          try { await fetchPath(); } catch { err = t('ieltsReading.errorText'); return paint(); }
          S.slotIdx = 0;
        }
        S.block = b; save(); paint();
      }
      function finishBlock() {
        player?.stop(); Speaking.stopTts();
        const i = blockIdx();
        if (i < 3) { S.block = Z0[i + 1] + '-intro'; save(); paint(); window.scrollTo(0, 0); return; }
        DOM.dialog((close) => {
          const ok = h('button', { class: 'btn btn--primary', type: 'button', onclick: async () => { ok.disabled = true; await submit(); close(); } }, D('block.finish'));
          const cancel = h('button', { class: 'btn btn--secondary', type: 'button', onclick: close }, t('ieltsReading.cancel'));
          setTimeout(() => cancel.focus());
          return h('div', { class: 'stack' }, h('h2', null, D('block.finishTitle')), h('p', null, D('block.finishTextAll')), h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, cancel, ok));
        });
      }
      async function submit() {
        busy = true; err = ''; paint();
        try {
          const res = await Api.submitDiagnostic({ formId: S.formId, level: S.level, module: S.module, answers: S.answers, writingText: S.writing, speakingSec: S.speakingSec,
            timeSec: Math.round((Date.now() - Date.parse(S.startedAt)) / 1000), startedAt: S.startedAt, device: innerWidth < 760 ? 'mobile' : 'desktop' });
          const id = res?.attempt?.id;
          try { localStorage.removeItem(DRAFT); } catch {}
          const answers = Object.entries(takes).map(([itemId, x]) => ({ itemId, durationSec: x.durationSec, wav: x.wav }));
          if (id && answers.length) { wavs[id] = answers; Speaking.Pending.save('diag:' + id, { testId: 'diag', mode: 'exam', answers, savedAt: Date.now() }); }
          stopAll();
          Router.go({ screen: 'ielts-diagnostic-result', ieltsAttempt: String(id) });
        } catch (e) { busy = false; err = e?.serverMessage || e?.message || t('ieltsReading.submitFailed'); paint(); }
      }
      const setAns = (id, v, silent) => { S.answers[id] = v; save(); if (!silent) paint(); };

      // ---- start screen ----
      function startView() {
        const c = counts(form(), S.level, S.module);
        const inProgress = S.block != null;
        return h('div', { class: 'ob__wide stack' },
          h('span', { class: 'badge badge--brand', style: { justifySelf: 'start' } }, D('intro.stepChip')),
          h('h1', { class: 'ob__title' }, D('intro.title')), h('p', { class: 'muted' }, D('intro.sub')),
          h('section', { class: 'stack-sm' }, h('h2', null, D('level.label')),
            h('div', { class: 'obcards obcards--3', role: 'radiogroup' }, Z1.map((l) => {
              const cc = counts(form(), l, S.module);
              return option({ on: S.level === l, cls: 'obopt--card', title: D('level.' + l), extra: [recommended === l && h('span', { class: 'badge badge--brand' }, D('level.recommended')),
                h('span', { class: 'small' }, DP('approxMin', cc.minutes || 0)), h('span', { class: 'xs muted' }, D('levelCard.' + l, { l: cc.listening, r: cc.reading, w: cc.words, s: cc.part1, m: cc.mono }))],
              onclick: async () => { if (l === S.level) return; await load(l); restore(); S.level = start.level; paint(); } });
            }))),
          h('section', { class: 'card stack-sm' }, h('h2', null, D('intro.what')), h('p', { class: 'small muted' }, `${D('intro.form', { code: start.code || start.formId })} · ${trackName(S.module)}`),
            Z0.map((b) => h('div', { class: 'row dgrow' }, Hub.plate(b, 40), h('div', { class: 'grow' }, h('b', null, D('block.' + b)), h('p', { class: 'xs muted' }, D('what.' + b, { track: trackName(S.module) }))),
              h('span', { class: 'badge' }, b === 'listening' || b === 'reading' ? `${DP('chip.questions', c[b])} · ${D('chip.min', { n: L()[b]?.minutes || 0 })}`
                : b === 'writing' ? `${D('chip.words', { n: c.words })} · ${D('chip.min', { n: L().writing?.minutes || 0 })}` : `${D('chip.speaking', { q: DP('chip.questions', c.part1 || 0) })} · ${D('chip.min', { n: L().speaking?.minutes || 0 })}`)))),
          inProgress && h('p', { class: 'notice' }, D('intro.inProgress', { level: D('level.' + S.level), code: start.code || start.formId })),
          h('p', { class: 'small muted' }, D('intro.honest')),
          h('div', { class: 'row' }, h('button', { class: 'btn btn--primary btn--lg', type: 'button', onclick: () => { if (!inProgress) { S.block = 'listening-intro'; save(); } runMode = true; paint(); } }, inProgress ? D('intro.continue') : D('intro.start'), icon('arrowR', 'ic16')),
            inProgress && h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => { S = fresh(); save(); paint(); } }, D('intro.restart'))));
      }
      // ---- listening clip player (preview countdown → autoplay; exam = once) ----
      function clipPlayer(clip, exam, nQ) {
        const box = h('div', { class: 'dplayer' });
        const played = !!S.played[clip.id];
        let left = Math.min(30, Math.max(10, 5 * nQ)), iv = null, playing = false, blocked = false, audio = null;
        const stop = () => { clearInterval(iv); audio?.pause(); Speaking.stopTts(); playing = false; };
        player = { stop };
        const done = () => { playing = false; if (exam) { S.played[clip.id] = true; save(); } draw(); };
        function play() {
          clearInterval(iv); left = 0; playing = true; blocked = false; draw();
          if (clip.audio?.url) {
            audio = new Audio(clip.audio.url); audio.onended = done;
            audio.play().catch(() => { playing = false; blocked = true; draw(); });
          } else {
            const text = (Array.isArray(clip.transcript) ? clip.transcript.map((l) => l.text || l).join(' ') : String(clip.transcript || '')).replace(/^\s*\w+:\s*/gm, '');
            Speaking.speakTts(text).then(done);
          }
        }
        function draw() {
          const isPlayed = exam && S.played[clip.id];
          put(box, isPlayed ? h('span', { class: 'badge badge--ok' }, icon('check', 'ic12'), ' ', D('block.played'))
            : playing ? h('span', { class: 'row small' }, icon('volume', 'ic16'), '…', !exam && h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => { stop(); draw(); } }, icon('pause', 'ic16')))
              : left > 0 ? [h('span', { class: 'small' }, D('block.readTime', { n: left })), h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: play }, D('block.startNow'))]
                : [blocked && h('span', { class: 'small' }, D('block.autoplayBlocked')), (!exam || !played) && h('button', { class: 'btn btn--primary btn--sm', type: 'button', 'aria-label': 'Play', onclick: play }, icon('play', 'ic16'))],
            exam && !isPlayed && h('p', { class: 'xs muted' }, D('block.playOnce')));
        }
        if (!played) iv = setInterval(() => { left--; if (left <= 0) play(); else draw(); }, 1000);
        draw();
        return box;
      }
      function speakRow(id, label, maxSec) {
        const tk = takes[id], recording = rec?.state === 'recording' && rec.itemId === id;
        const anyRec = rec?.state === 'recording';
        return h('div', { class: 'dsrow' }, h('span', { class: 'qnum' + (tk || S.speakingSec[id] ? ' is-ok' : '') }, tk || S.speakingSec[id] ? '✓' : '•'), h('div', { class: 'grow stack-sm' }, h('p', { lang: 'en' }, label),
          tk ? h('audio', { controls: true, src: tk.url }) : S.speakingSec[id] ? h('span', { class: 'xs muted' }, t('common.sec', { n: S.speakingSec[id] })) : null),
          h('button', { class: 'btn btn--sm ' + (recording ? 'btn--danger' : 'btn--secondary'), type: 'button', disabled: anyRec && !recording, onclick: () => {
            if (recording) return rec.stop();
            rec = rec || Speaking.makeRecorder((tick) => { if (!tick) paint(); else root.querySelector('.dsrow__clock')?.replaceChildren(`${DOM.mmss(rec.elapsed)} / ${DOM.mmss(maxSec)}`); });
            rec.itemId = id;
            rec.start({ maxSec, onDone: (take) => { if (take) { takes[id] = take; S.speakingSec[id] = take.durationSec; save(); } paint(); } });
          } }, icon(recording ? 'stop' : 'mic', 'ic16'), recording ? [t('ieltsSpeaking.stop'), ' · ', h('span', { class: 'dsrow__clock' }, `${DOM.mmss(rec.elapsed)} / ${DOM.mmss(maxSec)}`)] : tk || S.speakingSec[id] ? t('ieltsSpeaking.retake') : t('ieltsSpeaking.answer')));
      }
      function blockView() {
        const b = S.block;
        if (b.endsWith('-intro')) {
          const name = b.replace('-intro', '');
          return h('section', { class: 'card stack ob__narrow' }, h('span', { class: 'badge', style: { justifySelf: 'start' } }, D('block.stepOf', { n: Z0.indexOf(name) + 1, total: 4 })),
            h('h2', null, D('block.' + name)), h('p', null, D('block.intro.' + name)), err && h('p', { class: 'notice notice--danger' }, err),
            h('div', null, h('button', { class: 'btn btn--primary btn--lg', type: 'button', onclick: () => startBlock(name) }, D('block.start'))));
        }
        const finishBtn = (dis) => h('button', { class: 'btn btn--primary btn--lg', type: 'button', disabled: dis || busy, onclick: finishBlock }, D('block.finish'));
        if (b === 'listening') {
          const lv = L().listening || {}, slots = lv.slots || [];
          const slot = slots[S.slotIdx];
          const sl = form().listening?.slots?.find((x) => x.slot === slot) || { clips: [] };
          const clip = sl.clips.find((c) => c.id === S.path[slot]) || sl.clips[0];
          if (!clip) return finishBtn();
          const n = lv.take?.[slot] ?? clip.items.length;
          let num = 1;
          for (let i = 0; i < S.slotIdx; i++) { const s2 = form().listening.slots.find((x) => x.slot === slots[i]); const c2 = s2?.clips.find((c) => c.id === S.path[slots[i]]) || s2?.clips[0]; num += lv.take?.[slots[i]] ?? c2?.items.length ?? 0; }
          player?.stop();
          return h('div', { class: 'stack ob__narrow' }, h('span', { class: 'badge', style: { justifySelf: 'start' } }, D('block.clip', { n: S.slotIdx + 1, total: slots.length })),
            clip.context && h('p', { class: 'muted', lang: 'en' }, clip.context), clipPlayer(clip, lv.mode === 'exam', n),
            clip.instruction && h('p', { class: 'small', lang: 'en' }, h('b', null, clip.instruction)),
            h('section', { class: 'card stack' }, clip.items.slice(0, n).map((it, i) => question(num + i, it, S.answers[it.id], (v, silent) => setAns(it.id, v, silent)))),
            err && h('p', { class: 'notice notice--danger' }, err),
            S.slotIdx + 1 < slots.length ? h('button', { class: 'btn btn--primary btn--lg', type: 'button', onclick: async () => { player?.stop(); try { await fetchPath(); S.slotIdx++; save(); paint(); window.scrollTo(0, 0); } catch { err = t('ieltsReading.errorText'); paint(); } } }, D('block.nextClip'))
              : finishBtn());
        }
        if (b === 'reading') {
          const R = form().reading?.[S.module === 'general' ? 'general' : 'academic'] || {};
          const items = L().reading?.light ? (R.items || []).filter((x) => (R.lightItems || []).includes(x.id)) : R.items || [];
          const texts = R.texts || [{ title: R.title, body: R.paragraphs || [] }];
          let lastIns = null;
          return h('div', { class: 'stack' }, h('div', { class: 'dread' },
            h('section', { class: 'card passage', oncopy: (e) => e.preventDefault() }, texts.map((x) => [x.title && h('h2', null, x.label ? `${x.label}. ` : '', x.title),
              (x.body || x.paragraphs || []).map((ln) => /^## /.test(ln) ? h('b', { class: 'passage__plabel' }, ln.slice(3)) : h('p', { lang: 'en' }, ln.text || ln))])),
            h('section', { class: 'card stack' }, items.map((it, i) => {
              const ins = it.instruction && it.instruction !== lastIns ? (lastIns = it.instruction) : null;
              return [ins && h('p', { class: 'qgroup__ins' }, ins), question(i + 1, it, S.answers[it.id], (v, silent) => setAns(it.id, v, silent), R.headings)];
            }))), finishBtn());
        }
        if (b === 'writing') {
          const ta = h('textarea', { class: 'wrun__text', lang: 'en', spellcheck: false, 'aria-label': D('writing.editorLabel'), onpaste: (e) => e.preventDefault(), ondrop: (e) => e.preventDefault() });
          ta.value = S.writing;
          const need = L().writing?.words || 250;
          const bar = h('div', { class: 'wrun__bar small' });
          const paintBar = () => put(bar, h('b', null, Writing.countWords(S.writing)), ' ', t('ieltsWriting.wordsNeed', { n: need }), ' · ', t('ieltsWriting.pasteOff'));
          ta.addEventListener('input', () => { S.writing = ta.value; save(); paintBar(); });
          paintBar();
          return h('div', { class: 'stack ob__narrow' }, h('span', { class: 'badge', style: { justifySelf: 'start' } }, 'Writing · Task 2'),
            h('div', { class: 'wtask__box', lang: 'en' }, String(form().writing?.question || '').split(/\n\n+/).map((x) => h('p', null, x))),
            h('p', { class: 'small muted' }, D('writing.target', { n: need })), ta, bar, finishBtn());
        }
        const sp = form().speaking || {}, lv = L().speaking || {};
        const cue = sp.cueCard || {};
        return h('div', { class: 'stack ob__narrow' }, h('span', { class: 'badge', style: { justifySelf: 'start' } }, 'Speaking · Part 1'),
          h('section', { class: 'card stack-sm' }, (sp.part1 || []).slice(0, lv.part1 || 2).map((q) => speakRow(q.id, q.text, lv.answerSec || 45))),
          h('span', { class: 'badge', style: { justifySelf: 'start' } }, 'Speaking · Part 2'),
          h('section', { class: 'card stack-sm' }, Speaking.cueCard({ question: cue.topic, bullets: [...(cue.points || []), cue.explain].filter(Boolean) }),
            h('p', { class: 'small muted' }, D('speaking.prepHint', { n: lv.prepSec || 60 })), speakRow(cue.id || 'cue', D('speaking.mono'), lv.monologueSec || 120)),
          rec?.error && h('p', { class: 'notice notice--danger' }, t('ieltsSpeaking.micError.' + rec.error)),
          h('p', { class: 'xs muted' }, t('ieltsSpeaking.privacyLocal')), err && h('p', { class: 'notice notice--danger' }, err), finishBtn(rec?.state === 'recording'));
      }
      let runMode = false;
      function paint() {
        if (!runMode || S.block == null) { put(root, frame({ onBack: today, main: startView() })); return; }
        const cur = blockIdx();
        put(root, h('div', { class: 'run dg' },
          h('header', { class: 'runbar' },
            h('a', { class: 'icon-btn', href: Router.href({ screen: 'ielts', ieltsTab: 'today' }), 'aria-label': t('common.close') }, icon('close')),
            h('span', { class: 'runbar__title' }, h('b', null, D('title')), h('span', { class: 'small muted' }, ` ${D('level.' + S.level)} · ${trackName(S.module)}`)),
            h('span', { class: 'grow' }),
            h('ol', { class: 'sstep' }, Z0.map((b, i) => h('li', { class: i < cur ? 'is-done' : i === cur ? 'is-on' : null }, h('span', { class: 'sstep__n' }, i < cur ? icon('check', 'ic12') : i + 1), D('block.' + b)))),
            cur >= 0 && !S.block.endsWith('-intro') && h('span', { class: 'badge' }, icon('clock', 'ic12'), ' ', t('ieltsWriting.minutes', { n: L()[Z0[cur]]?.minutes || 0 }))),
          h('main', { class: 'dg__main' }, blockView())));
      }
      paint();
      return root;
    },
  };

  // ---------- diagnostic result ----------
  const CR = { writing: [['taskResponse', 'TR'], ['coherenceCohesion', 'CC'], ['lexicalResource', 'LR'], ['grammaticalRange', 'GRA']], speaking: [['fluencyCoherence', 'FC'], ['lexicalResource', 'LR'], ['grammaticalRange', 'GRA'], ['pronunciation', 'P']] };
  const gradeRuns = {};
  async function gradeDiag(id, skill) {
    const fd = new FormData();
    fd.append('attemptId', id); fd.append('skill', skill); fd.append('uiLang', I18n.lang);
    if (skill === 'speaking') {
      const ans = wavs[id] || (await Speaking.Pending.load('diag:' + id))?.answers;
      if (!ans?.length) { const e = new Error('lost'); e.lost = true; throw e; }
      fd.append('items', JSON.stringify(ans.map((a) => ({ itemId: a.itemId, durationSec: a.durationSec }))));
      ans.forEach((a, i) => fd.append('audio_' + i, a.wav, `${a.itemId}.wav`));
    }
    await Api.local('/api/ielts/diagnostic/assess', { form: fd });
    if (skill === 'speaking') { delete wavs[id]; Speaking.Pending.drop('diag:' + id); }
  }
  Screens['ielts-diagnostic-result'] = {
    fullscreen: true,
    title: () => t('ieltsOb.resultTitle'),
    async render(p) {
      let id = p.ieltsAttempt;
      if (!id) { try { id = (await Api.lastDiagnostic())?.attemptId; } catch {} }
      if (!id) return frame({ onBack: today, main: Hub.empty({ icon: 'target', title: D('result.notFound'), text: D('result.notFoundText'), action: h('a', { class: 'btn btn--primary', href: Router.href({ screen: 'ielts-diagnostic' }) }, t('ieltsLocked.diagnostic')) }) });
      let [view, prof] = await Promise.all([Api.attempt(id), Api.profile().catch(() => ({}))]);
      const gs = {};
      const root = h('div');
      async function run(skill, force) {
        if (gradeRuns[id + skill] && !force) return;
        gs[skill] = 'run'; paint();
        gradeRuns[id + skill] = gradeDiag(id, skill).then(async () => { gs[skill] = null; view = await Api.attempt(id); }).catch((e) => { gs[skill] = e.lost ? 'lost' : 'err'; }).finally(() => { delete gradeRuns[id + skill]; paint(); });
      }
      function paint() {
        const r = view.result || {}, b = r.bands || {}, light = r.level === 'light';
        const target = prof?.targetBand ? +prof.targetBand : null;
        const gap = VY(target, b.overall);
        const term = gap != null ? VV(gap, prof?.dailyMinutes || 60) : null;
        const reviewItems = (r.items || []);
        put(root, frame({ onBack: today, main: h('div', { class: 'ob__wide stack dres' },
          h('header', { class: 'row row--between' }, h('div', null, h('h1', { class: 'ob__title' }, t('ieltsOb.resultTitle')),
            h('p', { class: 'small muted' }, t('ieltsOb.resultSub', { level: D('level.' + (r.level || 'standard')), form: String(view.testId || '').replace(/^DG-/, ''), date: DOM.date(view.attempt?.finishedAt) }))),
            reviewItems.length > 0 && h('a', { class: 'btn btn--secondary btn--sm', href: '#dres-review' }, D('result.review'))),
          h('section', { class: 'card dres__overall' },
            h('span', { class: 'small' }, (b.overallPrelim === false ? t('ieltsOb.overallFinal') : t('ieltsOb.overallPrelim')) + (light ? ' · ≈' : '')),
            h('div', { class: 'row' }, h('b', { class: 'dres__big' }, b.overall != null ? Number(b.overall).toFixed(1) : '—'), target && h('span', { class: 'badge' }, t('ieltsDash.goalShort', { n: target.toFixed(1) }))),
            h('div', { class: 'progress' }, h('i', { style: { width: Math.min(100, ((b.overall || 0) / (target || 9)) * 100) + '%' } })),
            h('p', { class: 'small' }, !target ? t('ieltsOb.noTarget') : gap != null && gap <= 0 ? t('ieltsOb.gapReached') : term?.long ? t('ieltsOb.gapText', { gap }) : term ? t('ieltsOb.gapTerm', { gap, term: I18n.tp('ieltsOb.months', term.months, { n: numFmt(term.months) }), daily: dailyText(prof?.dailyMinutes || 60) }) : ''),
            light && h('p', { class: 'xs muted' }, t('ieltsOb.shortEstimate'))),
          h('div', { class: 'dres__skills' }, Z0.map((s) => {
            const band = b[s], raw = r.raw?.[s], ws = r[s];
            const pending = (s === 'writing' || s === 'speaking') && ws && (ws.status === 'pending_ai' || ws.status === 'grading');
            if (pending && !gs[s] && !gradeRuns[id + s]) setTimeout(() => run(s));
            const status = band != null ? (light && raw ? '≈' : '') + Number(band).toFixed(1)
              : gs[s] === 'run' || ws?.status === 'grading' ? t('ieltsOb.grading') : gs[s] === 'err' || ws?.status === 'failed' ? t('ieltsOb.gradeFailed') : gs[s] === 'lost' ? t('ieltsOb.gradeLost') : ws?.status === 'pending_ai' ? t('ieltsOb.waitsAiShort') : D('result.skipped');
            return h('section', { class: 'card stack-sm' }, h('div', { class: 'row' }, Hub.plate(s, 36), h('b', { class: 'grow' }, D('block.' + s)), h('b', { class: band != null ? 'dres__band' : 'small muted' }, status)),
              h('div', { class: 'progress' }, h('i', { style: { width: ((band || 0) / 9) * 100 + '%' } })),
              h('p', { class: 'xs muted' }, raw ? t('ieltsOb.rawOf', { n: raw.correct, total: raw.total }) : s === 'writing' && ws ? t('ieltsOb.essaySaved', { n: ws.words || 0 }) : s === 'speaking' && ws ? t('ieltsOb.speakingSaved', { n: ws.answers || 0, sec: Math.round(ws.seconds || 0) }) : ''),
              ws?.criteria && h('div', { class: 'chips' }, CR[s].filter(([k]) => ws.criteria[k] != null).map(([k, l]) => h('span', { class: 'badge' }, `${l} ${Number(ws.criteria[k]).toFixed(1)}`))),
              (gs[s] === 'err' || ws?.status === 'failed') && h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => run(s, true) }, t('ieltsOb.gradeRetry')));
          })),
          h('section', { class: 'card stack-sm' }, h('h2', null, D('result.weak')), h('p', { class: 'small muted' }, D('result.weakHint')),
            (r.weakTypes || []).length ? r.weakTypes.map((ty) => h('div', { class: 'row dgrow' }, icon('target', 'ic16'), h('b', { class: 'grow' }, D('types.' + ty) || RL.typeLabel(ty)),
              r.byType?.[ty] && h('span', { class: 'small muted' }, t('ieltsOb.rawOf', { n: r.byType[ty].correct, total: r.byType[ty].total }))))
              : h('p', { class: 'small' }, D('result.noWeak'))),
          h('section', { class: 'card card--brand stack-sm' }, h('h2', null, t('ieltsOb.nextTitle')),
            h('p', null, prof?.examDate ? t('ieltsOb.nextTextDate', { date: fmtLong(prof.examDate) }) : t('ieltsOb.nextText')),
            h('div', null, h('a', { class: 'btn btn--primary btn--lg', href: Router.href({ screen: 'ielts-route' }) }, t('ieltsOb.buildPlan'), icon('arrowR', 'ic16'))),
            h('p', { class: 'xs muted' }, t('ieltsOb.bandNote'))),
          reviewItems.length > 0 && h('details', { class: 'card', id: 'dres-review' }, h('summary', null, h('b', null, D('result.review'))),
            h('div', { class: 'stack-sm', style: { marginTop: '12px' } }, reviewItems.map((x, i) => h('div', { class: 'dgrow stack-sm' },
              h('div', { class: 'row' }, h('span', { class: 'qnum ' + (x.correct ? 'is-ok' : 'is-bad') }, i + 1), h('span', { class: 'small grow' }, `${D('block.' + x.skill) || x.skill} · ${D('types.' + x.type) || RL.typeLabel(x.type || '')}`)),
              h('p', { class: 'small' }, h('span', { class: 'muted' }, (D('result.yours') || t('ieltsOb.p.quiz.yours')) + ': '), x.given || '—', !x.correct && [' · ', h('span', { class: 'muted' }, (D('result.right') || t('ieltsOb.p.quiz.right')) + ': '), h('b', null, [].concat(x.answer || []).join(' / '))]),
              x.trap && h('span', { class: 'badge badge--warn' }, `${D('result.trap')}: ${D('trap.' + x.trap) || x.trap}`))))))
        }));
      }
      paint();
      return root;
    },
  };

  // ---------- route ----------
  Screens['ielts-route'] = {
    fullscreen: true,
    title: () => 'IELTS',
    async render() {
      const pr = await Api.profile().catch(() => ({}));
      const target = Number(pr.targetBand) || 7, B = pr.bands || {};
      const overall = B.overall ?? null, gap = VY(target, overall), daily = pr.dailyMinutes || 60;
      const weeksToExam = pr.examDate ? daysTo(pr.examDate) / 7 : Infinity;
      let rec = null;
      if (overall == null) rec = null;
      else if (overall < 4.5 || gap >= 1.5 || (weeksToExam < 4 && gap >= 1)) rec = 'teacher';
      else if (Math.max(target - (B.writing ?? target), target - (B.speaking ?? target)) >= 1) rec = target >= 7 ? 'teacher' : 'mix';
      else if (gap <= 1) rec = gap > 0.5 ? 'mix' : 'platform';
      else rec = 'platform';
      const opts = [{ id: 'platform', speedup: 1, k: 3 }, { id: 'mix', speedup: 1.6, k: 4 }, { id: 'teacher', speedup: 2, k: 3 }];
      let saving = false;
      const root = h('div');
      const wa = (name) => DOM.waLink(t('ieltsOb.route.waText', { name }));
      async function choose(id) {
        saving = true; paint();
        try { await Api.setRoute(id); if (id !== 'platform') window.open(wa(t('ieltsOb.route.' + id)), '_blank', 'noopener'); State.me = null; today(); }
        catch (e) { saving = false; paint(); DOM.toast(e?.serverMessage || t('ieltsReading.errorText')); }
      }
      function paint() {
        put(root, frame({ onBack: () => history.back(), main: h('div', { class: 'ob__wide stack' },
          h('h1', { class: 'ob__title' }, t('ieltsOb.routeTitle', { n: target.toFixed(1) })),
          h('p', { class: 'muted' }, overall == null ? t('ieltsOb.routeNoDiag') : pr.examDate ? t('ieltsOb.routeSubFull', { now: overall.toFixed(1), gap, date: fmtLong(pr.examDate), daily: dailyText(daily) }) : t('ieltsOb.routeSubNoDate', { now: overall.toFixed(1), gap, daily: dailyText(daily) })),
          h('div', { class: 'route' }, opts.map((o) => {
            const term = VV(gap ?? 1.5, daily, o.speedup), fits = VG(term, pr.examDate);
            const isRec = rec === o.id;
            return h('section', { class: 'card stack-sm route__card' + (isRec ? ' is-rec' : '') + (pr.route === o.id ? ' is-chosen' : '') },
              h('div', { class: 'row row--between' }, h('span', { class: 'eyebrow' }, t('ieltsOb.routeKicker.' + o.id)), isRec && h('span', { class: 'badge badge--brand' }, t('ieltsOb.recommended'))),
              h('h2', null, t('ieltsOb.route.' + o.id)),
              h('p', null, h('b', { class: 'route__term' }, term.long ? t('ieltsOb.termLongShort') : `≈ ${I18n.tp('ieltsOb.months', term.months, { n: numFmt(term.months) })}`), ' ', h('span', { class: 'small muted' }, t('ieltsOb.toGoal'))),
              fits === false ? h('span', { class: 'badge badge--warn' }, t('ieltsOb.notFitsShort', { date: fmtLong(pr.examDate) }))
                : fits === true ? h('span', { class: 'badge badge--ok' }, daysTo(pr.examDate) - 7 * term.weeks >= 21 ? t('ieltsOb.fitsSpare') : t('ieltsOb.fitsExam')) : null,
              h('ul', { class: 'bul small' }, Array.from({ length: o.k }, (_, i) => h('li', null, t(`ieltsOb.routeFeature.${o.id}.${i + 1}`)))),
              h('button', { class: 'btn btn--lg ' + (isRec ? 'btn--primary' : 'btn--secondary'), type: 'button', disabled: saving, onclick: () => choose(o.id) }, t('ieltsOb.routeCta.' + o.id)));
          })),
          h('a', { class: 'link small', href: wa(t('ieltsOb.route.' + (rec || 'mix'))), target: '_blank', rel: 'noopener' }, t('ieltsOb.routeManager')),
          h('p', { class: 'small muted' }, t('ieltsOb.routeWhy', { daily }))) }));
      }
      paint();
      return root;
    },
  };
})();
