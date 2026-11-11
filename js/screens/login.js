// Login — email or phone + password against the platform's API, styled like the TeenTech login.
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

  function passwordField(id) {
    const input = h('input', { class: 'input', id, type: 'password', autocomplete: id === 'password' ? 'current-password' : 'new-password', required: true, minlength: 6 });
    const toggle = h('button', { type: 'button', class: 'btn btn--ghost btn--sm', 'aria-controls': id, 'aria-pressed': 'false', onclick: () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      toggle.textContent = t(show ? 'app.login.hide' : 'app.login.show');
      toggle.setAttribute('aria-pressed', String(show));
    } }, t('app.login.show'));
    return { input, node: h('div', { class: 'input-wrap' }, input, toggle) };
  }

  Screens.login = {
    fullscreen: true,
    title: () => t('app.login.submit'),
    render(p) {
      const email = h('input', { class: 'input', id: 'email', type: 'text', autocomplete: 'username', autocapitalize: 'none', spellcheck: false, required: true });
      const pw = passwordField('password');
      const err = h('p', { class: 'error', role: 'alert' });
      const hint = h('p', { class: 'xs muted', hidden: true }, t('login.failedHint'));
      const btn = h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'submit' }, t('app.login.submit'));
      const form = h('form', { class: 'auth__card stack', novalidate: true, onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
        if (!email.value.trim() || !pw.input.value) { err.textContent = t('login.fill'); return; }
        btn.disabled = true;
        try {
          const res = await Api.login(email.value, pw.input.value);
          const token = res?.token || res?.accessToken || res?.access_token || res?.jwt;
          if (!token) throw new Error(t('login.error'));
          Api.Auth.set(token);
          State.me = null; State.user = res?.user || null;
          const next = p.next && p.next.startsWith('?') && !p.next.includes('screen=login') ? p.next : '?screen=ielts';
          history.replaceState(null, '', next); Router.emit();
        } catch (ex) {
          err.textContent = ex.status === 401 || ex.status === 400 ? t('login.failed') : (ex.serverMessage || ex.message || t('login.failed'));
          hint.hidden = !(ex.status === 401 || ex.status === 400);
        } finally { btn.disabled = false; }
      } },
        h('p', { class: 'muted small', style: { textAlign: 'center' } }, t('app.login.lead')),
        h('div', { class: 'field' }, h('label', { for: 'email' }, t('login.identifierPlaceholder')), email),
        h('div', { class: 'field' }, h('label', { for: 'password' }, t('app.login.password')), pw.node),
        err, hint, btn,
        h('p', { class: 'small', style: { textAlign: 'center' } }, t('app.login.noProfile'), ' ', h('a', { class: 'link', href: '?screen=register' }, t('app.login.create'))));
      return shell(form);
    },
  };

  window.AuthUI = { shell, passwordField };
})();
