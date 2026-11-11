// Sign-up as on the SAT platform (POST /registration): first and last name, phone,
// password, optional email and consent, all on one card. Also the screen for a
// student whose course access is closed, the IELTS locked state and IELTS pricing.
(function () {
  const { h, icon } = DOM;
  const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());

  // ---------- registration ----------
  Screens.register = {
    fullscreen: true,
    title: () => t('auth.register'),
    render() {
      const first = h('input', { class: 'input', id: 'auth-first', autocomplete: 'given-name', maxlength: 60, required: true });
      const last = h('input', { class: 'input', id: 'auth-last', autocomplete: 'family-name', maxlength: 60, required: true });
      const phone = AuthUI.phoneField('auth-phone');
      const pw = AuthUI.passwordField('auth-password', { create: true });
      const email = h('input', { class: 'input', id: 'auth-email', type: 'email', inputmode: 'email', autocomplete: 'email', autocapitalize: 'none', placeholder: 'name@mail.com' });
      const consent = h('input', { type: 'checkbox', id: 'auth-consent' });
      const err = h('p', { class: 'error', role: 'alert' });
      const btn = h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'submit' }, t('auth.register'));
      const fail = (msg, field) => { err.textContent = msg; if (field) { field.setAttribute('aria-invalid', 'true'); field.focus(); } };
      const field = (id, label, input, hint) => h('div', { class: 'field' }, h('label', { for: id }, label), input, hint && h('p', { class: 'xs muted' }, hint));

      const form = h('form', { class: 'auth__card stack', novalidate: true, onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
        form.querySelectorAll('[aria-invalid]').forEach((x) => x.removeAttribute('aria-invalid'));
        if (!first.value.trim()) return fail(t('auth.errName'), first);
        if (!last.value.trim()) return fail(t('auth.errName'), last);
        const number = AuthUI.phoneOf(phone.value);
        if (!number) return fail(t('auth.errPhone'), phone);
        if (pw.input.value.length < 8) return fail(t('auth.errPassword8'), pw.input);
        const mail = email.value.trim().toLowerCase();
        if (mail && !isEmail(mail)) return fail(t('auth.errEmail'), email);
        if (!consent.checked) return fail(t('auth.errConsent'), consent);
        btn.disabled = true;
        try {
          AuthUI.saveSession(await Api.register({ firstName: first.value.trim(), lastName: last.value.trim(), phone: number,
            password: pw.input.value, email: mail || null, consent: true, lang: I18n.lang }));
          Router.go({ screen: 'ielts' }, { replace: true });
        } catch (ex) {
          const why = ex?.data?.reason;
          fail(AuthUI.errText(ex), why === 'exists' || why === 'bad-phone' ? phone : why === 'email-taken' || why === 'bad-email' ? email : null);
        } finally { btn.disabled = false; }
      } },
        h('h2', { class: 'rg__title' }, t('auth.register')),
        h('p', { class: 'muted small' }, t('auth.serverSubtitle')),
        h('div', { class: 'auth__row' }, field('auth-first', t('auth.firstName'), first), field('auth-last', t('auth.lastName'), last)),
        field('auth-phone', t('auth.phone'), phone, t('auth.phoneHint')),
        field('auth-password', t('app.login.password'), pw.node, t('auth.passwordHint')),
        field('auth-email', t('auth.emailOptional'), email),
        h('label', { class: 'auth__consent', for: 'auth-consent' }, consent,
          h('span', { class: 'small' }, t('auth.consent'), ' · ', h('a', { class: 'link', href: IELTS_CONFIG.privacyUrl, target: '_blank', rel: 'noopener' }, t('auth.privacyLink')))),
        err, btn,
        h('a', { class: 'btn btn--ghost btn--block', href: '?screen=login' }, t('auth.toLogin')));
      return AuthUI.shell(form, h('p', { class: 'xs muted', style: { textAlign: 'center' } }, t('auth.serverNote')));
    },
  };

  // ---------- course access closed (as on the SAT platform) ----------
  Screens['no-access'] = {
    fullscreen: true,
    title: () => t('access.title'),
    render() {
      const acc = State.user?.access || { type: 'none' };
      const ended = acc.until && acc.type !== 'none';
      const why = ended ? t(acc.type === 'trial' ? 'access.trialEnded' : 'access.fullEnded', { date: DOM.dateFull(acc.until) }) : t('access.none');
      const note = h('p', { class: 'small muted', role: 'status' });
      const check = h('button', { class: 'btn btn--secondary btn--lg btn--block', type: 'button', onclick: async () => {
        check.disabled = true;
        try {
          const user = await Api.currentUser();
          State.user = user;
          if (user?.access?.active) { State.me = null; Router.go({ screen: 'ielts' }, { replace: true }); return; }
          note.textContent = t('access.stillClosed');
        } catch { note.textContent = t('auth.errServer'); }
        finally { check.disabled = false; }
      } }, t('access.check'));
      const name = State.user?.name || '';
      return AuthUI.shell(h('div', { class: 'auth__card stack' },
        h('span', { class: 'locked__ic' }, icon('lock')),
        h('h2', { class: 'rg__title' }, t('access.title')),
        h('p', null, why),
        h('p', { class: 'muted small' }, t('access.lead')),
        h('a', { class: 'btn btn--primary btn--lg btn--block', href: DOM.waLink(t('access.waText', { name, phone: State.user?.phone || '' })), target: '_blank', rel: 'noopener' }, t('access.contact')),
        check, note,
        h('button', { class: 'btn btn--ghost btn--block', type: 'button', onclick: () => App.logout() }, t('app.logout'))));
    },
  };

  // ---------- locked state ----------
  Screens['ielts-locked'] = {
    title: () => 'IELTS',
    async render() {
      const me = State.me || {}, ob = !!me.onboarded, dg = !!me.diagnosticDone;
      const cta = ob && dg ? ['ielts-diagnostic-result', 'ieltsLocked.result'] : ob ? ['ielts-diagnostic', 'ieltsLocked.diagnostic'] : ['ielts-onboarding', 'ieltsLocked.onboarding'];
      return h('div', { class: 'stack' },
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
