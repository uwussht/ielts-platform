/* ==========================================================================
   AI grading of Writing and Speaking, as ai-tutor's IELTS section did it:
   four criteria with a band each, a comment per criterion, the errors with
   their corrections, better sentences, vocabulary upgrades, a rewritten
   essay (Writing) and a transcript with speaking rate (Speaking).

   Claude (Sonnet by default) is the examiner; it answers in a fixed JSON
   shape (structured outputs). Speaking is first turned into text by a
   speech-to-text service (an OpenAI-compatible /audio/transcriptions API).

   Settings (server .env, see .env.example):
     ANTHROPIC_API_KEY   turns AI grading on; without it work waits for a teacher
     AI_MODEL            claude-sonnet-5-5
     AI_EFFORT           medium   (low | medium | high)
     TRANSCRIBE_API_KEY  turns AI grading of Speaking on
     TRANSCRIBE_URL      https://api.openai.com/v1/audio/transcriptions
     TRANSCRIBE_MODEL    whisper-1

   Lifecycle of an attempt: 'pending_ai' (queued) → 'grading' → 'done'.
   If grading fails the work goes to the teachers' queue ('pending_review'),
   so nothing a student sends is ever lost.
   ========================================================================== */
'use strict';

const Anthropic = require('@anthropic-ai/sdk').default;
const { pool } = require('./db');
const C = require('./content');

const env = (k, d) => (process.env[k] || '').trim() || d;
const CFG = {
  key: env('ANTHROPIC_API_KEY', ''),
  model: env('AI_MODEL', 'claude-sonnet-5-5'),
  effort: env('AI_EFFORT', 'medium'),
  sttKey: env('TRANSCRIBE_API_KEY', ''),
  sttUrl: env('TRANSCRIBE_URL', 'https://api.openai.com/v1/audio/transcriptions'),
  sttModel: env('TRANSCRIBE_MODEL', 'whisper-1'),
};
const client = CFG.key ? new Anthropic({ apiKey: CFG.key, maxRetries: 3, timeout: 10 * 60e3 }) : null;

/** Can the AI grade this skill now? */
const enabled = (skill) => !!client && (skill === 'writing' || (skill === 'speaking' && !!CFG.sttKey));

const r5 = (x) => Math.round(x * 2) / 2;
const bandOf = (v) => (Number.isFinite(+v) ? Math.max(0, Math.min(9, r5(+v))) : null);
const words = (s) => String(s || '').trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
const LANG = { ru: 'Russian', kk: 'Kazakh', en: 'English' };

/* ------------------------------------------------------------- schemas */

const S = (type, extra) => ({ type, ...extra });
const str = S('string'), int = S('integer'), num = S('number');
const arr = (items) => S('array', { items });
const obj = (properties) => S('object', { properties, required: Object.keys(properties), additionalProperties: false });
const oneOf = (...vals) => S('string', { enum: vals });

const W_CRIT = ['taskResponse', 'coherenceCohesion', 'lexicalResource', 'grammaticalRange'];
const W_CRIT_E = oneOf(...W_CRIT);
const WRITING_SCHEMA = obj({
  criteria: obj(Object.fromEntries(W_CRIT.map((k) => [k, num]))),
  feedback: str,
  criteriaNotes: arr(obj({ criterion: W_CRIT_E, why: str, nextBand: str })),
  strengths: arr(str),
  nextSteps: arr(str),
  errors: arr(obj({ quote: str, correction: str, issue: str, criterion: W_CRIT_E })),
  vocabulary: arr(obj({ word: str, better: arr(str), note: str })),
  developmentTips: arr(obj({
    area: oneOf('ideas', 'examples', 'argument', 'structure', 'introduction', 'conclusion', 'overview', 'data', 'linking', 'tone'),
    paragraph: int, tip: str, example: str,
  })),
  paragraphs: arr(obj({ index: int, role: oneOf('intro', 'overview', 'body', 'conclusion', 'greeting', 'purpose', 'bullet'), comment: str })),
  sentences: arr(obj({ paragraph: int, original: str, improved: str, criterion: W_CRIT_E, why: str })),
  improvedEssay: arr(str),
});

const S_CRIT = ['fluencyCoherence', 'lexicalResource', 'grammaticalRange'];
const SPEAKING_SCHEMA = obj({
  criteria: obj(Object.fromEntries(S_CRIT.map((k) => [k, num]))),
  feedback: str,
  strengths: arr(str),
  improvements: arr(str),
});

/* ------------------------------------------------------------- prompts */

const EXAMINER = `You are a certified, experienced IELTS examiner. You grade a student's work strictly by the public IELTS band descriptors, the way a real examiner would on test day: neither generous nor harsh. Bands are whole or half numbers from 0 to 9.

The students are learners in Kazakhstan preparing for IELTS on an online platform. Your report is what they study from, so every comment must be specific to their text, point at what they actually wrote, and tell them what to do next.

Language: write every explanation, comment and tip in the language the request names. Keep the student's quotes, corrections, improved sentences, vocabulary and examples in English.`;

const WRITING_RULES = `Grade this IELTS Writing task on the four criteria:
- taskResponse: Task Achievement for Task 1 (overview, key features, accurate data, no opinion) or Task Response for Task 2 (all parts answered, clear position, developed and supported ideas). For a General Training letter: purpose, every bullet covered, right tone.
- coherenceCohesion: paragraphing, logical progression, cohesive devices used accurately and not mechanically, referencing.
- lexicalResource: range, precision, collocation, less common items, spelling and word formation.
- grammaticalRange: range of structures, complex sentences, accuracy, punctuation.

Penalise as an examiner would: under the word minimum (Task Response/Achievement suffers), memorised or off-topic text, missing overview in Task 1, no clear position in Task 2.

Fill the report:
- criteria: the band for each criterion.
- feedback: 2–3 sentences, the overall verdict and the single most important thing to fix.
- criteriaNotes: one per criterion, in the order above: "why" this band (cite the text), "nextBand" what exactly would lift it half a band or a band.
- strengths: 2–4 things done well. nextSteps: 3–5 concrete actions, most important first.
- errors: the real mistakes (grammar, word choice, spelling, punctuation), up to 15, most serious first. "quote" must be copied character for character from the student's text (a short span, unique if possible) so it can be highlighted; "correction" is the fixed span; "issue" explains the rule briefly.
- vocabulary: up to 8 plain or repeated words from the text with 2–3 better, natural alternatives that fit the context.
- developmentTips: 3–5 tips on content and organisation (not grammar); "paragraph" is the paragraph number (1-based) or 0 for the whole text; "example" is an English sentence showing the tip applied to this essay.
- paragraphs: one per paragraph of the student's text, in order (index is 1-based): its role and a one-sentence comment.
- sentences: 5–10 of the student's weakest sentences: "original" copied exactly, "improved" rewritten at about one band higher than the student's level (natural, not over-complicated), "why" what changed.
- improvedEssay: the student's essay rewritten paragraph by paragraph (same number of paragraphs, same ideas and position) at about one band above the student's overall band.`;

const SPEAKING_RULES = `Grade this IELTS Speaking answer from the transcripts of the student's recordings. You get the examiner's questions, each answer's transcript (made by a speech-to-text system, so ignore its punctuation and occasional mis-heard word) and how long the student spoke.

Grade three criteria: fluencyCoherence (length and development of answers, hesitation, fillers, logical linking, relevance), lexicalResource (range, precision, idiomatic and less common language, paraphrase), grammaticalRange (range and accuracy of structures). Pronunciation cannot be judged from text, so it is not graded. Very short answers, answers that do not address the question and long silences lower the bands as they would in the exam.

Fill the report:
- criteria: the band for each criterion.
- feedback: 2–3 sentences, the overall verdict and the most important thing to work on.
- strengths: 2–4 things done well, citing what the student said.
- improvements: 3–6 concrete improvements, each citing a phrase the student used and a better English alternative.`;

/* ---------------------------------------------------------------- call */

async function ask(system, user, schema) {
  const stream = client.beta.messages.stream({
    model: CFG.model,
    max_tokens: 32000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: CFG.effort, format: { type: 'json_schema', schema } },
    system,
    messages: [{ role: 'user', content: user }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw Object.assign(new Error('refused'), { code: 'refused' });
  if (msg.stop_reason === 'max_tokens') throw Object.assign(new Error('too_long'), { code: 'too_long' });
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  try { return { data: JSON.parse(text), model: msg.model }; } catch { throw Object.assign(new Error('bad_json'), { code: 'bad_json' }); }
}

function taskText(doc) {
  const parts = [
    `Task: ${doc.kind === 'task2' ? 'Writing Task 2 (essay)' : doc.module === 'general' || doc.taskKind === 'task1_general' ? 'Writing Task 1, General Training (letter)' : 'Writing Task 1, Academic (visual report)'}`,
    `Minimum words: ${doc.minWords || (doc.kind === 'task2' ? 250 : 150)}`,
    doc.question && `Question:\n${doc.question}`,
    doc.bullets?.length && `Bullet points:\n- ${doc.bullets.join('\n- ')}`,
    doc.chart && `Data shown in the visual (JSON):\n${JSON.stringify(doc.chart)}`,
    doc.table && `Table shown (JSON):\n${JSON.stringify(doc.table)}`,
    !doc.chart && !doc.table && doc.visual && `The task shows a ${doc.visual} that is not available to you as data: judge the description's structure, overview and language, not the accuracy of its figures.`,
  ];
  return parts.filter(Boolean).join('\n\n');
}

async function gradeWriting(row, lang) {
  const doc = C.doc(row.test_id)?.document || {};
  const text = row.answers?.text || '';
  const user = `Write the explanations in ${LANG[lang] || 'Russian'}.\n\n${taskText(doc)}\n\nThe student's text (${words(text)} words):\n<essay>\n${text}\n</essay>`;
  const { data: d, model } = await ask(`${EXAMINER}\n\n${WRITING_RULES}`, user, WRITING_SCHEMA);
  const criteria = Object.fromEntries(W_CRIT.map((k) => [k, bandOf(d.criteria?.[k])]));
  if (Object.values(criteria).some((v) => v == null)) throw Object.assign(new Error('bad_bands'), { code: 'bad_json' });
  const band = r5(W_CRIT.reduce((s, k) => s + criteria[k], 0) / W_CRIT.length);
  return {
    band,
    result: {
      criteria, feedback: d.feedback,
      errors: (d.errors || []).filter((e) => e.quote && text.includes(e.quote)),
      rewrites: (d.sentences || []).map((s) => ({ original: s.original, improved: s.improved })),
      details: {
        criteriaNotes: d.criteriaNotes, strengths: d.strengths, nextSteps: d.nextSteps, vocabulary: d.vocabulary,
        developmentTips: (d.developmentTips || []).map((x) => ({ ...x, paragraph: x.paragraph || null })),
        paragraphs: d.paragraphs, sentences: d.sentences, improvedEssay: d.improvedEssay,
      },
      gradedBy: 'ai', model,
    },
  };
}

/* ------------------------------------------------------------- speaking */

const itemsOf = (doc) => (doc.kind === 'part2' ? [{ id: doc.id || 'cue', question: doc.cue, bullets: doc.bullets || [] }] : doc.questions || []);

async function transcribe(buf, mime) {
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: mime || 'audio/wav' }), 'answer.wav');
  fd.append('model', CFG.sttModel);
  fd.append('language', 'en');
  fd.append('response_format', 'json');
  const res = await fetch(CFG.sttUrl, { method: 'POST', headers: { Authorization: `Bearer ${CFG.sttKey}` }, body: fd, signal: AbortSignal.timeout(120e3) });
  if (!res.ok) throw Object.assign(new Error('transcribe ' + res.status), { code: 'transcribe_failed' });
  return String((await res.json())?.text || '').trim();
}

async function gradeSpeaking(row, lang) {
  const doc = C.doc(row.test_id)?.document || {};
  const qs = Object.fromEntries(itemsOf(doc).map((q) => [q.id, q]));
  const { rows: audio } = await pool.query('SELECT item_id, duration, mime, data FROM attempt_audio WHERE attempt_id = $1 ORDER BY id', [row.id]);
  const items = row.result?.items || [];
  for (const it of items) {
    const a = audio.find((x) => x.item_id === it.itemId);
    it.transcript = a ? await transcribe(a.data, a.mime) : null;
    const n = words(it.transcript);
    it.wpm = n && it.durationSec ? Math.round(n / (it.durationSec / 60)) : null;
  }
  if (!items.some((it) => words(it.transcript) >= 3)) throw Object.assign(new Error('no_speech'), { code: 'no_speech' });
  const answers = items.map((it, i) => {
    const q = qs[it.itemId] || {};
    return `Question ${i + 1}: ${q.question || it.itemId}${q.bullets?.length ? `\nCue card points: ${q.bullets.join('; ')}` : ''}\nSpoke for ${Math.round(it.durationSec || 0)} s\nTranscript: ${it.transcript || '(no answer)'}`;
  }).join('\n\n');
  const user = `Write the explanations in ${LANG[lang] || 'Russian'}.\n\nIELTS Speaking Part ${String(doc.kind || '').slice(4) || '?'}: ${doc.title || ''}\n\n${answers}`;
  const { data: d, model } = await ask(`${EXAMINER}\n\n${SPEAKING_RULES}`, user, SPEAKING_SCHEMA);
  const criteria = Object.fromEntries(S_CRIT.map((k) => [k, bandOf(d.criteria?.[k])]));
  if (Object.values(criteria).some((v) => v == null)) throw Object.assign(new Error('bad_bands'), { code: 'bad_json' });
  const band = r5(S_CRIT.reduce((s, k) => s + criteria[k], 0) / S_CRIT.length);
  return { band, result: { items, criteria: { ...criteria, pronunciation: null }, feedback: d.feedback, strengths: d.strengths, improvements: d.improvements, gradedBy: 'ai', model } };
}

/* ----------------------------------------------------------------- jobs */

const running = new Map();

/** Starts grading a queued ('pending_ai') attempt in the background; true if it is (now) being graded. */
function start(id, lang) {
  id = Number(id);
  if (running.has(id)) return true;
  if (!client) return false;
  const job = run(id, lang).catch((e) => console.error('[ai] job', id, e)).finally(() => running.delete(id));
  running.set(id, job);
  return true;
}

async function run(id, lang) {
  const { rows } = await pool.query(
    `UPDATE attempts SET status = 'grading', result = jsonb_set(result, '{status}', '"grading"')
      WHERE id = $1 AND status = 'pending_ai' RETURNING *`, [id]);
  const row = rows[0];
  if (!row) return;
  lang = lang || row.result?.uiLang || 'ru';
  try {
    if (!enabled(row.skill)) throw Object.assign(new Error('disabled'), { code: 'grading_unavailable' });
    const g = row.skill === 'writing' ? await gradeWriting(row, lang) : await gradeSpeaking(row, lang);
    await pool.query('UPDATE attempts SET status = $2, band = $3, result = result || $4::jsonb WHERE id = $1',
      [id, 'done', g.band, JSON.stringify({ ...g.result, status: 'done', gradedAt: new Date().toISOString() })]);
    console.log('[ai] graded', row.skill, id, '→', g.band);
  } catch (e) {
    const code = e.code || (e instanceof Anthropic.APIError ? 'api_' + (e.status || 'error') : 'failed');
    console.error('[ai] grading failed', row.skill, id, code, e.message);
    // a teacher grades it instead
    await pool.query('UPDATE attempts SET status = $2, result = result || $3::jsonb WHERE id = $1',
      [id, 'pending_review', JSON.stringify({ status: 'pending_review', aiError: code })]);
  }
}

/** After a restart: re-queue work cut off mid-grading, and grade the queue (or hand it to teachers if AI is off). */
async function resume() {
  await pool.query(`UPDATE attempts SET status = 'pending_ai', result = jsonb_set(result, '{status}', '"pending_ai"') WHERE status = 'grading'`);
  const { rows } = await pool.query(`SELECT id, skill FROM attempts WHERE status = 'pending_ai' ORDER BY id`);
  for (const r of rows) {
    if (enabled(r.skill)) start(r.id);
    else await pool.query(`UPDATE attempts SET status = 'pending_review', result = jsonb_set(result, '{status}', '"pending_review"') WHERE id = $1`, [r.id]);
  }
  console.log('[ai]', client ? `on (${CFG.model}; speaking ${CFG.sttKey ? 'on' : 'off: no TRANSCRIBE_API_KEY'})` : 'off: no ANTHROPIC_API_KEY, writing and speaking go to teachers', rows.length ? `· ${rows.length} queued` : '');
}

module.exports = { enabled, start, resume, isRunning: (id) => running.has(Number(id)) };
