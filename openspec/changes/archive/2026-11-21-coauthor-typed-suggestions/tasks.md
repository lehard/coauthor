# Tasks

## 1. Ядро: хранение и проверка предложений абзацами

- [x] 1.1 Добавить в `agno/core/tables.py` столбцы `place` и `paragraphs` таблицы `suggestions`, сделать `scene_uid`, `quote` и `text` необязательными и заменить `quote_not_empty` ограничениями по месту (design, решение 4). Написать вручную миграцию `<следующий номер>_suggestion_paragraphs`. Проверить:
  - `./scripts/dev.sh migrate` в worktree проходит;
  - `validate.sh` видит одну голову и совпадение таблиц с базой;
  - pytest на ограничения: строка у `after`, `scene_uid` у `script_end`, пустая цитата у `after`, абзацы и строка вместе — отклоняются;
  - pytest: предложение, вставленное до миграции, после неё имеет `place` `replace`, прежние `quote` и `text` и пустые `paragraphs`.
- [x] 1.2 В `agno/core/review.py` добавить место и абзацы в `Suggestion` и `create_suggestion`, проверку полей места и абзацев по `ELEMENT_NAMES` (design, решение 3); маршрут участника записывает `place` `replace`. Проверить pytest в `agno/tests/test_review.py`:
  - каждое из шести мест создаётся и не меняет ревизию текста;
  - неизвестный тип, пустой список, 301 абзац, пустой абзац, перенос строки, лишняя цитата у `script_end`, нет цитаты у `after`, строка у `scene_end`, нет сцены у `scene_end` — отказ с причиной, предложения нет.
- [x] 1.3 Отдать `place` и `paragraphs` в `SuggestionOut` (`agno/app/api/schemas.py`), `null` у `text`, `scene_uid` и `quote` по месту. Проверить pytest в `agno/tests/test_review_routes.py`:
  - список отдаёт предложение строкой с `paragraphs` `null`;
  - список отдаёт предложение `script_end` с `scene_uid`, `quote` и `text` `null`;
  - `POST` участника по-прежнему создаёт `replace` строкой;
  - решение и снимок `suggestion` работают у предложения абзацами.

## 2. Инструмент и промпт соавтора

- [x] 2.1 Расширить `suggest_edit` в `agno/agents/coauthor_tools.py` параметрами `place` и `paragraphs` (design, решение 1). Описание перечисляет места и типы с русскими названиями, ответ называет место и число абзацев. Проверить pytest в `agno/tests/test_coauthor_tools.py`:
  - прежние вызовы проходят без правки;
  - `after` с тремя абзацами создаёт предложение с их типами;
  - тип `speech` даёт отказ с допустимыми типами;
  - `script_start` в драфте с новым пустым сценарием создаётся;
  - инструмент по-прежнему без подтверждения.
- [x] 2.2 Дополнить раздел о `suggest_edit` в `agno/skills/coauthor/SKILL.md` правилами разметки по типам и выбора места (design, решение 8). Проверить: pytest проверки промпта (`agents/prompts.py`, тесты навыков) проходит; ответы соавтора на просьбы из 4.1 прочитать глазами при прогоне замера.

## 3. Экран текста: показ и принятие абзацами

- [x] 3.1 Обновить модель данных (design, решение 7): `Suggestion` в `web/src/data/model.ts`, строгий `toSuggestion` в `apiProvider.ts` и образцы в `fixtures.ts`. Проверить: `npm run build --prefix web` проходит; проверка разбора отказывает на неизвестный тип и место.
- [x] 3.2 Добавить `findBlockPlace` в `web/src/editor/anchors.ts`, карту `blocks` в состояние плагина `suggestions` и команду `acceptBlockSuggestion` (design, решения 5–6). Проверить `npm run check:editor --prefix web`, случаи:
  - место каждого из шести мест;
  - `null` без сцены или цитаты;
  - место следует за вставкой абзаца выше;
  - «Принять» `script_end` даёт абзацы с типами и новый `uid` у заголовка, а одно undo убирает всё;
  - «Принять» `script_start` в новом пустом тексте заменяет весь текст;
  - `scene_body` сохраняет заголовок;
  - `replace` с абзацами заменяет абзац целиком.
- [x] 3.3 Показать блоки в `suggestionsPlugin.ts` и `ScreenplayEditorHandle`:
  - зачёркнутые абзацы и виджет с абзацами по типам;
  - клик и обход;
  - `suggestionAnchor`, `scrollToSuggestion`, `selectSuggestion`.

  Разделить строки и блоки в `useEditorSuggestions.tsx`. Карточка и список «Нет места в тексте» в `SuggestionViews.tsx` показывают абзацы с названиями типов (design, решения 5 и 7). Проверить `./web/scripts/check_web_tokens.sh` (классы на семантических токенах) и сборку.
- [x] 3.4 Проверить в браузере на локальном стенде с источником `api`: предложение `after`, `scene_end` и `script_start` на новой истории. Блок виден на месте, карточка с типами, «Принять» и одно ⌘Z, «Отклонить» не меняет ревизию, удалённая сцена уводит предложение в «Нет места в тексте». Вёрстку блока проверить и в Safari. Записать результат в `tmp/VERIFY.md`.

## 4. Замер действий

- [x] 4.1 Добавить в `agno/evals/coauthor/actions.toml` около 6 просьб на `suggest_edit` с `suggest_place`, `types` и `empty_text` (design, решение 9) и описать ключи в шапке файла. Расширить разбор в `actions.py` и проверки и подготовку пустого сценария в `actions_run.py`. Проверить pytest в `agno/tests/test_coauthor_actions.py`:
  - нет `suggest_place`, неизвестный тип или место, ключи у другого инструмента — ошибка до модели;
  - проверка мест и подпоследовательности типов на готовых предложениях;
  - `empty_text` даёт копии новый пустой сценарий, открытый драфт не меняется;
  - `test_coauthor_eval.py` по-прежнему проходит.
- [x] 4.2 Прогнать `python -m evals.coauthor actions-run` на новых просьбах (по `--sample`, отобрав их) на стенде. Новые просьбы должны проходить. Провалы по типам разобрать и при необходимости поправить промпт (2.2). Цену и результат записать в `tmp/VERIFY.md`.

## 5. Сквозная проверка

- [x] 5.1 Прогнать `./scripts/validate.sh` (через `env -u BASH_ENV`), `./scripts/dev.sh test` и `git diff --check`, все проходят.

## Workflow follow-up

- Verify (`openspec-verify-change`), archive со сверкой спек, `git merge origin/main`, проверки, PR в `main`, ожидание проверок и merge — по правилам `AGENTS.md`.
