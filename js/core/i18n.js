// i18n — same keys and strings as ai-tutor (ru default, kk, en).
(function () {
  const KEY = 'ielts_lang';
  const LANGS = window.IELTS_CONFIG.langs;
  let lang = LANGS[0];
  try { const s = localStorage.getItem(KEY); if (LANGS.includes(s)) lang = s; } catch {}
  const LOCAL = window.I18N_APP || {};

  function t(key, vars) {
    const dict = window.I18N?.[lang] || {};
    let s = LOCAL[lang]?.[key] ?? dict[key] ?? LOCAL[LANGS[0]]?.[key] ?? window.I18N?.[LANGS[0]]?.[key];
    if (s == null) { (window.__i18nMissing ||= new Set()).add(key); return ''; }
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
    return s;
  }
  // Plural helper matching ai-tutor's key.one/.few/.many convention.
  function tp(key, n, vars) {
    const r = new Intl.PluralRules(lang).select(n);
    // ai-tutor dictionaries have .one/.few/.many; 'other' (e.g. English plural, Russian fractions) maps to .few or .many
    const forms = [r, r === 'other' && lang !== 'en' ? 'few' : null, 'many', 'other'].filter(Boolean).map((f) => `${key}.${f}`);
    const k = forms.find((x) => has(x));
    return t(k || key, { n, ...vars });
  }
  function setLang(l) {
    lang = l;
    try { localStorage.setItem(KEY, l); } catch {}
    document.documentElement.lang = l;
    window.dispatchEvent(new Event('langchange'));
  }
  document.documentElement.lang = lang;
  // Language's own name ("Русский", "Қазақ тілі", "English") from Intl — nothing to translate by hand.
  function nameOf(code) {
    let n = code;
    try { n = new Intl.DisplayNames([code], { type: 'language' }).of(code) || code; } catch {}
    return n.charAt(0).toLocaleUpperCase(code) + n.slice(1);
  }
  const shortOf = (code) => window.IELTS_CONFIG.langShort?.[code] || code.toUpperCase();
  // Key exists in the chain t() reads (no missing-key record) — for optional, more specific keys.
  const has = (key) => [LOCAL[lang], window.I18N?.[lang], LOCAL[LANGS[0]], window.I18N?.[LANGS[0]]].some((d) => d?.[key] != null);
  const trackName = (tr) => t(tr === 'general' ? 'app.general' : 'app.academic');
  window.I18n = { t, tp, has, setLang, nameOf, shortOf, trackName, langs: LANGS, get lang() { return lang; } };
  window.t = t;
})();
