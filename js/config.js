// Deployment settings — the one place for environment-specific values.
// Screens read these through window.IELTS_CONFIG; user-visible text lives in js/i18n/*.
window.IELTS_CONFIG = {
  brand: 'IELTS',  // product name in the window title

  // The platform's API (server/, Bearer token): accounts, attempts, plan, mocks, vocabulary.
  // server.js forwards this path to it (API_ORIGIN).
  apiBase: '/app-api',

  // Test content: the copy in content/, served by server.js (audio and pictures under /media).
  contentApi: '/content-api',
  // 'local': the student's plan is built here from content/programmes.json (js/core/plan-local.js);
  // 'backend': the ai-tutor backend's plan.
  planSource: 'local',

  // Staff API (server/, started with docker compose; server.js forwards this path to it).
  staffApi: '/staff-api',
  staffRoles: ['student', 'teacher', 'curator', 'manager', 'admin'],

  // Manager chat for plans and routes (international format, digits only).
  whatsapp: '77471634118',
  privacyUrl: 'https://justtostudy.kz/privacy',

  // UI languages and the locale used for dates and numbers in each.
  langs: ['ru', 'kk', 'en'],
  langShort: { ru: 'RU', kk: 'KZ', en: 'EN' },  // compact switcher labels
  locales: { ru: 'ru-RU', kk: 'kk-KZ', en: 'en-GB' },

  // Pricing: price null → "the manager will confirm the price". Names/texts: examPricing.ielts.<id>.*
  currency: 'KZT',
  plans: [
    { id: 'self', months: 3, price: null },
    { id: 'coach', months: 3, price: null, popular: true },
    { id: 'intensive', months: 2, price: null },
  ],

  // Phone sign-in and sign-up, as on the SAT platform: the box starts with this code
  // and takes the ten digits after it (+7 700 123 45 67).
  phoneDial: '7',
};
