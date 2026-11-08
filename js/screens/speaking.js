// IELTS Speaking — ai-tutor HZ (task page), Vy (run state machine + recorder ts() + live
// metrics), H1 (AI review), H2 (guide), H3 (shadowing). Answers are recorded in the browser,
// converted to 16 kHz mono WAV and graded by ai-tutor's /api/ielts/speaking/assess.
(function () {
  const { h, icon } = DOM;
  const put = (el, ...k) => el.replaceChildren(...k.flat(9).filter((x) => x != null && x !== false && x !== ''));
  const loc = (o) => RL.loc(o);
  const HY = (s) => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const learnHref = (view, extra) => Practice.learnHref(view, extra);
  const crumbsTo = (...rest) => Practice.crumbs({ label: t('ieltsHub.tab.learn'), href: learnHref() }, { label: 'Speaking', href: learnHref('skill-speaking') }, ...rest);
  const bandTxt = (v) => (v == null || Number.isNaN(+v) ? '—' : Number(v).toFixed(1));

  // ---------- constants (HH, HU, HV, HG) ----------
  const CRIT = [['fluencyCoherence', 'fc'], ['lexicalResource', 'lr'], ['grammaticalRange', 'gra'], ['pronunciation', 'p']];
  const HU = { part1: { answerSec: 45 }, part2: { prepSec: 60, answerSec: 120, followUpSec: 30 }, part3: { answerSec: 75 } };
  const itemsOf = (doc) => (doc.kind === 'part2' ? [{ id: doc.id || 'cue', question: doc.cue, bullets: doc.bullets || [], followUp: doc.followUp }] : doc.questions || []);
  const uiCode = (c) => (['quota', 'grading_unavailable', 'no_speech', 'too_large', 'auth_required', 'network'].includes(c) ? c : c === 'model_failed' || c === 'timeout' ? 'busy' : 'other');
  const partN = (kind) => String(kind || '').slice(4);

  // ---------- examiner voice (speakTts) ----------
  let ttsAudio = null;
  function stopTts() { try { ttsAudio?.pause(); } catch {} ttsAudio = null; try { speechSynthesis.cancel(); } catch {} }
  function synth(text, speed) {
    return new Promise((res) => {
      if (!('speechSynthesis' in window)) return res('failed');
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-GB'; u.rate = speed;
      const v = speechSynthesis.getVoices().find((x) => /en[-_]GB/i.test(x.lang));
      if (v) u.voice = v;
      u.onend = () => res('played'); u.onerror = () => res('failed');
      speechSynthesis.speak(u);
    });
  }
  // ai-tutor's /api/tts (voice Freya) through the proxy; the browser voice is the fallback
  function speakTts(text, { speed = 1 } = {}) {
    stopTts();
    const sp = Math.min(1.3, Math.max(0.7, Math.round(speed * 20) / 20));
    if (window.Demo?.on) return synth(text, sp);
    return new Promise((res) => {
      const a = new Audio(`/api/tts?v=Freya&l=en&s=${sp}&t=${encodeURIComponent(String(text).slice(0, 1000))}`);
      ttsAudio = a;
      const max = setTimeout(() => { a.pause(); res('timeout'); }, 15000 + 120 * String(text).length);
      a.onended = () => { clearTimeout(max); res('played'); };
      a.onerror = () => { clearTimeout(max); if (ttsAudio === a) synth(text, sp).then(res); else res('cancelled'); };
      a.play().catch(() => { clearTimeout(max); if (ttsAudio === a) synth(text, sp).then(res); else res('cancelled'); });
    });
  }

  // ---------- recorder (ts) + WAV encoder (e0) ----------
  const supported = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder && (window.AudioContext || window.webkitAudioContext));
  async function toWav(blob) {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ac = new AC();
    const buf = await ac.decodeAudioData(await blob.arrayBuffer());
    ac.close?.();
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(16000 * buf.duration)), 16000);
    const src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start();
    const out = (await off.startRendering()).getChannelData(0);
    const view = new DataView(new ArrayBuffer(44 + out.length * 2));
    const w = (o, s) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); view.setUint32(4, 36 + out.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 16000, true);
    view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); w(36, 'data'); view.setUint32(40, out.length * 2, true);
    for (let i = 0; i < out.length; i++) { const s = Math.max(-1, Math.min(1, out[i])); view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
    return new Blob([view], { type: 'audio/wav' });
  }
  function makeRecorder(onChange) {
    const r = { state: 'idle', error: null, elapsed: 0, stream: null, urls: new Set(), dead: false };
    let mr = null, iv = null;
    r.start = async ({ maxSec = 120, onDone } = {}) => {
      if (!supported()) { r.error = 'unsupported'; onChange(); return false; }
      try {
        if (!r.stream || !r.stream.getAudioTracks().some((x) => x.readyState === 'live')) r.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      } catch (e) { r.error = e?.name === 'NotAllowedError' ? 'denied' : 'failed'; onChange(); return false; }
      if (r.dead) return false;
      r.error = null;
      const mime = ['audio/webm', 'audio/mp4', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported?.(m));
      const chunks = [];
      mr = new MediaRecorder(r.stream, mime ? { mimeType: mime } : undefined);
      mr.ondataavailable = (e) => e.data?.size && chunks.push(e.data);
      const t0 = Date.now();
      mr.onstop = async () => {
        clearInterval(iv);
        if (r.dead) return;
        r.state = 'processing'; onChange();
        const durationSec = Math.round((Date.now() - t0) / 100) / 10;
        let take = null;
        try { const wav = await toWav(new Blob(chunks, { type: mr.mimeType || 'audio/webm' })); const url = URL.createObjectURL(wav); r.urls.add(url); take = { wav, url, durationSec }; }
        catch { r.error = 'failed'; }
        if (r.dead) return;
        r.state = 'idle'; r.elapsed = 0; onChange();
        onDone?.(take);
      };
      mr.start(250);
      r.state = 'recording'; r.elapsed = 0;
      iv = setInterval(() => { r.elapsed = (Date.now() - t0) / 1000; if (r.elapsed >= maxSec) r.stop(); onChange(true); }, 250);
      onChange();
      return true;
    };
    r.stop = () => { if (mr && mr.state !== 'inactive') mr.stop(); };
    r.drop = (url) => { if (url) { URL.revokeObjectURL(url); r.urls.delete(url); } };
    r.release = () => { r.dead = true; clearInterval(iv); try { if (mr && mr.state !== 'inactive') mr.stop(); } catch {} r.stream?.getTracks().forEach((x) => x.stop()); r.urls.forEach((u) => URL.revokeObjectURL(u)); r.urls.clear(); };
    return r;
  }

  // ---------- live metrics (VAD gate + speech recognition for WPM) ----------
  function makeMeter(stream) {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ac = new AC();
    const an = ac.createAnalyser(); an.fftSize = 2048;
    ac.createMediaStreamSource(stream).connect(an);
    const buf = new Float32Array(an.fftSize);
    const t0 = Date.now();
    const m = { frames: [], levels: [], hearing: false, share: null, pauses: null, wpm: null, device: (stream.getAudioTracks()[0]?.label || '').replace(/\s*\([^)]*\)\s*$/, '') };
    let nf = Infinity, peak = 0, peakAt = t0, on = false, aboveSince = null, lastAbove = 0, lastVoiced = 0, firstVoice = null;
    const iv = setInterval(() => {
      an.getFloatTimeDomainData(buf);
      let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const vol = Math.sqrt(sum / buf.length), now = Date.now();
      if (now - t0 < 500) { nf = Math.min(nf, vol); m.frames.push({ voiced: false, level: vol }); return; }
      if (!Number.isFinite(nf)) nf = 0.002;
      peak *= Math.pow(0.5, (now - peakAt) / 2500); peakAt = now;
      const onThr = Math.max(0.003, 3 * nf, 0.0316 * peak), offThr = Math.max(0.002, 1.8 * nf, 0.01995 * peak);
      if (vol > onThr) { aboveSince ??= now; if (now - aboveSince >= 60) on = true; peak = Math.max(peak, vol); } else aboveSince = null;
      if (vol > offThr) lastAbove = now;
      if (on && now - lastAbove > 280) on = false;
      if (on) { lastVoiced = now; firstVoice ??= now; }
      m.frames.push({ voiced: on, level: vol });
      const recent = m.frames.slice(-50), top = Math.max(0.02, ...recent.map((f) => f.level));
      m.levels = m.frames.slice(-22).map((f) => ({ v: f.level / top, voiced: f.voiced }));
      m.hearing = now - lastVoiced < 3000 && lastVoiced > 0;
      const fi = m.frames.findIndex((f) => f.voiced);
      if (fi >= 0) {
        const tail = m.frames.slice(fi);
        m.share = Math.round((tail.filter((f) => f.voiced).length / tail.length) * 100);
        let runs = 0, run = 0;
        for (const f of tail) { if (f.voiced) { if (run >= 20) runs++; run = 0; } else run++; }
        if (run >= 20) runs++;
        m.pauses = runs;
      }
      if (sr.words != null && firstVoice && now - firstVoice >= 10000) m.wpm = Math.round(sr.words / ((now - firstVoice) / 60000));
    }, 100);
    // WPM from the browser's speech recognition (absent → "—")
    const sr = { words: null, rec: null, short: 0, stopped: false, finals: 0, interim: 0 };
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      try {
        const rec = new SR(); sr.rec = rec;
        rec.lang = 'en-GB'; rec.continuous = true; rec.interimResults = true;
        let started = 0;
        rec.onresult = (e) => {
          let interim = 0;
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const n = e.results[i][0].transcript.trim().split(/\s+/).filter(Boolean).length;
            if (e.results[i].isFinal) sr.finals += n; else interim += n;
          }
          sr.interim = interim; sr.words = sr.finals + sr.interim;
        };
        rec.onerror = (e) => { if (['not-allowed', 'service-not-allowed', 'network', 'audio-capture'].includes(e.error)) { sr.stopped = true; sr.words = null; m.wpm = null; } };
        rec.onstart = () => { started = Date.now(); };
        rec.onend = () => {
          if (sr.stopped) return;
          sr.short = Date.now() - started < 1000 ? sr.short + 1 : 0;
          if (sr.short >= 3) { sr.stopped = true; sr.words = null; m.wpm = null; return; }
          try { rec.start(); } catch {}
        };
        rec.start();
        sr.words = 0;
      } catch { sr.words = null; }
    }
    m.stop = () => { clearInterval(iv); sr.stopped = true; try { sr.rec?.stop(); } catch {} ac.close?.(); };
    return m;
  }

  // ---------- IndexedDB cache of takes (jts-ielts-speaking/pending) ----------
  const WEEK = 604800000;
  let swept = false;
  function idb() {
    return new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('no idb'));
      const rq = indexedDB.open('jts-ielts-speaking', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('pending');
      rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
    });
  }
  async function idbDo(mode, fn) {
    const db = await idb();
    return new Promise((res, rej) => { const tx = db.transaction('pending', mode); const rq = fn(tx.objectStore('pending')); tx.oncomplete = () => { db.close(); res(rq?.result); }; tx.onerror = () => { db.close(); rej(tx.error); }; });
  }
  const Pending = {
    async save(key, val) {
      try {
        if (!swept) { swept = true; const keys = await idbDo('readonly', (s) => s.getAllKeys()); for (const k of keys || []) { const v = await idbDo('readonly', (s) => s.get(k)); if (!v || Date.now() - v.savedAt > WEEK) await idbDo('readwrite', (s) => s.delete(k)); } }
        await idbDo('readwrite', (s) => s.put(val, key));
      } catch {}
    },
    async load(key) { try { const v = await idbDo('readonly', (s) => s.get(key)); return v && Array.isArray(v.answers) && Date.now() - v.savedAt < WEEK ? v : null; } catch { return null; } },
    async drop(key) { try { await idbDo('readwrite', (s) => s.delete(key)); } catch {} },
  };

  // ---------- assess (multipart) ----------
  async function assess({ testId, mode, answers, retryAttemptId }) {
    const fd = new FormData();
    fd.append('testId', testId); fd.append('mode', mode); fd.append('uiLang', I18n.lang);
    if (retryAttemptId) fd.append('retryAttemptId', retryAttemptId);
    fd.append('items', JSON.stringify(answers.map((a) => ({ itemId: a.itemId, durationSec: a.durationSec }))));
    answers.forEach((a, i) => fd.append('audio_' + i, a.wav, `${a.itemId}.wav`));
    try {
      const res = await Api.local('/api/ielts/speaking/assess', { form: fd });
      if (retryAttemptId) Pending.drop('attempt:' + retryAttemptId);
      if (res?.attempt?.id) Pending.drop('attempt:' + res.attempt.id);
      return res;
    } catch (e) {
      const b = e?.data || {};
      e.code = b.error || (e.status === 413 ? 'too_large' : e.status === 504 || e.status === 524 ? 'timeout' : !e.status ? 'network' : e.code);
      e.attemptId = b.attemptId || null; e.debugId = b.debugId || null;
      console.warn('ielts speaking grading failed:', e.code, e.debugId || '');
      if (e.code === 'already_graded') { if (retryAttemptId) Pending.drop('attempt:' + retryAttemptId); }
      else if (e.attemptId) Pending.save('attempt:' + e.attemptId, { testId, mode, answers, savedAt: Date.now() });
      throw e;
    }
  }
  const errCode = (code, debugId) => (code || debugId) && h('small', { class: 'muted errcode', 'data-error-code': code || '', 'data-debug-id': debugId || '' },
    t('ieltsSpeaking.errorCode') + ': ', h('code', null, [code, debugId].filter(Boolean).join(' · ')));

  // ---------- cue card (HX) ----------
  function cueCard(it) {
    const bl = [...(it.bullets || [])];
    const last = bl.length && /^and\s/i.test(bl[bl.length - 1]) ? bl.pop() : null;
    return h('div', { class: 'cue stack-sm', lang: 'en' }, h('span', { class: 'badge badge--ok' }, t('ielts.term.cueCard')), h('h3', null, it.question || it.cue),
      h('p', { class: 'small muted' }, t('ielts.term.youShouldSay')), h('ul', { class: 'bul' }, bl.map((b) => h('li', null, b))), last && h('p', null, last));
  }

  // ---------- task page (HZ) ----------
  async function taskPage(p) {
    const view = p.ieltsView || 'speaking-part1';
    const { test, document: doc } = await Api.test(p.ieltsTest);
    if (doc.kind === 'shadowing') return shadowing(p, test, doc);
    const kind = doc.kind, n = partN(kind), H = HU[kind] || HU.part1;
    const items = itemsOf(doc);
    let mode = 'exam';
    const listLabel = view === 'speaking-works' ? t('ieltsSpeaking.works') : t(`ieltsLearn.speaking.p${view.slice(-1)}`);
    const modeBox = h('div', { class: 'modes', role: 'radiogroup', 'aria-label': t('ieltsReading.modeLabel') });
    const cta = h('a', { class: 'btn btn--primary btn--lg btn--block' }, t('ieltsSpeaking.start'));
    function paint() {
      put(modeBox, ['exam', 'practice'].map((m) => h('button', { type: 'button', class: 'mode', role: 'radio', 'aria-checked': String(mode === m), onclick: () => { mode = m; paint(); } },
        icon(m === 'exam' ? 'clock' : 'target'), h('span', null, h('strong', null, t('ieltsSpeaking.mode.' + m)), h('span', { class: 'xs muted' }, t('ieltsSpeaking.modeHint.' + m))))));
      cta.href = Router.href({ screen: 'ielts-speaking-run', ieltsTest: test.id, mode, backTab: 'learn', backView: view });
    }
    paint();
    const la = test.lastAttempt;
    return h('div', { class: 'stack' },
      crumbsTo(listLabel && { label: listLabel, href: learnHref(view) }, { label: test.title }),
      h('div', { class: 'split' },
        h('section', { class: 'card stack' },
          h('div', { class: 'row' }, Hub.plate('speaking', 48), h('div', { class: 'grow' }, h('h2', null, test.title), h('p', { class: 'muted small' }, `Speaking · Part ${n}`))),
          h('div', { class: 'chips' }, kind === 'part2'
            ? [h('span', { class: 'badge' }, t('ieltsSpeaking.prepMin', { n: H.prepSec / 60 })), h('span', { class: 'badge' }, t('ieltsSpeaking.talkMin', { n: H.answerSec / 60 }))]
            : [h('span', { class: 'badge' }, t('ieltsReading.questions', { n: items.length })), h('span', { class: 'badge' }, t('ieltsSpeaking.perAnswer', { n: H.answerSec }))]),
          kind === 'part2' ? cueCard(items[0] || {}) : h('p', { class: 'muted' }, t('ieltsSpeaking.partText.' + kind))),
        h('aside', { class: 'stack' },
          h('section', { class: 'card stack-sm' }, h('h3', null, t('ieltsReading.modeLabel')), modeBox, cta),
          h('section', { class: 'card card--brand stack-sm' }, h('h3', null, t('ieltsSpeaking.guideTitle', { n })),
            h('p', { class: 'small row', style: { alignItems: 'flex-start', flexWrap: 'nowrap' } }, icon('bulb', 'ic16'), h('span', null, t('ieltsSpeaking.guideHint'))),
            h('div', null, h('a', { class: 'btn btn--secondary btn--sm', href: learnHref('speaking-guide', { part: n }) }, t('ieltsSpeaking.openGuide')))),
          h('section', { class: 'card stack-sm' }, h('h3', null, t('ieltsReading.last.title')),
            la ? [h('b', null, la.band != null ? `band ${bandTxt(la.band)}` : la.status === 'failed' ? t('ieltsMock.result.cell.failed') : t('ieltsWriting.status.grading')),
              h('p', { class: 'small muted' }, DOM.date(la.finishedAt)),
              h('div', null, h('a', { class: 'btn btn--secondary btn--sm', href: learnHref('speaking-work', { ieltsWork: la.id }) }, t('ieltsWriting.openWork')))]
              : h('p', { class: 'small muted' }, t('ieltsReading.last.none'))))));
  }

  // ---------- visuals: ring (Vw), wave (Vk) ----------
  function ring(value, max, big, small, live) {
    const C = 2 * Math.PI * 70, off = C * (1 - Math.min(1, max ? value / max : 0));
    const wrap = h('div', { class: 'sring' + (live ? ' is-live' : '') });
    wrap.appendChild(DOM.svg(`<svg viewBox="0 0 160 160"><circle cx="80" cy="80" r="70" class="sring__track"/><circle cx="80" cy="80" r="70" class="sring__bar" stroke-dasharray="${C}" stroke-dashoffset="${off}" transform="rotate(-90 80 80)"/></svg>`));
    wrap.appendChild(h('div', { class: 'sring__txt' }, h('b', null, big), h('span', null, small)));
    return wrap;
  }
  const wave = (levels) => h('div', { class: 'swave', 'aria-hidden': 'true' }, Array.from({ length: 22 }, (_, i) => { const l = levels[i - (22 - levels.length)]; return h('i', { class: l?.voiced ? 'is-voiced' : null, style: { height: Math.max(10, Math.round(48 * (l?.v || 0))) + 'px' } }); }));

  // ---------- run (Vy) ----------
  Screens['ielts-speaking-run'] = {
    fullscreen: true,
    title: () => 'Speaking',
    async render(p) {
      const { test, document: doc } = await Api.test(p.ieltsTest);
      const kind = doc.kind, H = HU[kind];
      if (!H) { Router.go({ screen: 'ielts', ieltsTab: 'learn', ieltsView: kind === 'shadowing' ? 'speaking-shadowing' : 'speaking-guide', ieltsTest: kind === 'shadowing' ? test.id : null }, { replace: true }); return h('div'); }
      const W = itemsOf(doc);
      const M = p.mock; // full mock session: server deadline, answers handed to the session
      const mode = !M && p.mode === 'practice' ? 'practice' : 'exam';
      const n = partN(kind);
      const LS = `jts_ielts_sp_last_${kind}`;
      const S = { x: 'intro', idx: 0, takes: {}, prepLeft: H.prepSec || 60, notes: [], retry: null, lastDur: (() => { try { return +localStorage.getItem(LS) || null; } catch { return null; } })(),
        busy: false, err: null, retryId: null, model: undefined };
      let meter = null, prepIv = null, ttsTok = 0, gone = false, timeUp = false, sent = false;
      const back = Router.href({ screen: 'ielts', ieltsTab: p.backTab || 'learn', ieltsView: p.backView || 'speaking-' + kind, ieltsTest: test.id });
      const rec = makeRecorder((tickOnly) => (tickOnly ? tick() : paint()));
      const root = h('div', { class: 'run srun', 'data-mode': mode });
      const q = () => W[S.idx] || {};
      const ex = () => (S.x === 'followup' ? H.followUpSec : H.answerSec);

      function record(itemId, maxSec, next) {
        rec.start({ maxSec, onDone: (take) => {
          meter?.stop(); const m = meter; meter = null;
          if (take) {
            if (S.takes[itemId]) rec.drop(S.takes[itemId].url);
            S.takes[itemId] = { ...take, wpm: m?.wpm ?? null };
            S.lastDur = take.durationSec; try { localStorage.setItem(LS, String(take.durationSec)); } catch {}
            S.metrics = m && { share: m.share, pauses: m.pauses, wpm: m.wpm };
          }
          next(take);
        } }).then((ok) => {
          if (!ok) { S.retry = { itemId, maxSec, next }; paint(); return; }
          S.retry = null;
          try { meter = makeMeter(rec.stream); } catch { meter = null; }
          paint();
        });
      }
      function next() {
        if (timeUp) { S.x = 'done'; paint(); onDone(); return; }
        const it = q();
        if (kind === 'part2' && it.followUp && S.x !== 'followup') {
          S.x = 'followup'; paint();
          const tok = ++ttsTok;
          speakTts(it.followUp).then(() => { if (tok === ttsTok && !gone && S.x === 'followup') record(`${it.id}-fu`, H.followUpSec, () => { S.x = 'done'; paint(); onDone(); }); });
          return;
        }
        if (S.idx + 1 < W.length) { S.idx++; S.x = 'ask'; paint(); ask(); }
        else { S.x = 'done'; paint(); onDone(); }
      }
      const afterAnswer = () => (mode === 'exam' ? next() : (S.x = 'review', paint()));
      function ask() {
        const tok = ++ttsTok;
        speakTts(q().question).then(() => {
          if (tok !== ttsTok || gone || S.x !== 'ask') return;
          if (mode === 'exam') { S.x = 'answer'; record(q().id, H.answerSec, afterAnswer); }
        });
      }
      function answer() { ttsTok++; stopTts(); S.x = 'answer'; record(q().id, H.answerSec, afterAnswer); }
      function speak() { clearInterval(prepIv); S.x = 'answer'; record(q().id, H.answerSec, afterAnswer); }
      function begin() {
        // unlock audio on the user gesture
        try { speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch {}
        Object.values(S.takes).forEach((x) => rec.drop(x.url));
        rec.error = null; S.takes = {}; S.idx = 0; S.err = null; S.retryId = null; S.notes = [];
        if (kind === 'part2') {
          S.x = 'prep'; S.prepLeft = H.prepSec;
          const t0 = Date.now();
          prepIv = setInterval(() => { S.prepLeft = H.prepSec - Math.floor((Date.now() - t0) / 1000); if (S.prepLeft <= 0) speak(); else tick(); }, 250);
          paint();
        } else { S.x = 'ask'; paint(); ask(); }
      }
      function skip() {
        stopTts(); ttsTok++;
        if (rec.state === 'recording') rec.stop(); else if (S.x === 'prep') speak(); else next();
      }
      function onDone() {
        if (M) {
          if (sent) return;
          sent = true;
          const answers = W.filter((it) => S.takes[it.id]).map((it) => ({ itemId: it.id, durationSec: S.takes[it.id].durationSec, wav: S.takes[it.id].wav }));
          setTimeout(() => M.onRecorded(answers), 700);
          return;
        }
        if (S.model !== undefined) return;
        S.model = null;
        Api.writingModel(test.id).then((m) => { S.model = m || {}; paint(); }).catch(() => { S.model = {}; });
      }
      async function grade() {
        const answers = W.filter((it) => S.takes[it.id]).map((it) => ({ itemId: it.id, durationSec: S.takes[it.id].durationSec, wav: S.takes[it.id].wav }));
        if (!answers.length) return;
        S.busy = true; S.err = null; paint();
        try {
          const res = await assess({ testId: test.id, mode, answers, retryAttemptId: S.retryId });
          Router.go({ screen: 'ielts', ieltsTab: 'learn', ieltsView: 'speaking-work', ieltsWork: String(res.attempt.id) });
        } catch (e) {
          if (e.code === 'already_graded' && S.retryId) return Router.go({ screen: 'ielts', ieltsTab: 'learn', ieltsView: 'speaking-work', ieltsWork: String(S.retryId) });
          if (e.attemptId) S.retryId = e.attemptId;
          S.busy = false;
          S.err = { text: t('ieltsSpeaking.gradeError.' + uiCode(e.code)), code: e.code || (e.status ? `HTTP ${e.status}` : ''), debugId: e.debugId };
          paint();
        }
      }
      function close() { gone = true; rec.release(); meter?.stop(); stopTts(); clearInterval(prepIv); }
      App.onLeave(close);
      const sclock = M && MockKit.clock(M, { ceil: true, onZero: () => {
        timeUp = true; ttsTok++; stopTts(); clearInterval(prepIv);
        if (rec.state === 'recording') rec.stop(); else if (S.x !== 'done') { S.x = 'done'; paint(); onDone(); }
      } });

      // nodes refreshed by tick()
      let ringHost, waveHost, statsHost, stepsHost;
      function steps() {
        const active = S.x === 'intro' ? -1 : S.x === 'prep' ? 0 : S.x === 'followup' || S.x === 'done' ? 2 : 1;
        return h('ol', { class: 'sstep', 'aria-label': t('ieltsSpeaking.stepsLabel') }, ['prep', 'answer', 'followup'].map((k, i) => h('li', { class: i < active ? 'is-done' : i === active ? 'is-on' : null },
          h('span', { class: 'sstep__n' }, i < active ? icon('check', 'ic12') : i + 1), t('ieltsSpeaking.step.' + k) + (k === 'prep' ? ' · ' + HY(S.x === 'prep' ? S.prepLeft : H.prepSec) : ''))));
      }
      function stats() {
        const m = meter || S.metrics || {};
        const cell = (v, k) => h('div', null, h('b', null, v ?? '—'), h('span', null, t('ieltsSpeaking.metric.' + k)));
        return h('div', { class: 'srec__stats' }, cell(S.lastDur ? HY(S.lastDur) : null, 'prev'), cell(m.share != null ? `${m.share} %` : null, 'share'), cell(m.pauses, 'pauses'), cell(m.wpm, 'wpm'));
      }
      function ringNow() {
        if (S.x === 'prep') return ring(H.prepSec - S.prepLeft, H.prepSec, HY(S.prepLeft), t('ieltsSpeaking.ofTime', { time: HY(H.prepSec) }));
        const recd = rec.state === 'recording';
        return ring(recd ? rec.elapsed : 0, ex(), HY(recd ? rec.elapsed : 0), t('ieltsSpeaking.ofTime', { time: HY(ex()) }), recd);
      }
      function waveNow() {
        if (rec.state !== 'recording') return null;
        const hearing = meter?.hearing;
        return [wave(meter?.levels || []), h('span', { class: 'shear' + (hearing ? ' is-on' : '') }, icon('mic', 'ic16'), ' ',
          hearing ? (meter.device ? t('ieltsSpeaking.hearing', { device: meter.device }) : t('ieltsSpeaking.hearingShort')) : t('ieltsSpeaking.notHearing'))];
      }
      function tick() {
        if (ringHost) put(ringHost, ringNow());
        if (waveHost) put(waveHost, waveNow());
        if (statsHost) put(statsHost, stats());
        if (stepsHost) put(stepsHost, steps());
      }
      function micError() { return rec.error && h('p', { class: 'notice notice--danger', role: 'alert' }, t('ieltsSpeaking.micError.' + rec.error)); }

      function notesBox() {
        const prep = S.x === 'prep';
        const add = (v) => { v = v.trim().replace(/,$/, '').trim(); if (v) { S.notes.push(v); paint(); root.querySelector('.snotes input')?.focus(); } };
        const input = prep && h('input', { class: 'input', placeholder: t('ieltsSpeaking.notesAdd'), 'aria-label': t('ieltsSpeaking.notesAdd'),
          onkeydown: (e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(e.target.value); } }, onblur: (e) => { if (e.target.value.trim()) add(e.target.value); } });
        return h('section', { class: 'card stack-sm snotes' },
          h('header', { class: 'row row--between' }, h('b', { class: 'row', style: { gap: '6px' } }, icon('writing', 'ic16'), t('ieltsSpeaking.notes')), h('span', { class: 'xs muted' }, t('ieltsSpeaking.notesMadeIn'))),
          h('ul', { class: 'snotes__chips', lang: 'en' }, S.notes.map((x, i) => h('li', { class: 'chip' }, x, prep && h('button', { type: 'button', class: 'snotes__x', 'aria-label': t('ieltsSpeaking.removeNote'), onclick: () => { S.notes.splice(i, 1); paint(); } }, '×'))),
            prep ? h('li', { class: 'snotes__add' }, input) : !S.notes.length && h('li', { class: 'small muted' }, t('ieltsSpeaking.notesEmpty'))),
          h('p', { class: 'xs muted' }, t('ieltsSpeaking.notesFooter')));
      }
      function recCard() {
        const recd = rec.state === 'recording';
        const take = S.takes[q().id];
        ringHost = h('div', { class: 'srec__ring' }, ringNow());
        waveHost = h('div', { class: 'srec__wave' }, waveNow());
        statsHost = h('div', null, stats());
        if (S.x === 'prep') {
          return h('section', { class: 'card srec' }, h('p', { class: 'srec__status' }, t('ieltsSpeaking.prepNow')), ringHost,
            h('button', { class: 'btn btn--primary btn--lg', type: 'button', onclick: speak }, icon('mic', 'ic16'), t('ieltsSpeaking.speakNow')), statsHost);
        }
        const status = recd ? t('ieltsSpeaking.recording') : rec.state === 'processing' ? t('ieltsSpeaking.processing') : S.x === 'ask' ? t('ieltsSpeaking.listen') : t('ieltsSpeaking.ready');
        return h('section', { class: 'card srec' },
          h('p', { class: 'srec__status' + (recd ? ' is-rec' : '') }, recd && h('i', { class: 'srec__dot' }), status),
          ringHost, waveHost,
          recd && h('button', { class: 'btn btn--primary srec__stop', type: 'button', onclick: () => rec.stop() }, icon('pause', 'ic16'), t('ieltsSpeaking.stop')),
          S.x === 'review' && !recd && h('div', { class: 'stack-sm srec__review' }, take && h('audio', { controls: true, src: take.url }),
            h('div', { class: 'row', style: { justifyContent: 'center' } }, h('button', { class: 'btn btn--secondary', type: 'button', onclick: answer }, icon('refresh', 'ic16'), t('ieltsSpeaking.retake')),
              h('button', { class: 'btn btn--primary', type: 'button', onclick: next }, t('ieltsSpeaking.next')))),
          S.x === 'ask' && !recd && h('button', { class: 'btn btn--primary', type: 'button', onclick: answer }, icon('mic', 'ic16'), t('ieltsSpeaking.answer')),
          h('p', { class: 'xs muted' }, t(kind === 'part2' && S.x === 'answer' ? 'ieltsSpeaking.autoStopP2' : 'ieltsSpeaking.autoStop', { time: HY(ex()) })),
          micError(),
          S.retry && !recd && h('button', { class: 'btn btn--secondary', type: 'button', onclick: () => { const r = S.retry; S.retry = null; record(r.itemId, r.maxSec, r.next); } }, icon('mic', 'ic16'), t('ieltsSpeaking.retake')),
          statsHost);
      }
      function doneView() {
        if (M) return h('main', { class: 'srun__done' }, h('section', { class: 'card stack' }, h('h2', null, t('ieltsMock.partSaved'))));
        const canResend = S.err && S.retryId && S.err.code !== 'no_speech';
        return h('main', { class: 'srun__done' }, h('section', { class: 'card stack' },
          h('h2', null, t('ieltsSpeaking.doneTitle')), h('p', { class: 'muted' }, t('ieltsSpeaking.doneText')),
          W.map((it) => {
            const take = S.takes[it.id];
            const m = kind === 'part2' ? S.model : S.model?.questions?.[it.id];
            return h('div', { class: 'sanswer stack-sm' }, h('b', { lang: 'en' }, it.question),
              take ? h('audio', { controls: true, src: take.url }) : h('p', { class: 'small muted' }, t('ieltsSpeaking.noTake')),
              m?.text?.length > 0 && h('details', { class: 'sanswer__model' }, h('summary', null, t('ieltsSpeaking.modelAnswer') + (m.band != null ? ` · band ${m.band}` : '')), m.text.map((x) => h('p', { lang: 'en' }, x))));
          }),
          S.err && h('div', { class: 'notice notice--danger stack-sm', role: 'alert' }, h('p', null, S.err.text), canResend && h('p', { class: 'small' }, t('ieltsSpeaking.resendHint')), errCode(S.err.code, S.err.debugId)),
          h('div', { class: 'row' },
            h('button', { class: 'btn btn--secondary', type: 'button', disabled: S.busy, onclick: begin }, icon('refresh', 'ic16'), t('ieltsSpeaking.again')),
            h('button', { class: 'btn btn--primary', type: 'button', disabled: S.busy || !Object.keys(S.takes).some((k) => W.some((it) => it.id === k)), onclick: grade },
              icon('spark', 'ic16'), S.busy ? t('ieltsSpeaking.grading') : canResend ? t('ieltsSpeaking.resend') : t('ieltsWriting.gradeNow'))),
          h('p', { class: 'xs muted' }, t('ieltsSpeaking.privacy'))));
      }
      function paint() {
        if (gone) return;
        const live = S.x !== 'intro' && S.x !== 'done';
        stepsHost = kind === 'part2' ? h('div', null, steps()) : null;
        const it = q();
        put(root,
          M ? MockKit.header({ M, section: 'speaking', part: M.part || t('ielts.term.part', { n: n }), clock: sclock, extra: [stepsHost, kind !== 'part2' && live && h('span', { class: 'badge' }, t('ieltsSpeaking.qOf', { n: S.idx + 1, total: W.length })),
            live && h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: skip }, t('ieltsSpeaking.skip'))] }) :
          h('header', { class: 'runbar srun__top' },
            h('a', { class: 'icon-btn', href: back, 'aria-label': t('common.close') }, icon('close')),
            h('span', { class: 'runbar__title' }, h('b', null, `Speaking · Part ${n}`), h('span', { class: 'small muted' }, ` ${t('ieltsSpeaking.mode.' + mode)} · ${test.title}`)),
            h('span', { class: 'grow' }),
            stepsHost,
            kind !== 'part2' && live && h('span', { class: 'badge' }, t('ieltsSpeaking.qOf', { n: S.idx + 1, total: W.length })),
            live && h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: skip }, t('ieltsSpeaking.skip'))),
          S.x === 'intro' && h('main', { class: 'srun__intro' }, h('section', { class: 'card stack' },
            h('h2', null, t('ieltsSpeaking.introTitle.' + kind)), h('p', null, t('ieltsSpeaking.intro.' + kind, { n: W.length })),
            h('p', { class: 'small muted' }, t('ieltsSpeaking.privacy')), micError(),
            h('div', null, h('button', { class: 'btn btn--primary btn--lg', type: 'button', onclick: begin }, icon('mic', 'ic16'), t('ieltsSpeaking.begin'))))),
          live && h('main', { class: 'srun__body' },
            h('div', { class: 'srun__left stack' },
              kind === 'part2' ? h('section', { class: 'card' }, cueCard(it))
                : h('section', { class: 'card stack-sm srun__q', lang: 'en' }, h('span', { class: 'badge badge--ok' }, t('ieltsSpeaking.examiner')), h('h3', null, it.question),
                  h('div', null, h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => { if (S.x === 'ask') ask(); else speakTts(it.question); } }, icon('volume', 'ic16'), t('ieltsSpeaking.repeatQ')))),
              S.x === 'followup' && h('section', { class: 'card stack-sm srun__q', lang: 'en' }, h('span', { class: 'badge badge--ok' }, t('ieltsSpeaking.step.followup')), h('h3', null, it.followUp)),
              kind === 'part2' && notesBox()),
            recCard()),
          S.x === 'done' && doneView());
      }
      paint();
      return root;
    },
  };

  // ---------- review (H1) ----------
  Screens['learn:speaking-work'] = {
    async render(p) {
      const id = p.ieltsWork;
      const st = { busy: false, err: null, pending: null };
      let view = await Api.attempt(id);
      const model = await Api.writingModel(view.testId).catch(() => null);
      const root = h('div', { class: 'stack wwork' });
      async function loadPending() { st.pending = view.result?.status === 'failed' ? await Pending.load('attempt:' + id) : null; }
      await loadPending();
      async function resend() {
        const pd = st.pending;
        st.busy = true; st.err = null; paint();
        try {
          const res = await assess({ testId: pd.testId || view.testId, mode: pd.mode || view.attempt?.mode || 'exam', answers: pd.answers, retryAttemptId: id });
          if (res?.attempt?.id && String(res.attempt.id) !== String(id)) return Router.patch({ ieltsWork: String(res.attempt.id) });
        } catch (e) { if (e.code !== 'already_graded') st.err = e; }
        st.busy = false;
        if (!st.err) { st.pending = null; view = await Api.attempt(id); await loadPending(); }
        paint();
      }
      function paint() {
        const doc = view.document || {}, r = view.result || {}, a = view.attempt || {};
        const items = itemsOf(doc).filter((it) => (r.items || []).some((x) => x.itemId === it.id));
        const fr = String(r.failReason || '');
        const canResend = !!st.pending && !fr.startsWith('no_speech');
        const done = r.status === 'done';
        const grading = st.busy || r.status === 'grading' || r.status === 'pending_ai';
        const retry = learnHref('speaking-works', { ieltsTest: view.testId });
        put(root,
          crumbsTo({ label: t('ieltsSpeaking.works'), href: learnHref('speaking-works') }),
          h('header', { class: 'ph' }, h('h1', { class: 'ph__title' }, doc.title || 'Speaking'), h('p', { class: 'ph__sub muted' }, [`Speaking · Part ${partN(doc.kind)}`, DOM.date(a.finishedAt)].filter(Boolean).join(' · '))),
          done ? h('section', { class: 'card wscore' },
            h('div', { class: 'wscore__band' }, h('span', null, t('ieltsWriting.band')), h('b', null, bandTxt(a.band))),
            h('div', { class: 'wscore__crit' }, CRIT.map(([c, s]) => h('div', null, h('b', null, bandTxt(r.criteria?.[c])), h('span', null, t('ieltsSpeaking.p.crit.' + s))))),
            r.criteria && r.criteria.pronunciation == null && h('p', { class: 'wscore__fb small muted' }, icon('about', 'ic16'), ' ', t('ieltsSpeaking.noPron')),
            r.feedback && h('p', { class: 'wscore__fb' }, r.feedback),
            h('div', { class: 'row' }, h('a', { class: 'btn btn--primary', href: retry }, t('ieltsSpeaking.again'))))
            : h('section', { class: 'card wstatus is-bad', role: 'status' },
              h('span', { class: 'wstatus__ic' }, icon('mic')),
              h('div', { class: 'grow stack-sm' },
                h('b', null, grading ? t('ieltsWriting.gradingTitle') : t('ieltsSpeaking.failedTitle')),
                h('p', { class: 'small' }, grading ? t('ieltsWriting.gradingText') : canResend ? t('ieltsSpeaking.failedTextResend') : t('ieltsSpeaking.failedText')),
                st.err && h('p', { class: 'error' }, t('ieltsSpeaking.gradeError.' + uiCode(st.err.code))),
                r.status === 'failed' && errCode(st.err?.code || fr.split(' · ')[0], st.err?.debugId || fr.split(' · ')[1]),
                h('div', { class: 'row' },
                  canResend && h('button', { class: 'btn btn--primary', type: 'button', disabled: st.busy, onclick: resend }, icon('spark', 'ic16'), st.busy ? t('ieltsSpeaking.grading') : t('ieltsSpeaking.resend')),
                  h('a', { class: 'btn btn--secondary', href: retry }, t('ieltsSpeaking.again'))))),
          (r.strengths?.length || r.improvements?.length) && h('div', { class: 'wwork__grid' },
            h('section', { class: 'card stack-sm slist is-good' }, h('h3', null, t('ieltsSpeaking.strengths')), h('ul', { class: 'bul' }, (r.strengths || []).map((s) => h('li', null, s)))),
            h('section', { class: 'card stack-sm slist' }, h('h3', null, t('ieltsSpeaking.improvements')), h('ul', { class: 'bul' }, (r.improvements || []).map((s) => h('li', null, s))))),
          items.length > 0 && h('section', { class: 'card stack sanswers' },
            h('header', { class: 'row row--between' }, h('h3', null, t('ieltsSpeaking.yourAnswers')), h('span', { class: 'small muted' }, DOM.date(a.finishedAt))),
            items.map((it) => {
              const x = r.items.find((y) => y.itemId === it.id);
              const m = doc.kind === 'part2' ? model : model?.questions?.[it.id];
              const an = m?.analysis || {};
              return h('div', { class: 'sanswer stack-sm' }, h('b', { lang: 'en' }, it.question),
                h('div', { class: 'chips' }, h('span', { class: 'badge' }, icon('clock', 'ic12'), ' ', HY(x.durationSec)), x.wpm != null && h('span', { class: 'badge' }, t('ieltsSpeaking.wpm', { n: x.wpm }))),
                h('p', { class: 'sanswer__text', lang: 'en' }, x.transcript || t('ieltsSpeaking.noSpeech')),
                x.skipped && h('p', { class: 'small muted' }, t('ieltsSpeaking.skippedAnswer')),
                m?.text?.length > 0 && h('details', { class: 'sanswer__model' }, h('summary', null, t('ieltsSpeaking.modelAnswer') + (m.band != null ? ` · band ${m.band}` : '')),
                  m.text.map((y) => h('p', { lang: 'en' }, y)),
                  (an.tips || []).map((tp) => h('div', { class: 'sanswer__tip' }, h('b', null, loc(tp.title)), h('p', { class: 'small' }, loc(tp.tip || tp)), tp.example && h('p', { class: 'small muted', lang: 'en' }, `«${tp.example}»`))),
                  (an.paragraphs || []).map((pa) => h('p', { class: 'wmine__note small' }, icon('about', 'ic16'), h('span', null, `${t('ieltsSpeaking.p.role.' + pa.role) || pa.role}: ${loc(pa.note)}`)))));
            })));
      }
      paint();
      return root;
    },
  };

  // ---------- guide «Как отвечать в Part N» (H2) ----------
  Screens['learn:speaking-guide'] = {
    async render(p) {
      let doc;
      const head = crumbsTo({ label: t('ieltsSpeaking.strategy') });
      try { doc = (await Api.test('SP-GUIDE')).document; } catch (e) { return h('div', { class: 'stack' }, head, DOM.errorBox(e, () => App.render())); }
      let part = [1, 2, 3].includes(+p.part) ? +p.part : 1;
      const host = h('div', { class: 'stack practice' });
      function paint() {
        const pt = (doc?.parts || []).find((x) => +x.part === part);
        put(host, head, Hub.pageHead({ title: t('ieltsSpeaking.guideTitle', { n: part }) }),
          Hub.seg([1, 2, 3].map((k) => [String(k), t('ielts.term.part', { n: k })]), String(part), (v) => { part = +v; paint(); }, { small: true }),
          !pt ? Hub.empty({ icon: 'clock', title: t('ieltsWriting.p.guide.partSoon.title') })
            : [pt.lead && h('section', { class: 'card card--brand wguide__rules' }, h('p', null, loc(pt.lead))),
              (pt.blocks || []).map((b) => h('section', { class: 'card stack-sm' }, h('h3', null, loc(b.title)),
                h('ul', { class: 'bul' }, (b.items || []).map((x) => h('li', null, loc(x)))),
                b.example && h('div', { class: 'sguide__ex' }, h('span', { class: 'xs muted' }, t('ieltsSpeaking.p.guide.example')), h('p', { lang: 'en' }, typeof b.example === 'string' ? b.example : b.example.en || loc(b.example)))))]);
      }
      paint();
      return host;
    },
  };

  // ---------- shadowing (H3) ----------
  function shadowing(p, test, doc) {
    const phrases = doc.phrases || [];
    const st = { speed: 1, playing: null, recorded: {}, recId: null };
    const root = h('div', { class: 'stack shadow' });
    let player = null;
    const rec = makeRecorder((tickOnly) => { if (!tickOnly) paint(); });
    App.onLeave(() => { rec.release(); player?.pause(); stopTts(); });
    function stopPlay() { player?.pause(); player = null; stopTts(); st.playing = null; }
    function listen(ph) {
      stopPlay(); st.playing = ph.id; paint();
      const done = () => { if (st.playing === ph.id) { st.playing = null; paint(); } };
      if (ph.audio?.url) { player = new Audio(ph.audio.url); player.playbackRate = st.speed; player.onended = done; player.play().catch(done); }
      else speakTts(ph.groups.join(' '), { speed: st.speed < 1 ? 0.8 : 1 }).then(done);
    }
    function recordPh(ph) {
      if (rec.state === 'recording') { rec.stop(); return; }
      stopPlay();
      st.recId = ph.id;
      rec.start({ maxSec: Math.ceil(2 * (ph.audio?.durationSec || 6) + 3), onDone: (take) => { if (take) { if (st.recorded[ph.id]) rec.drop(st.recorded[ph.id].url); st.recorded[ph.id] = take; } st.recId = null; paint(); } })
        .then((ok) => { if (!ok) { st.recId = null; paint(); } });
    }
    function mine(ph) { stopPlay(); const tk = st.recorded[ph.id]; if (!tk) return; st.playing = 'mine:' + ph.id; paint(); player = new Audio(tk.url); player.onended = () => { st.playing = null; paint(); }; player.play().catch(() => {}); }
    function tour() {
      DOM.dialog((close) => h('div', { class: 'stack' }, h('h2', null, t('tour.help')),
        ['how', 'listen', 'rec', 'compare', 'speed'].map((k) => h('div', null, h('b', null, t(`ieltsSpeaking.shTour.${k}.title`)), h('p', { class: 'small muted' }, t(`ieltsSpeaking.shTour.${k}.text`)))),
        h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn btn--primary', type: 'button', onclick: close }, t('common.close')))));
    }
    function paint() {
      const n = Object.keys(st.recorded).length;
      const current = phrases.find((x) => !st.recorded[x.id])?.id;
      const recording = rec.state === 'recording';
      put(root,
        h('header', { class: 'card row shadow__bar0' },
          h('span', { class: 'runbar__title' }, h('b', null, 'Speaking · Shadowing'), ' ', h('span', { class: 'badge' }, t('ieltsReading.modeChip', { mode: t('ieltsReading.mode.practice').toLowerCase() }))),
          h('span', { class: 'grow' }),
          h('button', { class: 'icon-btn', type: 'button', title: t('tour.help'), 'aria-label': t('tour.help'), onclick: tour }, h('b', null, '?')),
          h('a', { class: 'btn btn--secondary btn--sm', href: learnHref('speaking-shadowing') }, t('ieltsReading.back'))),
        h('header', { class: 'ph' }, h('h1', { class: 'ph__title' }, test.title), h('p', { class: 'ph__sub muted' }, t('ieltsSpeaking.shadowText'))),
        h('ol', { class: 'card shadow__how' }, ['listen', 'rec', 'compare'].map((k, i) => h('li', null, h('span', { class: 'wdet__n' }, i + 1), h('div', null, h('b', null, t(`ieltsSpeaking.shHow.${k}.title`)), h('p', { class: 'small muted' }, t(`ieltsSpeaking.shHow.${k}.text`)))))),
        h('div', { class: 'shadow__bar' },
          h('div', { class: 'grow stack-sm' }, h('span', { class: 'small' }, t('ieltsSpeaking.shadowProgress', { n, total: phrases.length })),
            h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': phrases.length, 'aria-valuenow': n }, h('i', { style: { width: (phrases.length ? (n / phrases.length) * 100 : 0) + '%' } }))),
          h('div', { class: 'row', style: { gap: '8px' } }, h('span', { class: 'small muted' }, t('ieltsSpeaking.p.sha.speed')),
            Hub.seg([['1', '1×'], ['0.75', '0.75×']], String(st.speed), (v) => { st.speed = +v; paint(); }, { small: true }))),
        h('p', { class: 'xs muted' }, t('ieltsSpeaking.privacyLocal')),
        rec.error && h('p', { class: 'notice notice--danger', role: 'alert' }, t('ieltsSpeaking.micError.' + rec.error)),
        phrases.map((ph, i) => {
          const done = !!st.recorded[ph.id], recThis = recording && st.recId === ph.id;
          return h('section', { class: 'card shadow__phrase' + (done ? ' is-done' : '') + (ph.id === current ? ' is-current' : '') + (st.playing === ph.id ? ' is-playing' : '') },
            h('span', { class: 'shadow__n' }, done ? icon('check', 'ic16') : i + 1),
            h('div', { class: 'grow stack-sm' },
              h('p', { class: 'shadow__text', lang: 'en' }, ph.groups.map((g, gi) => [gi > 0 && h('span', { class: 'shadow__sep', 'aria-hidden': 'true' }, ' / '), h('span', { class: 'shadow__group' }, g)])),
              h('div', { class: 'row shadow__steps' },
                h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => listen(ph) }, icon('volume', 'ic16'), t('ieltsSpeaking.listenSpeaker')),
                h('button', { class: 'btn btn--sm ' + (recThis ? 'btn--danger' : 'btn--primary'), type: 'button', disabled: recording && !recThis, onclick: () => recordPh(ph) },
                  icon(recThis ? 'stop' : 'mic', 'ic16'), recThis ? t('ieltsSpeaking.stop') : done ? t('ieltsSpeaking.shAgain') : t('ieltsSpeaking.repeatAfter')),
                h('button', { class: 'btn btn--ghost btn--sm', type: 'button', disabled: !done, title: done ? null : t('ieltsSpeaking.shMineHint'), onclick: () => mine(ph) }, icon('play', 'ic16'), t('ieltsSpeaking.myTake')))));
        }),
        phrases.length > 0 && n === phrases.length && h('section', { class: 'card card--brand shadow__finish row' },
          h('div', { class: 'grow' }, h('b', null, t('ieltsSpeaking.shFinish.title')), h('p', { class: 'small' }, t('ieltsSpeaking.shFinish.text'))),
          h('a', { class: 'btn btn--primary', href: learnHref('speaking-shadowing') }, t('ieltsSpeaking.shFinish.back'))));
    }
    paint();
    return root;
  }

  Screens['learn:speaking-task'] = { render: (p) => taskPage(p) };
  window.Speaking = { speakTts, stopTts, makeRecorder, toWav, assess, Pending, cueCard, itemsOf };
})();
