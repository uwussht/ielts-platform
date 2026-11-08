// Deployment settings — the one place for environment-specific values.
// Screens read these through window.IELTS_CONFIG; user-visible text lives in js/i18n/*.
window.IELTS_CONFIG = {
  brand: 'IELTS',  // product name in the window title

  // Backend (Bearer token). AI routes (/api/*) go through server.js → AI_TUTOR_ORIGIN.
  apiBase: 'https://prod-server.justtostudy.kz',

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

  // Phone sign-up: ISO region (name comes from Intl in the UI language), dial code, min/max digits.
  // region null = "other country" (any code, free length). Several regions share one dial code via `regions`.
  phoneCountries: [
    { id: 'KZ', dial: '7', min: 10, max: 10 }, { id: 'RU', dial: '7', min: 10, max: 10 },
    { id: 'UZ', dial: '998', min: 9, max: 9 }, { id: 'KG', dial: '996', min: 9, max: 9 },
    { id: 'TJ', dial: '992', min: 9, max: 9 }, { id: 'TM', dial: '993', min: 8, max: 8 },
    { id: 'AZ', dial: '994', min: 9, max: 9 }, { id: 'GE', dial: '995', min: 9, max: 9 },
    { id: 'AM', dial: '374', min: 8, max: 8 }, { id: 'BY', dial: '375', min: 9, max: 9 },
    { id: 'UA', dial: '380', min: 9, max: 9 }, { id: 'MD', dial: '373', min: 8, max: 8 },
    { id: 'MN', dial: '976', min: 8, max: 8 }, { id: 'GB', dial: '44', min: 10, max: 10 },
    { id: 'DE', dial: '49', min: 6, max: 11 }, { id: 'US', regions: ['US', 'CA'], dial: '1', min: 10, max: 10 },
    { id: 'XX', dial: '', min: 7, max: 15 },
  ],
  defaultCountry: 'KZ',
};
