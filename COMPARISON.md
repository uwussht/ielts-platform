# IELTS platform vs ai-tutor: comparison

Status as of 2026-11-02. Every hub screen was compared side by side with the live ai-tutor on `test_student`, read-only (GET plus view switches; nothing submitted). Compared: Сегодня, План, Практика, Mock-тесты, Прогресс, Об экзамене, Словарь. Each spec was also compared while it was built.

Our app ran in demo mode, so the numbers and titles differ from the live account. The comparison covers structure, order, labels and states.

All new screens were checked in demo mode (`?demo=1`):

- dark and light themes
- widths 375, 768, 1024 and 1440 px, with no horizontal scroll
- no new console errors

## Fixed after the live comparison

- **Сегодня:** the block order now matches ai-tutor. The goal banner is full width on top, then today's tasks next to Зона роста, then the weekly control full width. Before, the goal banner sat in the right column under the tasks.
- **Об экзамене:** rebuilt to the live structure:
  - title with the Academic/GT switch on the right, and no kicker line
  - five picker cards (four sections plus "Вопросы об экзамене")
  - one content card with the heading "Section · оба трека / track"
  - numbered parts, with "Критерии" open by default
  - quick answers as inline accordions (not dialogs), with "Другие частые вопросы" nested inside
- **Словарь:**
  - Мой словарь now comes before "Топ 3".
  - "Топ 3" got the "Стоит повторить" label and a "Начать практику" button (it practises those words and saves locally only).
  - Saved words show their translation.

## Matches the live app

- **План:** same structure (Роадмап/Неделя/Месяц, weeks, days, controls).
- **Практика:** same text block for block. Drill durations come from each test's time limit, exactly as in ai-tutor; demo drills have no limit, so they show 5 min.
- **Mock-тесты:** includes the "Итога нет", "Без итога" and "Проверка не удалась" states.
- **Прогресс:** same filters, cards, chart, frequent errors and history.

## Screens ported

| Area | Screens |
|---|---|
| Hub | Сегодня, План, Практика, Mock-тесты, Прогресс, Словарь, Об экзамене |
| Runners | Reading, Listening, Writing (Task 1/2 + AI check), Speaking (Part 1–3 + AI check), reviews |
| Mock session | intro → equipment check → sections → between → submitted (polling, uploads) → result → review; resume, autosave, abort |
| Onboarding | 6 questions, guide, quiz, diagnostic (adaptive Listening, Reading, Writing, Speaking), diagnostic result, route choice |
| Account | sign-in (password / code), registration (language → name + date of birth → contacts → code → password), locked/demo state, pricing |

## Not reproduced, and why

| What | Why |
|---|---|
| Mascots (Декстер, cheer animations) | Not part of the TeenTech design system. Replaced with icons. |
| Purple banners and accents | The TeenTech rule is no purple. Replaced with the #FFD400 yellow and graphite. |
| Луна (AI assistant) | Removed at the user's request on 2026-11-05: no floating button, chat or assistant API calls. |
| Google sign-in | The OAuth client is bound to the ai-tutor domain, so it can't run on another origin. |
| Real prices on the pricing screen | ai-tutor gives no public prices. Plans show "Цену уточнит менеджер" plus a WhatsApp link. |
| General (non-IELTS) vocabulary levels and fields in Словарь | Out of scope: they belong to the general English course, not IELTS. |
| Speaking pitch analysis; shadowing tour | Simplified to a volume meter. The tour is a dialog, not a step-by-step overlay. |
| Speaking TTS voice | Uses the browser's `speechSynthesis` when server audio is missing, so the voice depends on the browser. Words-per-minute depends on the browser too. |
| EN / KK text on the new spec D screens | The exported dictionaries had no strings for registration, quota or pricing. These screens fall back to Russian. |

## Unverified against the live backend

- `markVocabLearned` sends `{ids}`. The body shape is inferred; I didn't send it on the live account.
- Registration, OTP and mock start/submit were tested only against demo fixtures. Creating accounts or starting mocks on the live account would be a real side effect.
- Speaking diagnostic: the prep hint says recording starts on its own, but in the diagnostic the user presses record. It's a text mismatch only.
- Seeded demo mock sections have no attempt id, so the Listening review of seeded data shows "Не удалось загрузить". This happens only in demo mode.
