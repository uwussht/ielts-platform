// Demo fixtures for Writing / Speaking — original texts in ai-tutor's document shapes
// (task docs, /model, WR-SELFCHECK, WR-GUIDE, SP-GUIDE, attempts, works, AI assess).
(function () {
  const D = window.DEMO_DATA; if (!D) return;
  const { CATALOG, attempts, nextId, persist } = D._;
  const all = () => [...CATALOG.writing, ...CATALOG.speaking];
  const metaOf = (id) => all().find((x) => x.id === id);
  const words = (s) => String(s || '').trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  const paras = (s) => String(s || '').split(/\n\s*\n+/).filter((p) => p.trim());

  // ---------- writing task documents ----------
  const CHARTS = {
    line: { type: 'line', title: 'Daily cycling trips in Riverton (thousands), 2000–2020', unit: 'thousands', yLabel: 'Trips', x: ['2000', '2005', '2010', '2015', '2020'],
      series: [{ name: 'Weekdays', values: [12, 15, 21, 30, 38] }, { name: 'Weekends', values: [18, 19, 20, 22, 29] }] },
    bar: { type: 'bar', title: 'Household spending in three countries (% of income)', unit: '%', x: ['Housing', 'Food', 'Transport', 'Leisure'],
      series: [{ name: 'Norland', values: [32, 14, 12, 9] }, { name: 'Estavia', values: [25, 22, 15, 6] }, { name: 'Kalmar', values: [28, 18, 9, 12] }] },
    pie: { type: 'pie', title: 'How students travel to Hillside College', unit: '%', slices: [{ label: 'Bus', value: 38 }, { label: 'Bicycle', value: 24 }, { label: 'Car', value: 21 }, { label: 'On foot', value: 17 }] },
    table: { type: 'table', title: 'Visitors to four museums (millions)', unit: 'millions', columns: ['Museum', '2010', '2015', '2020'], rows: [['Science', '2.1', '2.6', '1.4'], ['History', '1.8', '1.9', '1.0'], ['Art', '3.2', '3.5', '2.2'], ['Nature', '0.9', '1.4', '1.1']] },
    process: { type: 'figure', kind: 'diagram', title: 'How recycled paper is produced', alt: 'Five stages: collection, sorting, pulping, cleaning, pressing and drying.',
      svg: '<svg viewBox="0 0 420 120" xmlns="http://www.w3.org/2000/svg"><g font-family="sans-serif" font-size="12" text-anchor="middle">' + ['Collection', 'Sorting', 'Pulping', 'Cleaning', 'Drying'].map((s, i) => `<rect x="${8 + i * 82}" y="40" width="70" height="40" rx="8" fill="none" stroke="#888"/><text x="${43 + i * 82}" y="64" fill="#888">${s}</text>${i < 4 ? `<path d="M${80 + i * 82} 60h8" stroke="#E6BF00" stroke-width="2"/>` : ''}`).join('') + '</g></svg>' },
    map: { type: 'figure', kind: 'map', title: 'Greenfield village in 1995 and today', alt: 'The farmland north of the river was replaced by housing; a bridge and a school were added.',
      svg: '<svg viewBox="0 0 420 160" xmlns="http://www.w3.org/2000/svg"><g font-family="sans-serif" font-size="11" fill="#888"><rect x="10" y="10" width="190" height="140" rx="8" fill="none" stroke="#888"/><rect x="220" y="10" width="190" height="140" rx="8" fill="none" stroke="#888"/><text x="105" y="28" text-anchor="middle">1995</text><text x="315" y="28" text-anchor="middle">Today</text><path d="M10 100h190M220 100h190" stroke="#60A5FA" stroke-width="6"/><text x="105" y="70" text-anchor="middle">Farmland</text><text x="315" y="60" text-anchor="middle">Housing</text><text x="270" y="135">School</text><path d="M330 92v16" stroke="#E6BF00" stroke-width="4"/></g></svg>' },
  };
  const T1AC = (c) => ({ kind: 'task1', taskKind: 'task1_academic', category: c, minWords: 150, timeLimitSec: 1200,
    lead: 'You should spend about 20 minutes on this task.',
    question: `The ${c === 'table' ? 'table' : c === 'process' ? 'diagram' : c === 'map' ? 'maps' : 'chart'} below shows ${CHARTS[c].title.charAt(0).toLowerCase() + CHARTS[c].title.slice(1)}.\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant.`,
    after: ['Write at least 150 words.'], chart: CHARTS[c] });
  const LETTERS = {
    formal: { q: 'You recently stayed at a hotel and left a valuable item in your room. Write a letter to the hotel manager.', b: ['explain when you stayed at the hotel', 'describe the item you left behind', 'say what you would like the manager to do'], open: 'Dear Sir or Madam,' },
    semi_formal: { q: 'Your neighbour has asked you to look after their garden while they are away, but you cannot do it. Write a letter to your neighbour.', b: ['apologise and explain why you cannot help', 'suggest someone else who could help', 'offer to help in another way'], open: 'Dear Mr Collins,' },
    informal: { q: 'A friend is coming to visit your city for the first time. Write a letter to your friend.', b: ['suggest the best time of year to visit', 'recommend places to see', 'offer to meet them during the visit'], open: 'Dear Sam,' },
  };
  const T1GT = (c) => ({ kind: 'task1', taskKind: 'task1_general', category: c, minWords: 150, timeLimitSec: 1200, lead: 'You should spend about 20 minutes on this task.',
    question: LETTERS[c].q, bullets: ['In your letter', ...LETTERS[c].b].slice(1), after: ['Write at least 150 words.', 'You do NOT need to write any addresses.'], opening: `Begin your letter as follows: ${LETTERS[c].open}` });
  const ESSAY = {
    opinion: 'Some people believe that working from home is better for both employees and companies. To what extent do you agree or disagree?',
    discussion: 'Some people think cars should be banned from city centres, while others believe this would harm local businesses. Discuss both views and give your own opinion.',
    problem_solution: 'Many students find it difficult to stay motivated when studying online. What are the causes of this problem, and what solutions can you suggest?',
    adv_disadv: 'International tourism has grown rapidly in recent decades. Do the advantages of this outweigh the disadvantages?',
    two_part: 'More and more cities are paying for public art such as sculptures and murals. Why is this happening? Is it a positive development?',
  };
  const T2 = (c) => ({ kind: 'task2', taskKind: 'task2', category: c, minWords: 250, timeLimitSec: 2400, lead: 'You should spend about 40 minutes on this task.',
    question: `Write about the following topic:\n\n${ESSAY[c]}\n\nGive reasons for your answer and include any relevant examples from your own knowledge or experience.`, after: ['Write at least 250 words.'] });

  // ---------- speaking documents ----------
  const P1 = {
    hometown: ['Where is your hometown?', 'What do you like most about it?', 'Has your hometown changed much in recent years?', 'Would you like to live there in the future?'],
    music: ['What kind of music do you enjoy?', 'Do you listen to music while you study?', 'Did you learn to play an instrument as a child?', 'Is live music popular where you live?'],
    work_study: ['Do you work or are you a student?', 'Why did you choose this subject?', 'What is the most difficult part of your studies?', 'What would you like to do after you graduate?'],
    food: ['What is your favourite food?', 'Do you prefer eating at home or in restaurants?', 'Can you cook?', 'Has your diet changed since you were a child?'],
    sport: ['Do you play any sports?', 'Which sports are popular in your country?', 'Did you do sport at school?', 'Do you prefer watching or playing sport?'],
    travel: ['Do you like travelling?', 'Where did you go on your last holiday?', 'Do you prefer travelling alone or with others?', 'Is there a place you would love to visit?'],
  };
  const P2 = {
    person: { cue: 'Describe a person who taught you something useful.', b: ['who this person is', 'what they taught you', 'how they taught it', 'and explain why it was useful'], fu: 'Do you still keep in touch with this person?' },
    experience: { cue: 'Describe a time when you helped someone.', b: ['who you helped', 'what the problem was', 'how you helped', 'and explain how you felt afterwards'], fu: 'Do you often help people you do not know?' },
    place: { cue: 'Describe a quiet place you like to visit.', b: ['where it is', 'how often you go there', 'what you do there', 'and explain why you like it'], fu: 'Are quiet places easy to find in your city?' },
    object: { cue: 'Describe an object you use every day.', b: ['what it is', 'when you got it', 'how you use it', 'and explain why it is important to you'], fu: 'Would you find it hard to live without it?' },
    event: { cue: 'Describe a celebration you enjoyed.', b: ['what it was', 'where it took place', 'who was there', 'and explain why you enjoyed it'], fu: 'Do people in your country celebrate birthdays in a big way?' },
    habit: { cue: 'Describe a healthy habit you have.', b: ['what the habit is', 'when you started it', 'how you keep it up', 'and explain how it helps you'], fu: 'Is it easy for young people to stay healthy today?' },
  };
  const P3 = {
    education: ['Should schools teach practical skills such as cooking and budgeting?', 'How might education change in the next twenty years?', 'Is it better to study alone or in groups?'],
    technology: ['Has technology made people more or less sociable?', 'Should children have limits on screen time?', 'Which jobs could disappear because of technology?'],
    environment: ['What can individuals do to protect the environment?', 'Should governments tax products that create pollution?', 'Are young people more interested in the environment than older people?'],
    work: ['Is job satisfaction more important than salary?', 'How has the way people work changed recently?', 'Should people retire at a fixed age?'],
    travel: ['Why do people enjoy visiting other countries?', 'Does tourism help local communities?', 'Will people travel less in the future?'],
    society: ['Why do some people prefer living in big cities?', 'How important is it to know your neighbours?', 'Do older people and young people value the same things?'],
  };
  const SH = {
    daily_routine: [['I usually get up', 'at about seven'], ['and have a quick breakfast', 'before I leave'], ['On weekdays', 'I take the bus to university'], ['In the evening', 'I like to cook', 'and call my family']],
    commute: [['My journey to work', 'takes around forty minutes'], ['When the trains are on time', 'it is quite relaxing'], ['I often read', 'or listen to podcasts'], ['If the weather is nice', 'I cycle instead']],
    weekends: [['At the weekend', 'I try to switch off'], ['On Saturday mornings', 'I go to the market'], ['In the afternoon', 'I meet my friends', 'in the park'], ['Sunday is usually', 'a quiet day at home']],
  };
  function speakingDoc(meta) {
    const c = meta.category;
    if (meta.kind === 'part1') return { kind: 'part1', topic: c, questions: P1[c].map((q, i) => ({ id: `${meta.id}-q${i + 1}`, question: q })) };
    if (meta.kind === 'part3') return { kind: 'part3', topic: c, questions: P3[c].map((q, i) => ({ id: `${meta.id}-q${i + 1}`, question: q })) };
    if (meta.kind === 'part2') return { kind: 'part2', id: `${meta.id}-cue`, cue: P2[c].cue, bullets: P2[c].b, followUp: P2[c].fu };
    return { kind: 'shadowing', phrases: SH[c].map((g, i) => ({ id: `${meta.id}-p${i + 1}`, groups: g })) };
  }
  function docFor(meta) {
    if (meta.kind === 'task1') return { id: meta.id, title: meta.title, ...(meta.module === 'general' ? T1GT(meta.category) : T1AC(meta.category)) };
    if (meta.kind === 'task2') return { id: meta.id, title: meta.title, ...T2(meta.category) };
    return { id: meta.id, title: meta.title, ...speakingDoc(meta) };
  }

  // ---------- model answers ----------
  const MODEL_T2 = { band: 8, text: [
    'Over the past decade, remote work has moved from a rare privilege to a common arrangement. While I accept that it brings real benefits, I believe it works best as part of a flexible model rather than as a complete replacement for the office.',
    'On the one hand, working from home saves employees hours of commuting each week, and this time can be spent on rest or family. Companies, in turn, can reduce the cost of office space. For instance, several firms in my city have halved their rent by sharing desks.',
    'On the other hand, some aspects of work suffer when colleagues never meet. New staff learn more slowly without someone to ask, and creative ideas often appear in informal conversations. As a result, a fully remote team may become efficient but less innovative.',
    'In conclusion, remote work clearly benefits both sides in terms of time and money. However, I would argue that a combination of home and office days gives organisations the advantages of both.'],
  analysis: { paragraphs: [{ role: 'intro', note: { ru: 'Перефразирует тему и сразу даёт позицию — частично согласен.' } }, { role: 'body', note: { ru: 'Первый довод с конкретным примером.' } }, { role: 'body', note: { ru: 'Вторая сторона вопроса и следствие.' } }, { role: 'conclusion', note: { ru: 'Позиция другими словами, без новых идей.' } }],
    linkers: [{ text: 'While', note: { ru: 'Уступка в одном предложении с позицией.' } }, { text: 'On the one hand', note: { ru: 'Вводит первую сторону.' } }, { text: 'For instance', note: { ru: 'Вводит пример.' } }, { text: 'On the other hand', note: { ru: 'Переход к другой стороне.' } }, { text: 'As a result', note: { ru: 'Следствие.' } }, { text: 'In conclusion', note: { ru: 'Вывод.' } }],
    strengths: [{ title: { ru: 'Позиция видна с первого абзаца' }, ru: 'Экзаменатор не ищет мнение — оно в thesis и повторено в выводе.', example: 'I believe it works best as part of a flexible model' }, { title: { ru: 'Каждый довод развит' }, ru: 'Мысль → объяснение → пример или следствие.' }] } };
  const MODEL_T1 = { band: 8, text: ['The line graph compares the number of cycling trips made on weekdays and at weekends in Riverton between 2000 and 2020.', 'Overall, cycling became more popular on both types of day, but the rise was far more dramatic on weekdays, which overtook weekends by the end of the period.', 'In 2000, weekend trips stood at 18 thousand, compared with 12 thousand on weekdays. Weekday cycling then climbed steadily, reaching 21 thousand in 2010 and more than tripling to 38 thousand by 2020.', 'Weekend figures, by contrast, remained almost flat for fifteen years, edging up from 18 to 22 thousand, before increasing more sharply to 29 thousand in the final five years.'],
    analysis: { paragraphs: [{ role: 'intro' }, { role: 'overview' }, { role: 'body' }, { role: 'body' }], linkers: [{ text: 'Overall', note: { ru: 'Сигнал обзора.' } }, { text: 'by contrast', note: { ru: 'Сравнение двух линий.' } }] } };
  const MODEL_LETTER = { band: 8, text: ['Dear Sir or Madam,', 'I am writing to ask for your help regarding an item I left in my room during my recent stay at your hotel.', 'I stayed in room 214 from 3 to 6 May. On the morning I checked out, I believe I left a silver watch on the bedside table. It has a black leather strap and my initials engraved on the back.', 'I would be grateful if you could check whether it has been found and, if so, post it to the address below. I will of course cover the cost of delivery.', 'Yours faithfully,', 'Anna Petrova'],
    analysis: { paragraphs: [{ role: 'greeting' }, { role: 'purpose' }, { role: 'bullet' }, { role: 'bullet' }, { role: 'signoff' }, { role: 'signoff' }], linkers: [{ text: 'I would be grateful if', note: { ru: 'Вежливая просьба формального регистра.' } }] } };
  function modelFor(id) {
    const meta = metaOf(id); if (!meta) return {};
    if (meta.kind === 'task2') return MODEL_T2;
    if (meta.kind === 'task1') return meta.module === 'general' ? MODEL_LETTER : MODEL_T1;
    if (meta.kind === 'part2') return { band: 8, text: ['I would like to talk about my grandfather, who taught me how to repair a bicycle when I was about twelve.', 'He showed me step by step, letting me make mistakes and then asking what went wrong. It was useful because I learned to solve problems calmly rather than giving up.'],
      analysis: { tips: [{ title: { ru: 'Начните с ответа на карточку' }, ru: 'Первая фраза называет человека — экзаменатор сразу понимает тему.', example: 'I would like to talk about…' }], paragraphs: [{ role: 'opening', note: { ru: 'Кто и что.' } }, { role: 'reason', note: { ru: 'Почему это было полезно.' } }] } };
    if (meta.kind === 'part1' || meta.kind === 'part3') {
      const d = speakingDoc(meta);
      return { questions: Object.fromEntries(d.questions.slice(0, 2).map((q) => [q.id, { band: 8, text: [meta.kind === 'part1' ? 'Well, I would say so. Mainly because it gives me a chance to relax after a busy day, and I usually do it with friends.' : 'I think it depends on the situation. On the one hand, it saves time; on the other hand, people may lose important skills. Personally, I would favour a balanced approach.'] }])) };
    }
    return {};
  }

  // ---------- server documents: self-check, guides ----------
  const SELFCHECK = { criteria: [
    { key: 'ta', kinds: ['t1ac', 't1gt'], what: { ru: 'Отвечает ли текст на все части задания.' }, questions: [
      { key: 'q1', kinds: ['t1ac'], q: { ru: 'Есть ли отдельный overview с главными тенденциями без цифр?' }, tip: { ru: 'Без overview Task Achievement не выше 5. Добавьте 2 предложения о главном.' }, guide: true },
      { key: 'q2', kinds: ['t1gt'], q: { ru: 'Раскрыты ли все три пункта задания?' }, tip: { ru: 'Каждому пункту — свой абзац с деталями.' }, guide: true },
      { key: 'q3', q: { ru: 'Набран ли минимум 150 слов?' }, tip: { ru: 'Короткий ответ снижает балл за выполнение задания.' } }] },
    { key: 'tr', kinds: ['t2'], what: { ru: 'Позиция и развитие идей в эссе.' }, questions: [
      { key: 'q1', q: { ru: 'Видна ли ваша позиция во введении и выводе?' }, tip: { ru: 'Сформулируйте thesis в последнем предложении введения.' }, guide: true },
      { key: 'q2', q: { ru: 'Есть ли у каждого довода объяснение и пример?' }, tip: { ru: 'Схема: мысль → почему → пример.' } }] },
    { key: 'cc', what: { ru: 'Логика и связность.' }, questions: [
      { key: 'q1', q: { ru: 'Одна главная мысль на абзац?' }, tip: { ru: 'Разделите абзац, если в нём две темы.' } },
      { key: 'q2', q: { ru: 'Связки разнообразны и не стоят в каждом предложении?' }, tip: { ru: 'Замените повторяющиеся связки ссылками: this, these, such.' }, guide: true }] },
    { key: 'lr', what: { ru: 'Точность и разнообразие слов.' }, questions: [{ key: 'q1', q: { ru: 'Нет ли повторов ключевых слов из задания?' }, tip: { ru: 'Перефразируйте слова задания синонимами.' } }] },
    { key: 'gra', what: { ru: 'Разнообразие и точность грамматики.' }, questions: [{ key: 'q1', q: { ru: 'Есть ли сложные предложения (although, which, if)?' }, tip: { ru: 'Добавьте 2–3 сложных предложения без потери ясности.' } }] },
  ] };
  const WR_GUIDE = { parts: [
    { key: 't1ac', module: 'academic', task: 1, rules: [{ ru: 'Введение перефразирует задание — не копируйте его.' }, { ru: 'Overview обязателен: 2 предложения о главных тенденциях.' }, { ru: 'Без мнений и причин — только то, что видно на графике.' }],
      kinds: [{ key: 'line', skeleton: [{ role: 'intro', what: { ru: 'Что показывает график, где и когда.' }, ex: 'The line graph compares the number of cycling trips…' }, { role: 'overview', what: { ru: 'Главная тенденция и самое заметное сравнение.' }, ex: 'Overall, cycling became more popular…' }, { role: 'body', what: { ru: 'Детали: самая заметная линия, цифры и годы.' } }, { role: 'body', what: { ru: 'Остальные линии со сравнением.' } }],
        phrases: [{ role: 'overview', rows: [{ pattern: 'Overall, [the number of …] rose / fell, while [the other line] remained stable.', ex: 'Overall, weekday trips rose sharply, while weekend trips remained stable.' }] }],
        mistakes: [{ bad: 'The graph shows informations about bikes.', good: 'The graph shows information about cycling trips.', why: { ru: 'information — неисчисляемое.' } }],
        sample: { question: 'The graph below shows daily cycling trips in Riverton, 2000–2020.', chart: CHARTS.line, text: MODEL_T1.text, roles: ['intro', 'overview', 'body', 'body'] } },
      { key: 'bar', skeleton: [{ role: 'intro', what: { ru: 'Что сравнивается и в каких единицах.' } }, { role: 'overview', what: { ru: 'Самые большие и маленькие значения.' } }, { role: 'body', what: { ru: 'Группа 1 с цифрами.' } }, { role: 'body', what: { ru: 'Группа 2 со сравнением.' } }] }] },
    { key: 't1acLex', module: 'academic', task: 1, blocks: [{ key: 'trend', groups: [{ key: 'up', title: { ru: 'Рост' }, rows: [{ phrase: 'rise / increase / grow', use: { ru: 'нейтрально' }, ex: 'Trips rose to 38 thousand.' }, { phrase: 'soar / surge', use: { ru: 'резкий рост' } }] }] },
      { key: 'degree', groups: [{ key: 'adv', rows: [{ phrase: 'sharply, dramatically', use: { ru: 'сильно' } }, { phrase: 'slightly, marginally', use: { ru: 'слабо' } }] }] }] },
    { key: 't1gt', module: 'general', task: 1, rules: [{ ru: 'Регистр задаёт обращение: Sir or Madam → formal, имя → informal.' }],
      kinds: [{ key: 'formal', skeleton: [{ role: 'greeting', what: { ru: 'Dear Sir or Madam,' } }, { role: 'purpose', what: { ru: 'Цель письма в первой фразе.' }, ex: 'I am writing to…' }, { role: 'bullet', what: { ru: 'По абзацу на пункт задания.' } }, { role: 'closing', what: { ru: 'Просьба или ожидание ответа.' } }, { role: 'signoff', what: { ru: 'Yours faithfully, + полное имя.' } }],
        register: [{ ok: 'I would be grateful if you could…', no: 'Can you just…', why: { ru: 'Слишком разговорно для formal.' } }] }] },
    { key: 't2', module: 'both', task: 2, rules: [{ ru: 'Позиция — с первого абзаца и одна до конца.' }, { ru: 'Готовых абзацев нет: экзаменатор снижает балл за заученный текст.' }],
      kinds: [{ key: 'opinion', skeleton: [{ role: 'intro', what: { ru: 'Тема своими словами + thesis.' } }, { role: 'body', what: { ru: 'Довод 1: объяснение и пример.' } }, { role: 'body', what: { ru: 'Довод 2 или уступка.' } }, { role: 'conclusion', what: { ru: 'Позиция другими словами.' } }],
        phrases: [{ role: 'intro', rows: [{ pattern: 'While [some people argue …], I believe [your view].', ex: 'While some argue that offices are outdated, I believe they remain essential.' }] }] }],
      blocks: [{ key: 'paraphrase', groups: [{ key: 'p', rows: [{ from: 'working from home', to: 'remote work' }, { from: 'is better for', to: 'benefits' }] }] }] },
    { key: 'linking', module: 'both', task: 2, blocks: [{ key: 'contrast', groups: [{ key: 'c', title: { ru: 'Контраст' }, rows: [{ phrase: 'However,', use: { ru: 'в начале предложения' }, where: ['t1', 't2', 'letter'] }, { worn: 'On the other hand', alt: 'By contrast', where: 't1' }] }] }] },
  ] };
  const SP_GUIDE = { parts: [
    { part: 1, lead: { ru: 'Короткие ответы о себе: 2–3 предложения — ответ, причина, деталь.' }, blocks: [{ id: 'formula', title: { ru: 'Формула ответа' }, items: [{ ru: 'Прямой ответ на вопрос.' }, { ru: 'Причина или пояснение.' }, { ru: 'Пример или деталь из жизни.' }], example: 'Yes, I do. Mainly because it helps me relax — I usually listen to jazz on the way home.' },
      { id: 'mistakes', title: { ru: 'Типичные ошибки' }, items: [{ ru: 'Ответ одним словом.' }, { ru: 'Заученный монолог не по вопросу.' }] }] },
    { part: 2, lead: { ru: 'Минута подготовки: ключевые слова по пунктам карточки, затем 1,5–2 минуты речи.' }, blocks: [{ id: 'plan', title: { ru: 'Как использовать минуту' }, items: [{ ru: 'По 2–3 слова на каждый пункт.' }, { ru: 'Отметьте, чем закончите — пункт «explain why».' }] }] },
    { part: 3, lead: { ru: 'Обсуждение шире темы: мнение, причина, пример, оговорка.' }, blocks: [{ id: 'extend', title: { ru: 'Как развить ответ' }, items: [{ ru: 'Сравните: раньше и сейчас, город и деревня.' }, { ru: 'Назовите исключение: although, unless.' }], example: { en: 'It depends. In big cities, yes, but in rural areas people still rely on cars.' } }] },
  ] };

  // ---------- attempts ----------
  function writingAttempt({ m, body }) {
    const meta = metaOf(decodeURIComponent(m[1]));
    const doc = docFor(meta);
    const id = nextId();
    const att = { id, mode: body?.mode || 'exam', finishedAt: new Date().toISOString(), band: null, timeSec: body?.timeSec ?? null };
    attempts[id] = { testId: meta.id, skill: 'writing', document: doc, attempt: att, answers: { text: body?.text || '', selfCheck: {} },
      result: { status: 'pending_ai', words: words(body?.text), minWords: doc.minWords, underLength: words(body?.text) < doc.minWords, timeLimitSec: doc.timeLimitSec } };
    meta.attemptCount = (meta.attemptCount || 0) + 1; meta.lastAttempt = { id, band: null, status: 'pending_ai', finishedAt: att.finishedAt };
    persist();
    return { attempt: att };
  }
  function gradeWriting(opts) {
    const a = attempts[opts.json?.attemptId];
    if (!a) { const e = new Error('not found'); e.status = 404; e.data = { error: 'not_found' }; throw e; }
    const text = a.answers.text, n = words(text), P = paras(text), t1 = a.document.kind === 'task1';
    const base = Math.min(7, Math.max(4, 4 + Math.min(n / a.document.minWords, 1.4) * 1.5 + (P.length >= 4 ? 0.5 : 0)));
    const r5 = (x) => Math.round(x * 2) / 2;
    const criteria = { taskResponse: r5(base - (n < a.document.minWords ? 1 : 0)), coherenceCohesion: r5(base + (P.length >= 4 ? 0.5 : -0.5)), lexicalResource: r5(base), grammaticalRange: r5(base - 0.5) };
    const band = r5(Object.values(criteria).reduce((s, v) => s + v, 0) / 4);
    const first = (P[0] || text).split(/(?<=[.!?])\s+/)[0] || '';
    const quoteWord = (text.match(/\b(very|good|bad|big|things?)\b/i) || [])[0];
    a.attempt.band = band;
    a.result = { ...a.result, status: 'done', criteria, feedback: 'Демо-оценка: балл рассчитан по длине и структуре текста. Настоящую проверку по четырём критериям делает ИИ после входа.',
      errors: quoteWord ? [{ quote: quoteWord, correction: { very: 'extremely', good: 'beneficial', bad: 'harmful', big: 'significant', thing: 'aspect', things: 'aspects' }[quoteWord.toLowerCase()] || quoteWord, issue: 'Слишком общее слово — замените более точным.', criterion: 'lexicalResource' }] : [],
      rewrites: [],
      details: {
        criteriaNotes: [{ criterion: 'taskResponse', why: t1 ? 'Главные данные описаны, но overview короткий.' : 'Позиция есть, доводам не хватает примеров.', nextBand: t1 ? 'Добавьте overview из двух предложений без цифр.' : 'Подкрепите каждый довод конкретным примером.' },
          { criterion: 'coherenceCohesion', why: P.length >= 4 ? 'Текст разделён на абзацы с понятной ролью.' : 'Мало абзацев — логику трудно проследить.', nextBand: 'Используйте ссылки this/these вместо повторяющихся связок.' }],
        strengths: ['Текст отвечает на задание', P.length >= 3 ? 'Чёткое деление на абзацы' : 'Понятная основная мысль'],
        nextSteps: ['Перечитайте введение: перефразировано ли задание?', 'Добавьте одно сложное предложение в каждый абзац основной части.'],
        vocabulary: quoteWord ? [{ word: quoteWord, better: ['significant', 'considerable'], note: 'академичнее' }] : [],
        developmentTips: [{ area: t1 ? 'overview' : 'examples', paragraph: t1 ? 2 : 2, tip: t1 ? 'Сформулируйте общую тенденцию без цифр.' : 'Добавьте пример из жизни или статистику.', example: t1 ? 'Overall, both figures rose, but…' : 'For instance, in my city…' }],
        sentences: first ? [{ paragraph: 1, original: first, improved: first.replace(/^./, (c) => c.toUpperCase()).replace(/\s+$/, '') + (t1 ? '' : ' — a view I partly share.'), criterion: 'taskResponse', why: 'Позиция становится видна уже во введении.' }] : [],
        improvedEssay: (t1 ? MODEL_T1.text : MODEL_T2.text).slice(0, Math.max(1, P.length)),
        paragraphs: P.map((_, i) => ({ index: i + 1, role: i === 0 ? 'Введение' : i === P.length - 1 && P.length > 2 ? 'Вывод' : 'Основная часть', comment: i === 0 ? 'Хорошо, что тема перефразирована.' : '' })),
      } };
    const meta = metaOf(a.testId); if (meta) meta.lastAttempt = { id: a.attempt.id, band, status: 'done', finishedAt: a.attempt.finishedAt };
    persist();
    return structuredClone(a);
  }
  function gradeSpeaking(opts) {
    const f = opts.form;
    const testId = f.get('testId'), meta = metaOf(testId);
    const items = JSON.parse(f.get('items') || '[]');
    const id = nextId();
    const doc = docFor(meta);
    const total = items.reduce((s, x) => s + (+x.durationSec || 0), 0);
    const band = Math.min(7, Math.max(4.5, Math.round((4.5 + Math.min(total / (items.length * 30 || 1), 1) * 2) * 2) / 2));
    attempts[id] = { testId, skill: 'speaking', document: doc, attempt: { id, mode: f.get('mode'), finishedAt: new Date().toISOString(), band, timeSec: Math.round(total) },
      answers: {}, result: { status: 'done', criteria: { fluencyCoherence: band, lexicalResource: band - 0.5, grammaticalRange: band - 0.5, pronunciation: null },
        feedback: 'Демо-оценка по длительности ответов. Стенограмму и балл по четырём критериям даёт ИИ после входа.',
        strengths: ['Ответы без долгих пауз'], improvements: ['Добавляйте причину и пример к каждому ответу'],
        items: items.map((x) => ({ itemId: x.itemId, durationSec: x.durationSec, wpm: null, transcript: '', skipped: false })) } };
    meta.attemptCount = (meta.attemptCount || 0) + 1; meta.lastAttempt = { id, band, status: 'done', finishedAt: attempts[id].attempt.finishedAt };
    persist();
    return { attempt: attempts[id].attempt };
  }
  const works = (skill) => Object.values(attempts).filter((a) => a.skill === skill).sort((x, y) => y.attempt.id - x.attempt.id).map((a) => ({
    attemptId: a.attempt.id, title: a.document.title, kind: a.document.kind, category: a.document.category, words: a.result?.words, finishedAt: a.attempt.finishedAt, status: a.result?.status, band: a.attempt.band }));
  // restore lastAttempt status for writing/speaking metas
  for (const a of Object.values(attempts)) { const meta = a.skill && metaOf(a.testId); if (meta) meta.lastAttempt = { id: a.attempt.id, band: a.attempt.band, status: a.result?.status, finishedAt: a.attempt.finishedAt }; }

  const docRes = (id) => { const meta = metaOf(id); return meta && { test: structuredClone(meta), document: docFor(meta) }; };
  D.routes.unshift(
    { method: 'GET', re: /^\/mobile\/ielts\/tests\/WR-SELFCHECK$/, data: { test: { id: 'WR-SELFCHECK' }, document: SELFCHECK } },
    { method: 'GET', re: /^\/mobile\/ielts\/tests\/WR-GUIDE$/, data: { test: { id: 'WR-GUIDE' }, document: WR_GUIDE } },
    { method: 'GET', re: /^\/mobile\/ielts\/tests\/SP-GUIDE$/, data: { test: { id: 'SP-GUIDE' }, document: SP_GUIDE } },
    { method: 'GET', re: /^\/mobile\/ielts\/tests\/([^/]+)\/model$/, data: ({ m }) => structuredClone(modelFor(decodeURIComponent(m[1]))) },
    { method: 'POST', re: /^\/mobile\/ielts\/tests\/([^/]+)\/writing$/, data: writingAttempt },
    { method: 'PUT', re: /^\/mobile\/ielts\/attempts\/(\d+)\/selfcheck$/, data: ({ m, body }) => { const a = attempts[m[1]]; if (a) { a.answers.selfCheck = body || {}; persist(); } return { ok: true }; } },
    { method: 'GET', re: /^\/mobile\/ielts\/writing\/works$/, data: () => works('writing') },
    { method: 'GET', re: /^\/mobile\/ielts\/speaking\/works$/, data: () => works('speaking') },
    { method: 'GET', re: /^\/mobile\/ielts\/tests\/([WS][12H3]?-[^/]+)$/, data: ({ m }) => { const r = docRes(decodeURIComponent(m[1])); if (!r) { const e = new Error('Демо: тест не найден'); e.status = 404; throw e; } return r; } },
  );
  D.local['/api/ielts/writing/assess'] = gradeWriting;
  D.local['/api/ielts/speaking/assess'] = gradeSpeaking;
})();
