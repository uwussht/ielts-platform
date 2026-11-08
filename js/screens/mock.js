// Full mock exam session (ai-tutor "ielts-mock"): intro → equipment check → 4 sections run by the
// regular runners in mock mode (server deadline, server drafts) → between → submitted → result → review.
// MockKit holds the pieces the runners share in mock mode (header, server clock, autosave, confirm).
(function () {
  const { h, icon } = DOM;
  const put = (el, ...k) => el.replaceChildren(...k.flat(9).filter((x) => x != null && x !== false && x !== ''));
  const M_ = (k, v) => t('ieltsMock.' + k, v);
  const Bo = ['listening', 'reading', 'writing', 'speaking'];
  const Bc = { listening: 40, reading: 60, writing: 60, speaking: 14 };
  const Vj = { listening: 'Listening', reading: 'Reading', writing: 'Writing', speaking: 'Speaking' };
  const trackName = I18n.trackName;
  const sec = (s, name) => (s.sections || []).find((x) => x.name === name) || { name, attemptIds: [], testIds: [] };
  const nextSection = (s) => Bo.find((n) => !(sec(s, n).attemptIds || []).length);
  const viewOf = (s, v) => (s.status !== 'in_progress' ? (v === 'submitted' ? 'submitted' : v === 'review' ? 'review' : 'result') : s.section ? 'section' : 'between');
  const deadlineOf = (s) => (s.sectionDeadline && s.serverNow ? Date.now() + (Date.parse(s.sectionDeadline) - Date.parse(s.serverNow)) : null);
  const clockTxt = (sec) => { const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60, p = (n) => String(n).padStart(2, '0'); return hh ? `${hh}:${p(mm)}:${p(ss)}` : `${mm}:${p(ss)}`; };
  const toMocks = () => Router.go({ screen: 'ielts', ieltsTab: 'mocks' });

  // per-session memory that must survive re-renders between parts
  const prog = {};      // sid → {idx, done[]} for writing/speaking
  const uploads = {};   // sid → [{status, testId, attemptId, answers}]
  const lastDone = {};  // sid → section just finished
  const assessed = new Set();

  // ---------- MockKit (used by runners when p.mock is set) ----------
  function clock(M, { ceil = false, onZero } = {}) {
    const el = h('span', { class: 'runbar__timer mclock', role: 'timer' });
    let fired = false;
    const left = () => (M.deadline == null ? null : Math.max(0, (ceil ? Math.ceil : Math.round)((M.deadline - Date.now()) / 1000)));
    function paint() {
      const l = left();
      put(el, icon('clock', 'ic16'), h('b', null, l == null ? '—' : clockTxt(l)), h('small', null, ' ' + M_('byServer')));
      el.classList.toggle('is-low', l != null && l <= 300);
      if (l === 0 && !fired && onZero) { fired = true; onZero(); }
    }
    const iv = setInterval(paint, 1000);
    App.onLeave(() => clearInterval(iv));
    paint();
    return { el, left };
  }
  function saver(M, payload, ms = 1500) {
    const el = h('span', { class: 'msave xs', role: 'status' });
    let last = JSON.stringify(payload()), tm = null, state = null, off = false;
    const paint = () => put(el, state && [state === 'saved' && icon('check', 'ic12'), ' ', M_('save.' + state)]);
    async function send(body, opts) {
      try { await M.onSave(JSON.parse(body), opts); if (!off) { state = 'saved'; paint(); } }
      catch { if (!off) { state = 'error'; paint(); } }
    }
    function touch() {
      if (off) return;
      const s = JSON.stringify(payload());
      if (s === last) return;
      last = s; state = 'saving'; paint();
      clearTimeout(tm); tm = setTimeout(() => { tm = null; send(s); }, ms);
    }
    function flush(keepalive) { if (tm) { clearTimeout(tm); tm = null; send(last, { keepalive }); } }
    const onHide = () => flush(true);
    addEventListener('pagehide', onHide);
    App.onLeave(() => { flush(true); off = true; removeEventListener('pagehide', onHide); });
    return { el, touch, flush, cancel() { clearTimeout(tm); tm = null; off = true; } };
  }
  function header({ M, section, part, clock: ck, saver: sv, extra, submitLabel, onSubmit, submitDisabled }) {
    const btn = submitLabel && h('button', { class: 'btn btn--primary btn--sm', type: 'button', disabled: !!submitDisabled, onclick: onSubmit }, submitLabel);
    const el = h('header', { class: 'runbar mockbar' },
      h('span', { class: 'brand__mark runbar__mark', 'aria-hidden': 'true' }, DOM.svg(DOM.BRAND)),
      h('span', { class: 'runbar__title' }, [M.title, Vj[section] || section, part].filter(Boolean).join(' · ')),
      h('span', { class: 'grow' }), extra, ck?.el, sv?.el, btn,
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => M.onExit() }, M_('exit')));
    el.submitBtn = btn;
    return el;
  }
  function numList(nums) {
    const a = nums.slice(0, 6), more = nums.length - a.length;
    if (more > 0) return a.join(', ') + M_('more', { n: more });
    return a.length > 1 ? a.slice(0, -1).join(', ') + ' ' + M_('and') + ' ' + a.at(-1) : a.join('');
  }
  function confirm({ section, unanswered = [], onConfirm }) {
    DOM.dialog((close) => {
      const ok = h('button', { class: 'btn btn--primary', type: 'button', onclick: async () => { ok.disabled = true; close(); await onConfirm(); } }, M_('submitSection'));
      const cancel = h('button', { class: 'btn btn--secondary', type: 'button', onclick: close }, M_('backToQuestions'));
      setTimeout(() => cancel.focus());
      return h('div', { class: 'stack' }, h('h2', null, M_('confirmTitle', { section: Vj[section] || section })),
        h('p', null, (unanswered.length ? M_('confirmUnanswered', { n: unanswered.length, list: numList(unanswered) }) : t('ieltsReading.confirmAll')) + ' ' + M_('noReturn')),
        h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, cancel, ok));
    });
  }
  window.MockKit = { clock, saver, header, confirm, clockTxt };

  // ---------- frame ----------
  function frame(s, { right, main, chip }) {
    return h('div', { class: 'mock' },
      h('header', { class: 'runbar mockbar' },
        h('span', { class: 'brand__mark runbar__mark', 'aria-hidden': 'true' }, DOM.svg(DOM.BRAND)),
        h('span', { class: 'badge' }, chip || `${s.title} · ${trackName(s.module)}`), h('span', { class: 'grow' }), right),
      h('main', { class: 'mock__main' }, main));
  }
  function stepper(items, cur) {
    return h('ol', { class: 'sstep mstep' }, items.map((x, i) => h('li', { class: i < cur ? 'is-done' : i === cur ? 'is-on' : null }, h('span', { class: 'sstep__n' }, i < cur ? icon('check', 'ic12') : i + 1), x)));
  }
  function exitDialog(s, { speaking, onSpeakingExit } = {}) {
    DOM.dialog((close) => {
      const cancel = h('button', { class: 'btn btn--secondary', type: 'button', onclick: close }, M_('stay'));
      const ok = h('button', { class: 'btn btn--danger', type: 'button', onclick: async () => {
        ok.disabled = true;
        if (speaking) { close(); return onSpeakingExit(); }
        try { if (s.status === 'in_progress') await Api.abortMock(s.id); } catch {}
        close(); Api.clearCache?.(); toMocks();
      } }, speaking ? M_('exitSpeaking') : M_('exit'));
      setTimeout(() => cancel.focus());
      return h('div', { class: 'stack' }, h('h2', null, speaking ? M_('exitSpeakingTitle') : M_('exitTitle')), h('p', null, speaking ? M_('exitSpeakingText') : M_('exitText')),
        h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, cancel, ok));
    });
  }
  const go = (sid, view) => Router.go({ screen: 'ielts-mock', sessionId: String(sid), view: view || null }, { replace: true });

  // ---------- intro + equipment check ----------
  function introView(mock, root, startFn) {
    const st = { step: 0, sound: null, mic: null, level: 0, net: navigator.onLine ? 'ok' : 'fail', agree: false, starting: false, err: '' };
    let stream = null, ac = null, iv = null, stopT = null;
    const stopMic = () => { clearInterval(iv); clearTimeout(stopT); stream?.getTracks().forEach((x) => x.stop()); stream = null; ac?.close().catch(() => {}); ac = null; };
    const onNet = () => { st.net = navigator.onLine ? 'ok' : 'fail'; paint(); };
    addEventListener('online', onNet); addEventListener('offline', onNet);
    App.onLeave(() => { stopMic(); removeEventListener('online', onNet); removeEventListener('offline', onNet); });
    async function testSound() {
      st.sound = 'busy'; paint();
      try {
        const C = new (window.AudioContext || window.webkitAudioContext)(), o = C.createOscillator(), g = C.createGain();
        o.frequency.value = 660; g.gain.setValueAtTime(1e-4, C.currentTime); g.gain.exponentialRampToValueAtTime(0.2, C.currentTime + 0.05); g.gain.exponentialRampToValueAtTime(1e-4, C.currentTime + 0.8);
        o.connect(g).connect(C.destination); o.start(); o.stop(C.currentTime + 0.85);
        await new Promise((r) => setTimeout(r, 900)); C.close().catch(() => {});
        st.sound = 'ok';
      } catch { st.sound = 'fail'; }
      paint();
    }
    async function testMic() {
      stopMic(); st.mic = 'busy'; paint();
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        ac = new AudioContext(); const an = ac.createAnalyser(); an.fftSize = 512; ac.createMediaStreamSource(stream).connect(an);
        const buf = new Float32Array(an.fftSize);
        iv = setInterval(() => { an.getFloatTimeDomainData(buf); let s = 0; for (const v of buf) s += v * v; st.level = Math.min(1, 8 * Math.sqrt(s / buf.length)); const b = root.querySelector('.mcheck__lvl i'); if (b) b.style.width = st.level * 100 + '%'; }, 100);
        stopT = setTimeout(stopMic, 6000);
        st.mic = 'ok';
      } catch { st.mic = 'fail'; }
      paint();
    }
    function row(ic, title, text, state, action, extra) {
      return h('div', { class: 'mcheck' }, h('span', { class: 'obopt__ic' }, icon(ic)), h('div', { class: 'grow stack-sm' }, h('b', null, title), h('span', { class: 'small muted' }, text), extra),
        state && h('span', { class: 'badge ' + (state === 'ok' ? 'badge--ok' : state === 'fail' ? 'badge--danger' : '') }, M_('check.state.' + state)), action);
    }
    function paint() {
      const steps = stepper([M_('step.about'), M_('step.check'), M_('step.exam')], st.step);
      if (st.step === 0) {
        put(root, frame(mock, { right: h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: toMocks }, M_('toList')), main: [steps,
          h('h1', { class: 'ob__title' }, mock.title), h('p', { class: 'muted' }, M_('intro.sub', { track: trackName(mock.module) })),
          h('div', { class: 'mock__two' },
            h('section', { class: 'card stack-sm' }, h('h2', null, M_('intro.parts')),
              Bo.map((b, i) => h('div', { class: 'row dgrow' }, Hub.plate(b, 40), h('div', { class: 'grow' }, h('b', null, Vj[b]), h('p', { class: 'xs muted' }, M_('intro.section', { n: i + 1 }))),
                h('b', { class: 'small' }, b === 'listening' ? M_('intro.about', { n: 40 }) : b === 'speaking' ? M_('intro.range', { from: 11, to: 14 }) : M_('intro.min', { n: 60 })))),
              h('p', { class: 'xs muted' }, M_('intro.total'))),
            h('section', { class: 'card stack-sm' }, h('h2', null, M_('intro.rules')),
              [['clock', 'timer'], ['eye', 'hints'], ['pause', 'pause'], ['spark', 'ai']].map(([ic, k]) => h('div', { class: 'row mrule' }, icon(ic, 'ic16'), h('span', { class: 'small' }, M_('rule.' + k)))),
              h('span', { class: 'badge badge--brand', style: { justifySelf: 'start' } }, M_('intro.strict')))),
          h('div', { class: 'row' }, h('button', { class: 'btn btn--primary btn--lg', type: 'button', onclick: () => { st.step = 1; paint(); } }, M_('intro.toCheck')),
            h('button', { class: 'btn btn--secondary btn--lg', type: 'button', onclick: toMocks }, M_('back')))] }));
        return;
      }
      const canStart = st.mic === 'ok' && st.agree && st.net === 'ok' && !st.starting;
      put(root, frame(mock, { right: h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: toMocks }, M_('toList')), main: [steps,
        h('h1', { class: 'ob__title' }, M_('check.title')),
        h('section', { class: 'card stack-sm' },
          row('volume', M_('check.sound'), M_('check.soundText'), st.sound, h('button', { class: 'btn btn--secondary btn--sm', type: 'button', disabled: st.sound === 'busy', onclick: testSound }, M_('check.test'))),
          row('mic', M_('check.mic'), M_('check.micText'), st.mic, st.mic !== 'fail' && h('button', { class: 'btn btn--secondary btn--sm', type: 'button', disabled: st.mic === 'busy', onclick: testMic }, M_('check.test')),
            [st.mic === 'ok' && h('div', { class: 'mcheck__lvl progress' }, h('i', { style: { width: st.level * 100 + '%' } })),
              st.mic === 'fail' && h('div', { class: 'notice notice--danger stack-sm', role: 'alert' }, h('b', null, M_('check.micDenied')), h('span', { class: 'small' }, M_('check.micDeniedText')),
                h('div', null, h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: testMic }, M_('check.retry'))))]),
          row('refresh', M_('check.net'), M_('check.netText'), st.net)),
        h('label', { class: 'row mcheck__agree' }, h('input', { type: 'checkbox', checked: st.agree, onchange: (e) => { st.agree = e.target.checked; paint(); } }), h('span', null, M_('check.agree'))),
        st.err && h('p', { class: 'notice notice--danger', role: 'alert' }, st.err),
        h('div', { class: 'row' }, h('button', { class: 'btn btn--primary btn--lg', type: 'button', disabled: !canStart, onclick: async () => {
          stopMic(); st.starting = true; st.err = ''; paint();
          const e = await startFn(); if (e) { st.starting = false; st.err = e; paint(); }
        } }, M_('check.start')), h('button', { class: 'btn btn--secondary btn--lg', type: 'button', onclick: () => { stopMic(); st.step = 0; paint(); } }, M_('back'))),
        !canStart && h('p', { class: 'xs muted' }, M_('check.hint'))] }));
    }
    paint();
  }
  const startErr = (e) => (e?.status === 409 ? M_('err.otherOpen') : e?.code === 'CONTENT_QUOTA_EXCEEDED' || e?.status === 429 ? RL.quotaMessage(e) : M_('err.start'));

  // ---------- section run ----------
  async function sectionView(s) {
    const name = s.section, S = sec(s, name);
    const p = (prog[s.id] ||= Array.isArray(s.draft?.done) ? { idx: s.draft.idx || 0, done: [...s.draft.done] } : { idx: 0, done: [] });
    const deadline = deadlineOf(s);
    async function finish(ids) {
      try {
        const ns = await Api.finishMockSection(s.id, name, ids);
        delete prog[s.id]; lastDone[s.id] = name;
        go(s.id, ns.status === 'in_progress' ? null : 'submitted');
      } catch { DOM.toast?.(M_('err.finish')); throw new Error('finish'); }
    }
    const base = { title: s.title, deadline, onExit: () => exitDialog(s), onSave: (d, o) => Api.saveMockDraft(s.id, name, d, !!o?.keepalive) };
    let M, testId;
    if (name === 'listening' || name === 'reading') {
      testId = S.testIds[0];
      M = { ...base, draft: s.draft, onSubmitted: (ids) => finish(ids) };
    } else if (name === 'writing') {
      testId = S.testIds[p.idx];
      const saveDraft = (d, o) => Api.saveMockDraft(s.id, name, d, !!o?.keepalive);
      M = { ...base, draft: s.draft?.idx === p.idx ? s.draft.part : null, isLast: p.idx + 1 >= S.testIds.length, part: p.idx + 1 >= S.testIds.length && S.testIds.length > 1 ? 'Task 2' : 'Task ' + (p.idx + 1),
        onSave: (part, o) => saveDraft({ idx: p.idx, done: p.done, part }, o),
        onSubmitted: async ([id]) => {
          assessed.add(String(id)); Api.assessIeltsWriting(id, I18n.lang).catch(() => {});
          const done = [...p.done, id];
          if (done.length >= S.testIds.length) return finish(done);
          prog[s.id] = { idx: p.idx + 1, done };
          await saveDraft({ idx: p.idx + 1, done, part: null }).catch(() => {});
          go(s.id);
        } };
    } else {
      testId = S.testIds[p.idx];
      M = { ...base, part: t('ielts.term.part', { n: p.idx + 1 }),
        onExit: () => exitDialog(s, { speaking: true, onSpeakingExit: () => { const U = (uploads[s.id] ||= []); for (let i = 0; i < S.testIds.length; i++) U[i] ||= { status: 'done', testId: S.testIds[i], attemptId: null }; go(s.id, 'submitted'); } }),
        onRecorded: (answers) => {
          upload(s, p.idx, S.testIds[p.idx], answers);
          if (p.idx + 1 < S.testIds.length) { prog[s.id] = { idx: p.idx + 1, done: p.done }; go(s.id); } else go(s.id, 'submitted');
        } };
    }
    const scr = Screens[`ielts-${name}-run`];
    return scr.render({ ieltsTest: testId, mode: 'exam', mock: M });
  }
  function upload(s, idx, testId, answers, onChange) {
    const U = (uploads[s.id] ||= []);
    if (!answers?.length) { U[idx] = { status: 'done', testId, attemptId: null }; return; }
    U[idx] = { status: 'uploading', testId, answers };
    Speaking.assess({ testId, mode: 'exam', answers })
      .then((r) => { U[idx] = { status: 'done', testId, attemptId: r.attempt.id }; })
      .catch((e) => { U[idx] = { status: e.attemptId ? 'done' : 'error', testId, attemptId: e.attemptId || null, answers }; })
      .finally(() => {
        const done = U.filter((x) => x?.status === 'done');
        if (done.length === U.length) Api.saveMockDraft(s.id, 'speaking', { idx: done.length, done: done.map((x) => x.attemptId), part: null }).catch(() => {});
        onChange?.(); window.dispatchEvent(new Event('mock-upload'));
      });
  }

  // ---------- between ----------
  function betweenView(s, root) {
    const next = nextSection(s), ld = lastDone[s.id];
    let err = '', busy = false;
    function paint() {
      put(root, frame(s, { right: h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => exitDialog(s) }, M_('exit')), main: [
        stepper(Bo.map((b) => Vj[b]), Bo.indexOf(next)),
        h('section', { class: 'card stack mock__between' }, h('span', { class: 'mock__ok' }, icon('check')),
          h('h2', null, ld ? M_('between.done', { section: Vj[ld] }) : M_('between.resume')),
          h('p', null, M_('between.text', { next: Vj[next], min: Bc[next] })),
          h('p', { class: 'notice ob__warn small' }, M_('between.timer', { next: Vj[next] })),
          err && h('p', { class: 'notice notice--danger', role: 'alert' }, err),
          h('div', null, h('button', { class: 'btn btn--primary btn--lg', type: 'button', disabled: busy, onclick: async () => {
            busy = true; err = ''; paint();
            try { await Api.startMockSection(s.id, next); go(s.id); } catch (e) { busy = false; err = startErr(e); paint(); }
          } }, M_('between.start', { next: Vj[next] }), icon('arrowR', 'ic16'))))] }));
    }
    paint();
  }

  // ---------- submitted ----------
  function polling(s, root, paint) {
    let inflight = false, stopped = false;
    const t0 = Date.now();
    const needs = () => (s.sections || []).some((x) => x.state === 'checking') || (uploads[s.id] || []).some((x) => x?.status === 'uploading');
    async function tick() {
      if (stopped || document.hidden || inflight) return;
      if (Date.now() - t0 > 600000) { stopped = true; clearInterval(iv); paint(true); return; }
      if (!needs()) return;
      inflight = true;
      try { Object.assign(s, await Api.mockSession(s.id)); autoAssess(s); paint(); } catch {} finally { inflight = false; }
    }
    const iv = setInterval(tick, 5000);
    const vis = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('mock-upload', paint.bind(null, false));
    App.onLeave(() => { stopped = true; clearInterval(iv); document.removeEventListener('visibilitychange', vis); window.removeEventListener('mock-upload', paint); });
  }
  function autoAssess(s, force) {
    for (const part of sec(s, 'writing').parts || []) {
      if (!part.attemptId || part.status === 'done') continue;
      if ((part.status === 'pending_ai' || force) && (!assessed.has(String(part.attemptId)) || force)) { assessed.add(String(part.attemptId)); Api.assessIeltsWriting(part.attemptId, I18n.lang).catch(() => { part._failed = true; }); }
    }
  }
  function maybeFinishSpeaking(s) {
    const U = uploads[s.id], S = sec(s, 'speaking');
    if (s.status !== 'in_progress' || s.section !== 'speaking' || !U || U.length < (S.testIds || []).length || U.some((x) => !x || x.status !== 'done') || U._finishing) return;
    U._finishing = true;
    Api.finishMockSection(s.id, 'speaking', U.map((x) => x.attemptId).filter(Boolean)).then((ns) => { Object.assign(s, ns); window.dispatchEvent(new Event('mock-upload')); }).catch(() => { U._finishing = false; });
  }
  function submittedView(s, root) {
    autoAssess(s);
    function chip(name) {
      const S = sec(s, name), U = name === 'speaking' && uploads[s.id];
      if (U && U.some((x) => x?.status === 'uploading')) {
        const n = U.filter((x) => x?.status === 'done').length;
        return [h('span', { class: 'badge badge--info' }, M_('state.uploading', { n, total: (S.testIds || U).length })), h('div', { class: 'progress' }, h('i', { style: { width: (n / (S.testIds || U).length) * 100 + '%' } }))];
      }
      if (U && U.some((x) => x?.status === 'error')) {
        return [h('span', { class: 'badge badge--danger' }, M_('state.uploadFailed')), h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => U.forEach((x, i) => x?.status === 'error' && upload(s, i, x.testId, x.answers)) }, M_('check.retry'))];
      }
      const st = S.state;
      if (st === 'done') return h('span', { class: 'badge badge--ok' }, M_('state.ready'));
      if (st === 'failed') return [h('span', { class: 'badge badge--danger' }, M_('state.failed')), name === 'writing' && h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => autoAssess(s, true) }, M_('check.retry'))];
      if (st === 'missing') return h('span', { class: 'badge' }, M_('state.missing'));
      if (st === 'checking') {
        const failed = name === 'writing' && (S.parts || []).some((x) => x._failed);
        return [h('span', { class: 'badge badge--info' }, (S.parts || []).some((x) => x.status === 'grading') ? M_('state.grading') : M_('state.queued')),
          failed && h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => autoAssess(s, true) }, M_('check.retry'))];
      }
      return h('span', { class: 'badge badge--info' }, M_('state.uploadingShort'));
    }
    let late = false;
    function paint(isLate) {
      if (isLate === true) late = true;
      maybeFinishSpeaking(s);
      put(root, frame(s, { right: h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: toMocks }, M_('close')), main: [
        h('h1', { class: 'ob__title' }, M_('submitted.title')), h('p', { class: 'muted' }, M_('submitted.sub')),
        h('section', { class: 'card stack-sm' }, Bo.map((b) => h('div', { class: 'row dgrow mrow' }, Hub.plate(b, 36), h('b', { class: 'grow' }, Vj[b]), h('div', { class: 'mrow__st' }, chip(b))))),
        late && h('p', { class: 'notice' }, M_('submitted.later')),
        h('p', { class: 'small muted' }, M_('submitted.note')),
        h('div', { class: 'row' }, h('button', { class: 'btn btn--primary', type: 'button', onclick: toMocks }, M_('submitted.history')),
          h('a', { class: 'btn btn--secondary', href: Router.href({ screen: 'ielts', ieltsTab: 'today' }) }, M_('submitted.toIelts')))] }));
    }
    polling(s, root, paint);
    paint();
  }

  // ---------- result ----------
  const CRIT = { writing: [['taskResponse', 'TR'], ['coherenceCohesion', 'CC'], ['lexicalResource', 'LR'], ['grammaticalRange', 'GRA']], speaking: [['fluencyCoherence', 'Fluency'], ['lexicalResource', 'LR'], ['grammaticalRange', 'GRA'], ['pronunciation', 'Pron']] };
  const half = (x) => Math.round(x * 2) / 2;
  function detail(S) {
    if (S.band == null) return null;
    if (S.rawScore != null) return M_('result.correct', { n: S.rawScore, total: S.maxScore });
    const parts = (S.parts || []).filter((x) => x.criteria);
    const use = S.name === 'writing' ? parts.slice(-1) : parts;
    if (!use.length) return null;
    return (CRIT[S.name] || []).map(([k, l]) => { const v = use.map((x) => x.criteria[k]).filter((x) => typeof x === 'number'); return v.length ? `${l} ${half(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)}` : null; }).filter(Boolean).join(' · ');
  }
  async function resultView(s, root) {
    const prof = await Api.profile().catch(() => ({}));
    function paint() {
      const hs = s.status === 'aborted' ? 'aborted' : s.partial ? 'partial' : s.overall == null ? 'incomplete' : 'done';
      const tone = { done: 'badge--ok', partial: 'badge--warn', aborted: '', incomplete: '' }[hs];
      const target = Number(prof?.targetBand) || null;
      const bands = Bo.map((b) => sec(s, b).band);
      const low = bands.every((x) => typeof x === 'number') ? Bo[bands.indexOf(Math.min(...bands))] : null;
      const anyRaw = Bo.some((b) => sec(s, b).rawScore != null);
      const firstReview = Bo.find((b) => (sec(s, b).parts || []).some((x) => x.attemptId) || (sec(s, b).attemptIds || []).length) || 'listening';
      put(root, frame(s, { right: h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: toMocks }, M_('close')), main: [
        h('div', { class: 'row', style: { flexWrap: 'wrap' } }, h('span', { class: 'badge ' + tone }, M_('result.status.' + hs)),
          h('span', { class: 'small muted' }, `${DOM.dateFull(s.finishedAt || s.startedAt).replace(/\s*\d{4}.*$/, '')} · ${s.overall != null ? M_('result.internal') : M_('result.platform')}`)),
        h('h1', { class: 'ob__title' }, M_('result.title', { name: s.title })),
        h('section', { class: 'card dres__overall' + (s.overall == null ? ' is-empty' : '') }, h('span', { class: 'small' }, 'Overall'),
          h('b', { class: 'dres__big' }, s.overall != null ? Number(s.overall).toFixed(1) : '—'),
          h('p', { class: 'small' }, s.overall != null ? (target ? (Math.max(0, target - s.overall) > 0 ? M_('result.toGoal', { goal: target.toFixed(1), n: Math.max(0, target - s.overall).toFixed(1) }) : M_('result.goalReached')) : '')
            : hs === 'aborted' ? M_('result.abortedText') : hs === 'incomplete' && Bo.some((b) => ['missing', 'failed'].includes(sec(s, b).state)) ? M_('result.incompleteText') : M_('result.overallLater'))),
        h('section', { class: 'card stack-sm' }, Bo.map((b) => {
          const S = sec(s, b), d = detail({ ...S, name: b });
          const can = S.band != null && ((S.parts || []).some((x) => x.attemptId) || (S.attemptIds || []).length);
          return h('div', { class: 'row dgrow mrow' }, Hub.plate(b, 36), h('div', { class: 'grow' }, h('b', null, Vj[b]), d && h('p', { class: 'xs muted' }, d)),
            h('b', { class: 'dres__band' + (S.band == null ? ' is-none' : '') }, S.band != null ? Number(S.band).toFixed(1) : '—'),
            can ? h('a', { class: 'link small', href: Router.href({ screen: 'ielts-mock', sessionId: String(s.id), view: 'review', sec: b }) }, M_('result.review'))
              : h('span', { class: 'xs muted' }, M_('result.cell.' + (S.state || 'pending'))));
        })),
        low && h('section', { class: 'card card--brand stack-sm' }, h('span', { class: 'eyebrow' }, M_('result.recLabel')), h('p', null, M_('result.rec.' + low)),
          h('div', null, h('a', { class: 'btn btn--secondary btn--sm', href: Router.href({ screen: 'ielts', ieltsTab: 'learn', ieltsView: 'skill-' + low }) }, M_('result.train')))),
        h('div', { class: 'row' },
          (s.overall != null || anyRaw) && h('a', { class: 'btn btn--primary', href: Router.href({ screen: 'ielts-mock', sessionId: String(s.id), view: 'review', sec: firstReview }) }, s.overall != null ? M_('result.toSkills') : M_('result.reviewLR')),
          h('a', { class: 'btn btn--secondary', href: Router.href({ screen: 'ielts', ieltsTab: 'plan' }) }, M_('result.toPlan')))] }));
    }
    const checking = (s.sections || []).some((x) => x.state === 'checking');
    if (checking) polling(s, root, paint);
    paint();
  }

  // ---------- review ----------
  async function reviewView(s, root, p) {
    const name = Bo.includes(p.sec) ? p.sec : 'listening';
    const S = sec(s, name);
    const parts = (S.parts || []).filter((x) => x.attemptId).map((x) => x.attemptId);
    const ids = parts.length ? parts : S.attemptIds || [];
    const pi = Math.min(Number(p.part) || 0, Math.max(0, ids.length - 1));
    let body;
    if (!ids.length) body = Hub.empty({ icon: 'about', title: M_('result.cell.' + (S.state || 'pending')), text: M_('review.noWork') });
    else {
      const id = String(ids[pi]);
      const scr = name === 'writing' ? Screens['learn:writing-work'] : name === 'speaking' ? Screens['learn:speaking-work'] : Screens['ielts-reading-review'];
      try { body = await scr.render({ ieltsWork: id, embedded: true }); } catch { body = DOM.errorBox?.() || h('p', { class: 'notice notice--danger' }, t('ieltsReading.errorText')); }
    }
    put(root, h('div', { class: 'mock mock--review' },
      h('header', { class: 'runbar mockbar' }, h('span', { class: 'brand__mark runbar__mark', 'aria-hidden': 'true' }, DOM.svg(DOM.BRAND)),
        h('span', { class: 'badge' }, `${s.title} · ${M_('review.chip')}`), h('span', { class: 'grow' }),
        h('a', { class: 'btn btn--ghost btn--sm', href: Router.href({ screen: 'ielts-mock', sessionId: String(s.id), view: 'result' }) }, M_('review.back'))),
      h('nav', { class: 'mock__tabs', 'aria-label': M_('review.sections') }, Bo.map((b) => {
        const X = sec(s, b);
        return h('a', { class: 'chip', 'aria-selected': String(b === name), href: Router.href({ screen: 'ielts-mock', sessionId: String(s.id), view: 'review', sec: b }) }, icon(b, 'ic16'), ' ', Vj[b], ' · ',
          X.band != null ? Number(X.band).toFixed(1) : M_('result.cell.' + (X.state || 'pending')));
      })),
      ids.length > 1 && h('nav', { class: 'mock__tabs mock__tabs--sub' }, ids.map((_, i) => h('a', { class: 'chip', 'aria-selected': String(i === pi), href: Router.href({ screen: 'ielts-mock', sessionId: String(s.id), view: 'review', sec: name, part: String(i) }) }, (name === 'writing' ? 'Task ' : 'Part ') + (i + 1)))),
      h('main', { class: 'mock__review' }, body)));
  }

  // ---------- screen ----------
  Screens['ielts-mock'] = {
    fullscreen: true,
    title: () => 'Mock',
    async render(p) {
      const root = h('div');
      const fail = (txt) => h('div', { class: 'mock' }, h('main', { class: 'mock__main' }, Hub.empty({ icon: 'mock', title: txt, text: '', action: h('button', { class: 'btn btn--secondary', type: 'button', onclick: toMocks }, M_('toList')) })));
      let s;
      if (p.sessionId) {
        try { s = await Api.mockSession(p.sessionId); } catch (e) { return fail(e?.status === 404 ? M_('err.missing') : t('ieltsReading.errorText')); }
      } else {
        let list;
        try { list = await Api.mocks(); } catch { return fail(t('ieltsReading.errorText')); }
        const mock = (list.mocks || []).find((m) => m.id === p.mockId);
        if (!mock) return fail(M_('err.missing'));
        if (list.open && list.open.mockId === mock.id) { setTimeout(() => go(list.open.id)); return root; }
        introView(mock, root, async () => {
          try {
            const ns = await Api.startMock(mock.id);
            await Api.startMockSection(ns.id, nextSection(ns) || 'listening');
            go(ns.id);
          } catch (e) { return startErr(e); }
        });
        return root;
      }
      const v = viewOf(s, p.view);
      if (v === 'section') {
        if (s.section === 'speaking' && (uploads[s.id] || []).length >= (sec(s, 'speaking').testIds || []).length) { submittedView(s, root); return root; }
        return sectionView(s);
      }
      if (v === 'between') {
        if (uploads[s.id] && s.status === 'in_progress' && !s.section) delete uploads[s.id];
        betweenView(s, root); return root;
      }
      if (v === 'submitted' || (s.status === 'in_progress' && p.view === 'submitted')) { submittedView(s, root); return root; }
      if (v === 'review') { await reviewView(s, root, p); return root; }
      await resultView(s, root);
      return root;
    },
  };
})();
