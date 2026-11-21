# Tasks

## 1. Сброс фрагмента чата у начала и конца сценария

- [x] 1.1 Добавить `clearChatSelection` в `ProjectData` (`web/src/screens/project/ProjectContext.tsx`) из `useSelectionIn` в `ProjectScreen.tsx` (design, решение 1); в `TextDoc.tsx` передать его в `useEditorSuggestions` (у роли без чата `null`). Проверить: `npm run build --prefix web` проходит.
- [x] 1.2 В `selectSuggestion` (`web/src/editor/index.ts`) у `script_start` и `script_end` ставить курсор в начало или конец текста (design, решение 2). В «Обсудить в чате» (`useEditorSuggestions.tsx`) у этих мест вызывать `clearChatSelection()` после `selectSuggestion` и до `openChat()` (решение 3). Проверить: `npm run build`, `npm run lint` и `npm run check:editor --prefix web` проходят.

## 2. Проверка

- [x] 2.1 Проверить в браузере на локальном стенде (источник `api`) все сценарии дельты:
  - после «Обсудить» у вставки в конец сцены в чате «Выделено: …»;
  - затем «Обсудить» у `script_start` — плашки нет и через секунду, выделения в тексте нет, чат открыт, карточка закрыта;
  - то же у `script_end`;
  - «Обсудить» у `after` по-прежнему даёт «Выделено: «<якорь>»».

  Записать результат в `tmp/VERIFY.md`.
- [x] 2.2 Прогнать `./scripts/validate.sh` (через `env -u BASH_ENV`) и `git diff --check`, оба проходят.

## Workflow follow-up

- Verify, archive со сверкой спек, `git merge origin/main`, проверки, PR в `main`, ожидание проверок и merge — по правилам `AGENTS.md`.
