// Registration (lang → name/birth → contacts → OTP → password → done), login by code,
// IELTS locked state (no access yet) and IELTS pricing — ai-tutor's rg.* flow on the
// same public endpoints (/registration/*, /auth/otp/*). The Dexter mascot is replaced by
// the brand mark; Google sign-in is not offered (needs ai-tutor's OAuth client).
(function () {
  const { h, icon } = DOM;
  const put = (el, ...k) => el.replaceChildren(...k.flat(9).filter((x) => x != null && x !== false && x !== ''));
  const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());
  const digits = (s) => String(s || '').replace(/\D/g, '');
  const ident = (id) => { id = String(id).trim(); if (isEmail(id)) return { email: id.toLowerCase() }; let d = digits(id); if (d.length === 11 && d[0] === '8') d = '7' + d.slice(1); if (d.length === 10) d = '7' + d; return { phone: d }; };
  const fmtPhone = (d) => { d = digits(d); const m = d.match(/^7(\d{3})(\d{3})(\d{2})(\d{2})$/); return m ? `+7 (${m[1]}) ${m[2]}-${m[3]}-${m[4]}` : '+' + d; };
  const errMsg = (e, fb) => e?.serverMessage || (e?.message && !/^Ошибка сервера/.test(e.message) ? e.message : '') || t(fb);
  const home = () => { State.me = null; Router.go({ screen: 'ielts' }, { replace: true }); };

  // ---------- shared widgets ----------
  function card({ back, step, title, sub, body, actions, onSubmit, footer }) {
    const form = h('form', { class: 'auth__card stack rg', novalidate: true, onsubmit: (e) => { e.preventDefault(); onSubmit?.(); } },
      (back || step) && h('div', { class: 'row row--between' }, back ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: back }, icon('arrowL', 'ic16'), t('rg.back')) : h('span'),
        step && h('span', { class: 'xs muted' }, t('rg.step', { n: step[0], total: step[1] }))),
      h('h2', { class: 'rg__title' }, title), sub && h('p', { class: 'muted small' }, sub), body, actions, footer);
    return form;
  }
  function field({ id, label, hint, error, input }) {
    if (error) input.classList.add('is-invalid'); else input.classList.remove('is-invalid');
    input.setAttribute('aria-invalid', error ? 'true' : 'false');
    input.setAttribute('aria-describedby', id + '-msg');
    return h('div', { class: 'field' }, h('label', { for: id }, label), input,
      (error || hint) && h('p', { id: id + '-msg', class: error ? 'error' : 'xs muted', role: error ? 'alert' : null }, error || hint));
  }
  const submitBtn = (label, { busy, busyLabel, disabled, arrow = true } = {}) =>
    h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'submit', disabled: !!(busy || disabled) }, busy ? busyLabel || label : label, !busy && arrow && icon('arrowR', 'ic16'));
  const sw = (q, label, onclick) => h('p', { class: 'small rg__switch' }, q, ' ', h('button', { class: 'link', type: 'button', onclick }, label));
  function input(attrs, value, onInput) {
    const el = h('input', { class: 'input', ...attrs });
    el.value = value || '';
    el.addEventListener('input', () => onInput(el.value));
    return el;
  }
  // keeps focus/caret across repaints of the same form
  function keepFocus(host, fn) {
    const a = document.activeElement, id = host.contains(a) ? a.id : null, pos = id && a.selectionStart;
    fn();
    if (id) { const el = host.querySelector('#' + CSS.escape(id)); if (el) { el.focus(); try { if (pos != null) el.setSelectionRange(pos, pos); } catch {} } }
  }

  // birth date dd . mm . yyyy (+ native date picker)
  // parts = {d, m, y} as typed; onChange(parts, iso|'partial'|'')
  function dobInput(parts, onChange, invalid) {
    const cells = [['day', 2, parts.d], ['month', 2, parts.m], ['year', 4, parts.y]].map(([k, len, v], i) => h('input', { class: 'input dob__cell', id: i === 0 ? 'rg-birth' : 'rg-birth-' + k, inputmode: 'numeric', maxlength: len,
      placeholder: t('dob.' + k), 'aria-label': t('dob.' + k), value: v, 'aria-invalid': invalid ? 'true' : 'false' }));
    const emit = () => { const [dd, mm, yy] = cells.map((c) => c.value); onChange({ d: dd, m: mm, y: yy }, dd.length === 2 && mm.length === 2 && yy.length === 4 ? `${yy}-${mm}-${dd}` : dd || mm || yy ? 'partial' : ''); };
    cells.forEach((c, i) => {
      c.addEventListener('input', () => {
        let v = digits(c.value); const len = +c.maxLength;
        if (v.length > len && cells[i + 1]) { cells[i + 1].value = v.slice(len) + cells[i + 1].value; v = v.slice(0, len); cells[i + 1].focus(); }
        c.value = v; if (v.length === len && cells[i + 1] && document.activeElement === c) cells[i + 1].focus();
        emit();
      });
      c.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !c.value && cells[i - 1]) cells[i - 1].focus(); });
    });
    const now = new Date(), ymd = (yy) => `${now.getFullYear() - yy}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const picker = h('input', { type: 'date', class: 'dob__native', tabindex: '-1', 'aria-hidden': 'true', min: ymd(101), max: ymd(6), onchange: (e) => { const [yy, mm, dd] = e.target.value.split('-'); if (yy) { cells[0].value = dd; cells[1].value = mm; cells[2].value = yy; emit(); } } });
    return h('div', { class: 'dob' }, cells[0], h('span', { 'aria-hidden': 'true' }, '.'), cells[1], h('span', { 'aria-hidden': 'true' }, '.'), cells[2],
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('dob.pick'), title: t('dob.pick'), onclick: () => { try { picker.showPicker(); } catch { picker.click(); } } }, icon('calendar')), picker);
  }
  function birthError(v) {
    if (!v) return t('rg.birth.required');
    if (v === 'partial') return t('regbirth.invalid');
    const [y, m, d] = v.split('-').map(Number), dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return t('regbirth.invalid');
    const now = new Date(); let age = now.getFullYear() - y; if (now < new Date(now.getFullYear(), m - 1, d)) age--;
    if (age < 0) return t('regbirth.invalid');
    if (age < 6) return t('regbirth.tooYoung');
    if (age > 100) return t('regbirth.tooOld');
    return '';
  }
  // Phone countries come from config; names from Intl in the UI language, "other" from i18n.
  function countryName(c) {
    if (!c.dial) return t('rg.phone.other');
    // Some engines ship no region names for a locale (kk) and answer in English — then use the base language.
    const names = (loc) => { try { return new Intl.DisplayNames([loc], { type: 'region' }); } catch { return null; } };
    const cur = names(DOM.locale()), en = names('en'), base = names(IELTS_CONFIG.locales[IELTS_CONFIG.langs[0]]);
    const one = (r) => { const n = cur?.of(r); return n && (I18n.lang === 'en' || n !== en?.of(r)) ? n : base?.of(r) || n || r; };
    return (c.regions || [c.id]).map(one).join(' / ');
  }
  const COUNTRIES = IELTS_CONFIG.phoneCountries;
  const maskPhone = (dial, d) => (dial === '7' ? d.replace(/^(\d{0,3})(\d{0,3})(\d{0,2})(\d{0,2}).*/, (_, a, b, c, e) => [a && `(${a}${a.length === 3 ? ')' : ''}`, b && ' ' + b, c && '-' + c, e && '-' + e].filter(Boolean).join('')) : d.replace(/(\d{3})(?=\d)/g, '$1 '));

  // OTP: 4 cells, paste, auto-advance, auto-submit
  function otpCells(onDone, disabled) {
    const cells = [0, 1, 2, 3].map((i) => h('input', { class: 'input otp__cell', inputmode: 'numeric', maxlength: 1, autocomplete: i === 0 ? 'one-time-code' : 'off', 'aria-label': t('rg.code.digit', { n: i + 1 }), disabled }));
    const val = () => cells.map((c) => c.value).join('');
    const check = () => { if (val().length === 4) onDone(val()); };
    cells.forEach((c, i) => {
      c.addEventListener('input', () => {
        const v = digits(c.value);
        if (v.length > 1) { v.split('').slice(0, 4 - i).forEach((ch, k) => { cells[i + k].value = ch; }); cells[Math.min(3, i + v.length - 1)].focus(); }
        else { c.value = v; if (v && cells[i + 1]) cells[i + 1].focus(); }
        check();
      });
      c.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !c.value && cells[i - 1]) { cells[i - 1].focus(); cells[i - 1].value = ''; } });
    });
    const box = h('div', { class: 'otp' }, cells);
    box.reset = () => { cells.forEach((c) => { c.value = ''; }); box.classList.remove('is-shake'); void box.offsetWidth; box.classList.add('is-shake'); cells[0].focus(); };
    setTimeout(() => cells[0].focus());
    return box;
  }
  function saveSession(res) {
    const tok = res?.accessToken || res?.token;
    if (!tok) throw new Error(t('login.failed'));
    if (Demo.on) return; // demo fixtures: keep the demo session
    Api.Auth.set(tok);
    try { if (res.refreshToken) localStorage.setItem('ielts_refresh_token', res.refreshToken); } catch {}
    Demo.set(false);
  }

  // ---------- OTP step (shared) ----------
  function otpView(host, { mode, to, step, onBack, onVerified, resend, verify }) {
    let left = 60, busy = false, err = '', iv = null;
    App.onLeave(() => clearInterval(iv));
    const tick = () => { iv = setInterval(() => { left--; paintResend(); if (left <= 0) clearInterval(iv); }, 1000); };
    const resendHost = h('div');
    function paintResend() {
      put(resendHost, left > 0 ? h('p', { class: 'small muted' }, t('rg.code.resendIn', { time: DOM.mmss(left) }))
        : h('button', { class: 'link small', type: 'button', onclick: async () => {
          try { await resend(); left = 60; err = ''; paintResend(); tick(); } catch (e) { err = errMsg(e, 'rg.code.resendFail'); paint(); }
        } }, t('rg.code.resend')));
    }
    let cells;
    async function done(code) {
      if (busy) return;
      busy = true; err = ''; paintNote();
      try { const res = await verify(code); saveSession(res); onVerified(res); }
      catch (e) {
        busy = false;
        const m = e?.serverMessage || e?.message || '';
        err = /exist|уже есть|уже существует|duplicate|unique/i.test(m) ? t('err.userExists') : /invalid|expired|неверн/i.test(m) || e?.status === 400 ? t('err.otp') : m || t('err.otp');
        paintNote(); cells.reset();
      }
    }
    const note = h('div');
    const paintNote = () => put(note, err && h('p', { class: 'error', role: 'alert' }, err), h('p', { class: 'xs muted' }, busy ? t('otp.checking') : t('rg.code.auto')));
    function paint() {
      cells = otpCells(done);
      const email = isEmail(to);
      put(host, card({ back: onBack, step, title: mode === 'login' ? t('rg.code.titleLogin') : t(email ? 'rg.code.titleEmail' : 'rg.code.titlePhone'),
        sub: [t(email ? 'rg.code.sentEmail' : 'rg.code.sentSms', { to: email ? to : fmtPhone(to) }), ' ', h('button', { class: 'link', type: 'button', onclick: onBack }, t('rg.code.change'))],
        body: [cells, note, resendHost] }));
      paintNote(); paintResend();
    }
    paint(); tick();
  }

  function success(host, { registered }) {
    put(host, h('div', { class: 'auth__card stack rg rg--done' }, h('div', { class: 'brand__mark auth__mark rg__avatar' }, DOM.svg(DOM.BRAND)),
      h('h2', { class: 'rg__title' }, t(registered ? 'rg.done.title' : 'rg.welcome.title')), h('p', { class: 'muted' }, t(registered ? 'rg.done.sub' : 'rg.welcome.sub')),
      registered && h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'button', onclick: home }, t('rg.continue'), icon('arrowR', 'ic16'))));
    if (!registered) setTimeout(home, 1200);
  }

  // ---------- registration ----------
  Screens.register = {
    fullscreen: true,
    title: () => t('rg.register'),
    render(p) {
      const host = h('div');
      const st = { name: '', birth: '', dob: { d: '', m: '', y: '' }, email: '', phone: '', cc: IELTS_CONFIG.defaultCountry, tried: false, busy: false, err: '', errField: null, pass: '', pass2: '' };
      const toLogin = () => Router.go({ screen: 'login' });
      function lang() {
        put(host, card({ title: t('rg.lang.title'), sub: t('rg.lang.sub'), body: h('div', { class: 'stack-sm', role: 'radiogroup' },
          I18n.langs.map((v) => [v, I18n.nameOf(v)]).map(([v, l]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(I18n.lang === v), class: 'obopt' + (I18n.lang === v ? ' is-on' : ''),
            onclick: () => { if (v === I18n.lang) return name(); Router.go({ screen: 'register', step: 'name' }, { replace: true }); I18n.setLang(v); } }, h('span', { class: 'obopt__body' }, h('b', null, l)), h('span', { class: 'obopt__radio', 'aria-hidden': 'true' })))),
          footer: sw(t('rg.haveAccount'), t('rg.signIn'), toLogin) }));
      }
      function name() {
        const nameErr = st.tried && !st.name.trim() ? t('rg.name.required') : '';
        const bErr = st.tried || st.birth.length === 10 ? birthError(st.birth) : '';
        keepFocus(host, () => put(host, card({ back: lang, step: [1, 4], title: t('rg.name.title'), sub: t('rg.name.sub'),
          body: [h('div', { class: 'rg__bubble' }, h('span', { class: 'brand__mark' }, DOM.svg(DOM.BRAND)), h('div', null, h('b', { class: 'xs' }, t('rg.dexter.who')), h('p', { class: 'small' }, t('rg.dexter.hello')))),
            field({ id: 'rg-name', label: t('rg.name.label'), error: nameErr, input: input({ id: 'rg-name', maxlength: 100, autocomplete: 'given-name', placeholder: t('rg.name.placeholder') }, st.name, (v) => { st.name = v; if (st.tried) name(); }) }),
            h('div', { class: 'field' }, h('label', { for: 'rg-birth' }, t('regbirth.label')), dobInput(st.dob, (parts, v) => { const was = st.birth; st.dob = parts; st.birth = v; if (v.length === 10 || was.length === 10 || (st.tried && !v)) name(); }, !!bErr),
              h('p', { class: bErr ? 'error' : 'xs muted', role: bErr ? 'alert' : null }, bErr || t('rg.birth.hint')))],
          actions: submitBtn(t('rg.continue')),
          onSubmit: () => { st.tried = true; if (st.name.trim() && !birthError(st.birth)) { st.tried = false; contacts(); } else name(); },
          footer: sw(t('rg.haveAccount'), t('rg.signIn'), toLogin) })));
      }
      function contacts() {
        const C = COUNTRIES.find((c) => c.id === st.cc) || COUNTRIES[0], d = digits(st.phone);
        const eErr = st.errField === 'email' ? [t('rg.email.taken'), ' ', h('button', { class: 'link', type: 'button', onclick: toLogin }, t('rg.signIn'))] : st.tried && !isEmail(st.email) ? t('rg.email.invalid') : '';
        const pErr = st.errField === 'phone' ? t('rg.phone.taken') : st.tried && (d.length < C.min || d.length > C.max) ? t('regphone.invalid') : '';
        const phoneIn = input({ id: 'rg-phone', inputmode: 'tel', autocomplete: 'tel-national', placeholder: C.dial === '7' ? t('rg.phone.placeholder') : '' }, maskPhone(C.dial, d), (v) => {
          st.phone = digits(v).slice(0, C.max); st.errField = st.errField === 'phone' ? null : st.errField; phoneIn.value = maskPhone(C.dial, st.phone); if (st.tried) contacts(); });
        keepFocus(host, () => put(host, card({ back: name, step: [2, 4], title: t('rg.contacts.title'), sub: t('rg.contacts.sub'),
          body: [field({ id: 'rg-email', label: t('rg.email.label'), hint: t('rg.email.hint'), error: eErr, input: input({ id: 'rg-email', type: 'email', inputmode: 'email', autocomplete: 'email', placeholder: 'name@mail.com', autocapitalize: 'none' }, st.email, (v) => { st.email = v; if (st.errField === 'email') st.errField = null; if (st.tried) contacts(); }) }),
            h('div', { class: 'field' }, h('label', { for: 'rg-phone' }, t('rg.phone.label')),
              h('div', { class: 'rg__phone' }, h('select', { class: 'input', 'aria-label': t('rg.phone.country'), onchange: (e) => { st.cc = e.target.value; contacts(); } },
                COUNTRIES.map((c) => h('option', { value: c.id, selected: c.id === st.cc }, `${countryName(c)}${c.dial ? ' +' + c.dial : ''}`))), phoneIn),
              h('p', { class: pErr ? 'error' : 'xs muted', role: pErr ? 'alert' : null }, pErr || t('rg.phone.hint'))),
            st.err && h('p', { class: 'error', role: 'alert' }, st.err)],
          actions: [submitBtn(t('rg.continue'), { busy: st.busy, busyLabel: t('rg.sending') }),
            h('p', { class: 'xs muted' }, t('rg.consent'), h('a', { class: 'link', href: IELTS_CONFIG.privacyUrl, target: '_blank', rel: 'noopener' }, t('rg.privacy')))],
          onSubmit: async () => {
            st.tried = true; st.err = '';
            const d = digits(st.phone); // fresh: the phone field updates st without repainting
            if (!isEmail(st.email) || d.length < C.min || d.length > C.max) return contacts();
            st.busy = true; contacts();
            const body = { name: st.name.trim() || t('rg.name.guest'), phone: C.dial + d, email: st.email.trim().toLowerCase(), birthDate: st.birth };
            try { await Api.registrationInitiate(body); st.busy = false; st.tried = false; otp(body); }
            catch (e) {
              st.busy = false; const m = e?.serverMessage || e?.message || '';
              if (/exist|уже есть|уже существует|duplicate|idx_users_email|idx_users_phone|unique constraint/i.test(m)) st.errField = /почт|email/i.test(m) ? 'email' : /телефон|phone/i.test(m) ? 'phone' : null, st.err = st.errField ? '' : t('err.userExists');
              else st.err = errMsg(e, 'err.send');
              contacts();
            }
          } })));
      }
      function otp(body) {
        otpView(host, { mode: 'register', to: body.email, step: [3, 4], onBack: contacts, resend: () => Api.registrationInitiate(body),
          verify: (code) => Api.registrationVerify({ ...body, otp: code }), onVerified: () => password() });
      }
      function password() {
        const short = st.pass.length < 6, mism = st.pass2 && (st.tried || st.pass2.length >= st.pass.length) && st.pass2 !== st.pass;
        const pw = AuthUI.passwordField('rg-pass'), pw2 = AuthUI.passwordField('rg-pass2');
        pw.input.value = st.pass; pw2.input.value = st.pass2;
        pw.input.addEventListener('input', () => { st.pass = pw.input.value; password(); });
        pw2.input.addEventListener('input', () => { st.pass2 = pw2.input.value; password(); });
        keepFocus(host, () => put(host, card({ step: [4, 4], title: t('rg.pass.title'), sub: t('setpass.subtitle'),
          body: [h('div', { class: 'field' }, h('label', { for: 'rg-pass' }, t('rg.pass.label')), pw.node, h('p', { class: st.tried && short ? 'error' : 'xs muted' }, t('setpass.tooShort', { n: 6 }))),
            h('div', { class: 'field' }, h('label', { for: 'rg-pass2' }, t('rg.pass.repeat')), pw2.node, mism && h('p', { class: 'error', role: 'alert' }, t('setpass.mismatch'))),
            st.err && h('p', { class: 'error', role: 'alert' }, st.err)],
          actions: submitBtn(t('setpass.submit'), { busy: st.busy, busyLabel: t('setpass.saving'), arrow: false }),
          onSubmit: async () => {
            st.tried = true; st.err = '';
            if (short || st.pass !== st.pass2) return password();
            st.busy = true; password();
            try { await Api.setPassword(st.pass); success(host, { registered: true }); }
            catch (e) { st.busy = false; st.err = errMsg(e, 'setpass.error'); password(); }
          } })));
      }
      // the app re-renders on a language change, so the step after the language pick lives in the URL
      if (p.step === 'name') name(); else lang();
      return AuthUI.shell(host);
    },
  };

  // ---------- login by code ----------
  Screens['login-code'] = {
    fullscreen: true,
    title: () => t('rg.code.loginTitle'),
    render() {
      const host = h('div');
      let id = '', busy = false, err = '';
      function ask() {
        const inp = input({ id: 'rg-login-id', autocomplete: 'username', autocapitalize: 'none' }, id, (v) => { id = v; if (err) { err = ''; ask(); } else btn.disabled = id.trim().length < 5; });
        const btn = submitBtn(t('rg.code.get'), { busy, busyLabel: t('rg.sending'), disabled: id.trim().length < 5 });
        keepFocus(host, () => put(host, card({ title: t('rg.code.loginTitle'), sub: t('rg.code.loginSub'),
          body: field({ id: 'rg-login-id', label: t('login.identifierPlaceholder'), error: err, input: inp }), actions: btn,
          onSubmit: async () => {
            if (id.trim().length < 5 || busy) return;
            busy = true; ask();
            const body = ident(id);
            try { await Api.otpRequest(body); busy = false; code(body); }
            catch (e) { busy = false; const m = e?.serverMessage || e?.message || ''; err = /not found|no account|не найден/i.test(m) || e?.status === 404 ? t('err.userNotFound') : errMsg(e, 'err.send'); ask(); }
          },
          footer: [sw('', t('rg.login.withPassword'), () => Router.go({ screen: 'login' })), sw(t('rg.noAccount'), t('rg.register'), () => Router.go({ screen: 'register' }))] })));
        if (!document.activeElement || document.activeElement === document.body) setTimeout(() => inp.focus());
      }
      function code(body) {
        otpView(host, { mode: 'login', to: body.email || body.phone, onBack: ask, resend: () => Api.otpRequest(body), verify: (c) => Api.otpVerify({ ...body, otp: c }), onVerified: () => success(host, { registered: false }) });
      }
      ask();
      return AuthUI.shell(host);
    },
  };

  // ---------- demo banner + locked state ----------
  async function demoBanner() {
    const u = State.user || (await Api.currentUser().catch(() => null));
    if (!u?.isDemoAccount) return null;
    const usage = await Api.quotaUsage().catch(() => []);
    return h('section', { class: 'card exam-demo stack-sm' }, h('div', { class: 'row' }, h('span', { class: 'badge badge--brand' }, t('exam.demo.tag')), h('p', { class: 'small grow' }, t('exam.demo.text.ielts'))),
      h('div', { class: 'chips' }, (Array.isArray(usage) ? usage : []).filter((x) => x.limit != null).map((x) => {
        const rem = x.remaining ?? Math.max(0, x.limit - (x.used || 0));
        return h('span', { class: 'badge' + (rem <= 0 ? ' badge--danger' : '') }, t('exam.demo.left', { name: t('exam.type.' + x.contentType) || x.contentType, n: rem, limit: x.limit }));
      })),
      h('div', null, h('a', { class: 'btn btn--primary btn--sm', href: Router.href({ screen: 'ielts-pricing' }) }, t('exam.demo.cta'))));
  }
  window.ExamDemo = { banner: demoBanner };
  Screens['ielts-locked'] = {
    title: () => 'IELTS',
    async render() {
      const me = State.me || {}, ob = !!me.onboarded, dg = !!me.diagnosticDone;
      const cta = ob && dg ? ['ielts-diagnostic-result', 'ieltsLocked.result'] : ob ? ['ielts-diagnostic', 'ieltsLocked.diagnostic'] : ['ielts-onboarding', 'ieltsLocked.onboarding'];
      return h('div', { class: 'stack' }, await demoBanner(),
        h('section', { class: 'card stack locked' }, h('span', { class: 'locked__ic' }, icon('lock')),
          h('h2', null, t(ob ? 'ieltsLocked.title' : 'ieltsLocked.titleStart')),
          h('p', { class: 'muted' }, t(!ob ? 'ieltsLocked.textStart' : dg ? 'ieltsLocked.textDone' : 'ieltsLocked.text')),
          h('ol', { class: 'locked__steps' }, [['ieltsLocked.step1', ob], ['ieltsLocked.step2', dg]].map(([k, done], i) => h('li', { class: done ? 'is-done' : null }, h('span', { class: 'sstep__n' }, done ? icon('check', 'ic12') : i + 1), t(k)))),
          h('div', null, h('a', { class: 'btn btn--primary btn--lg', href: Router.href({ screen: cta[0] }) }, t(cta[1]), icon('arrowR', 'ic16')))));
    },
  };

  // ---------- pricing ----------
  const PLANS = IELTS_CONFIG.plans;
  const money = (n) => new Intl.NumberFormat(DOM.locale(), { style: 'currency', currency: IELTS_CONFIG.currency, maximumFractionDigits: 0 }).format(n);
  Screens['ielts-pricing'] = {
    fullscreen: true,
    title: () => t('examPricing.ielts.title'),
    render() {
      const buy = (pl) => {
        const name = t(`examPricing.ielts.${pl.id}.title`), term = t('examPricing.perTerm', { n: pl.months }), price = pl.price ? money(pl.price) : t('examPricing.priceSoon');
        window.open(DOM.waLink(t('examPricing.waText', { name, term, price })), '_blank', 'noopener');
      };
      return h('div', { class: 'ob' },
        h('header', { class: 'ob__top' }, h('a', { class: 'icon-btn', href: Router.href({ screen: 'ielts' }), 'aria-label': t('rg.back') }, icon('arrowL')),
          h('span', { class: 'brand__mark runbar__mark', 'aria-hidden': 'true' }, DOM.svg(DOM.BRAND)), h('span', { class: 'badge badge--brand' }, t('examPricing.kicker'))),
        h('main', { class: 'ob__main' }, h('div', { class: 'ob__wide stack' },
          h('h1', { class: 'ob__title' }, t('examPricing.ielts.title')), h('p', { class: 'muted' }, t('examPricing.ielts.lead')),
          h('div', { class: 'route' }, PLANS.map((pl) => h('section', { class: 'card stack-sm route__card' + (pl.popular ? ' is-rec' : '') },
            h('div', { class: 'row row--between' }, h('span', { class: 'eyebrow' }, t('examPricing.perTerm', { n: pl.months })), pl.popular && h('span', { class: 'badge badge--brand' }, t('examPricing.popular'))),
            h('h2', null, t(`examPricing.ielts.${pl.id}.title`)), h('p', { class: 'small muted grow' }, t(`examPricing.ielts.${pl.id}.text`)),
            h('b', { class: 'route__term' }, pl.price ? money(pl.price) : t('examPricing.priceSoon')),
            h('button', { class: 'btn btn--lg ' + (pl.popular ? 'btn--primary' : 'btn--secondary'), type: 'button', onclick: () => buy(pl) }, t(pl.price ? 'examPricing.buy' : 'examPricing.ask'))))),
          h('section', { class: 'card stack-sm' }, h('h2', null, t('examPricing.how.title')), h('ol', { class: 'bul small' }, [1, 2, 3].map((i) => h('li', null, t('examPricing.how.' + i))))))));
    },
  };
})();
