// Sign-in, as on the SAT platform: phone number and password against the platform's API.
// AuthUI (shell, password field, phone field, error texts) is shared with the sign-up screen.
(function () {
  const { h, svg, BRAND } = DOM;

  function shell(...kids) {
    return h('div', { class: 'auth' },
      h('div', { class: 'auth__inner' },
        h('div', { class: 'auth__brand' },
          h('div', { class: 'brand__mark auth__mark' }, svg(BRAND)),
          h('div', { class: 'eyebrow' }, t('app.login.eyebrow')),
          h('h1', { class: 'auth__title' }, t('app.login.title'))),
        ...kids,
        h('div', { class: 'auth__langs' }, I18n.langs.map((v) => [v, I18n.shortOf(v)]).map(([v, l]) =>
          h('button', { type: 'button', class: 'chip', 'aria-pressed': String(I18n.lang === v), onclick: () => I18n.setLang(v) }, l)))));
  }

  function passwordField(id, { create = false } = {}) {
    const input = h('input', { class: 'input', id, type: 'password', autocomplete: create ? 'new-password' : 'current-password', required: true });
    const toggle = h('button', { type: 'button', class: 'btn btn--ghost btn--sm', 'aria-controls': id, 'aria-pressed': 'false', onclick: () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      toggle.textContent = t(show ? 'app.login.hide' : 'app.login.show');
      toggle.setAttribute('aria-pressed', String(show));
      input.focus();
    } }, t('app.login.show'));
    return { input, node: h('div', { class: 'input-wrap' }, input, toggle) };
  }

  /**
   * A Kazakhstan number with +7 already in the box, grouped as it is typed
   * (+7 700 123 45 67). A whole number typed or pasted with its own 8 or +7
   * does not end up with the prefix twice.
   */
  const PREFIX = '+' + IELTS_CONFIG.phoneDial + ' ';
  function phoneField(id) {
    const input = h('input', { class: 'input', id, type: 'tel', inputmode: 'tel', autocomplete: 'tel', placeholder: t('auth.phonePlaceholder'), required: true });
    input.value = PREFIX;
    const format = () => {
      const rest = input.value.replace(new RegExp('^\\s*\\+?' + IELTS_CONFIG.phoneDial), '').trim();
      const own = /^(\+7|8)/.test(rest.replace(/[\s()-]/g, ''));
      let d = rest.replace(/\D/g, '');
      if (own && d.length >= 11) d = d.slice(1);
      d = d.slice(0, 10);
      input.value = PREFIX + [d.slice(0, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8, 10)].filter(Boolean).join(' ');
    };
    input.addEventListener('input', format);
    // the caret goes after the prefix, never inside it
    input.addEventListener('focus', () => setTimeout(() => { if (input.selectionStart < PREFIX.length) input.setSelectionRange(input.value.length, input.value.length); }, 0));
    input.addEventListener('keydown', (e) => {
      if ((e.key === 'Backspace' && input.selectionStart <= PREFIX.length && input.selectionEnd <= PREFIX.length) || (e.key === 'Delete' && input.selectionStart < PREFIX.length)) e.preventDefault();
    });
    return input;
  }
  /** "+7 700 123 45 67" → "+77001234567", or null when it is not a whole number. */
  const phoneOf = (v) => { const d = String(v || '').replace(/\D/g, ''); return d.length === 11 ? '+' + d : null; };

  // the server's reasons and what we say for them
  const REASONS = {
    'no-account': 'auth.errNoAccountPhone', 'bad-password': 'auth.errBadPassword', 'exists': 'auth.errPhoneTaken',
    'email-taken': 'auth.errEmailTaken', 'bad-email': 'auth.errEmail', 'bad-phone': 'auth.errPhone', 'bad-name': 'auth.errName',
    'no-consent': 'auth.errConsent', 'bad-password-length': 'auth.errPassword8', 'too-many': 'auth.errTooMany',
  };
  const errText = (e) => t(REASONS[e?.data?.reason] || 'auth.errServer');

  function saveSession(res) {
    const token = res?.accessToken || res?.token;
    if (!token) throw new Error(t('auth.errServer'));
    Api.Auth.set(token);
    State.me = null; State.user = res.user || null;
  }

  Screens.login = {
    fullscreen: true,
    title: () => t('app.login.submit'),
    render(p) {
      const phone = phoneField('auth-phone');
      const pw = passwordField('auth-password');
      const err = h('p', { class: 'error', role: 'alert' });
      const btn = h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'submit' }, t('app.login.submit'));
      const fail = (msg, field) => { err.textContent = msg; if (field) { field.setAttribute('aria-invalid', 'true'); field.focus(); } };
      const form = h('form', { class: 'auth__card stack', novalidate: true, onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
        form.querySelectorAll('[aria-invalid]').forEach((x) => x.removeAttribute('aria-invalid'));
        const number = phoneOf(phone.value);
        if (!number) return fail(t('auth.errPhone'), phone);
        if (!pw.input.value) return fail(t('auth.errBadPassword'), pw.input);
        btn.disabled = true;
        try {
          saveSession(await Api.login(number, pw.input.value));
          const next = p.next && p.next.startsWith('?') && !p.next.includes('screen=login') ? p.next : '?screen=ielts';
          history.replaceState(null, '', next); Router.emit();
        } catch (ex) { fail(errText(ex)); }
        finally { btn.disabled = false; }
      } },
        h('p', { class: 'muted small', style: { textAlign: 'center' } }, t('auth.serverSubtitle')),
        h('div', { class: 'field' }, h('label', { for: 'auth-phone' }, t('auth.phone')), phone),
        h('div', { class: 'field' }, h('label', { for: 'auth-password' }, t('app.login.password')), pw.node),
        err, btn,
        h('a', { class: 'btn btn--ghost btn--block', href: '?screen=register' }, t('auth.toRegister')));
      return shell(form, h('p', { class: 'xs muted', style: { textAlign: 'center' } }, t('auth.serverNote')));
    },
  };

  window.AuthUI = { shell, passwordField, phoneField, phoneOf, errText, saveSession };
})();
