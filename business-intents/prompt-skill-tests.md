# Бизнес-интент: тесты загрузки промптов агентов из навыков

Статус: решения согласованы с владельцем 2026-11-17; change `prompt-skill-tests` реализован и архивирован 2026-11-17 (`openspec/changes/archive/2026-11-17-prompt-skill-tests/`); не выкачен. Владелец: lehard. Обновлено: 2026-11-17.
Рамки: спека `api/agents`, требование «Соавтор» (сценарии «Промпт из навыка», «Нет навыка», «Неверный заголовок навыка»); `business-intents/agent-prompts-as-skills.md`; `openspec/context/06-testing-and-quality.md`.

## Why

В change `coauthor-role-and-facts` (2026-11-17) задача 1.1 требовала проверить, что «тест промптов загружает навык (`./scripts/dev.sh test`)». Такого теста в `agno/tests` нет: на `agents/prompts.py` нет ни одного теста. Загрузку промпта соавтора пришлось проверять вручную, вызовом `agent_prompt("coauthor")`.

При этом спека `api/agents` («Соавтор») описывает три сценария загрузки:
- промпт берётся из навыка `agno/skills/coauthor/SKILL.md`;
- без файла старт падает с ошибкой, называющей путь;
- при неверном заголовке (`name` не `coauthor`, нет `description`) старт падает с ошибкой, называющей файл и причину.

Код это делает (`agent_skill` в `agno/agents/prompts.py`), но сейчас это видно только по тому, что API не стартует. Сломанный `SKILL.md` или регрессия в `agent_skill` обнаружатся на стенде или в релизе, а не в `dev.sh test`. Владелец попросил исправить расхождение (2026-11-17).

## What Changes

1. **Тест загрузки настоящего навыка соавтора.** `agent_skill("coauthor")` даёт `name` `coauthor`, непустые описание и тело. Тело совпадает с текстом `SKILL.md` после заголовка.
2. **Тесты отказов `agent_skill` на временных навыках:**
   - нет `SKILL.md` — `RuntimeError` с путём к файлу;
   - `name` не равен id агента — ошибка с файлом и причиной;
   - пустое `description` — ошибка с файлом и причиной;
   - пустое тело — ошибка с файлом и причиной;
   - нечитаемый или невалидный заголовок (Agno `LocalSkills` пропускает навык или отказывает) — ошибка, а не агент без промпта.
3. **Все навыки репозитория загружаются.** Каждый каталог в `agno/skills/` (соавтор, оркестратор, домены экзамена маршрутизации) проходит `agent_skill` по своему имени. Так сломанный навык экзамена тоже ловит `dev.sh test`, а не только запуск экзамена.

4. **Ошибка Agno с файлом.** При `/opsx:propose` выяснилось: Agno `LocalSkills` сам отклоняет навык без `description`, с пустым `description`, с `name`, не равным каталогу, и с битым заголовком. Отклоняет он своей `SkillValidationError`, где файла нет, например «Missing required field in frontmatter: description». Спеке («Неверный заголовок навыка») нужна ошибка с файлом и причиной. Решение владельца (2026-11-17): `agent_skill` перехватывает `SkillValidationError` и бросает `RuntimeError` с путём к `SKILL.md` и причиной Agno (`raise … from error`). Промпт при этом не подменяется.

## Scope

- Новый `agno/tests/test_prompts.py`. Без базы и без модели: временные навыки создаются в `tmp_path`, а каталог навыков подменяется через `SKILLS_DIR` или `skill_dir`.
- `agno/agents/prompts.py`: перехват `SkillValidationError` в `agent_skill` (п. 4).

## Non-goals

- Проверка поведения модели по промпту: это evals и проверка глазами.
- Проверка, что системное сообщение хода содержит тело `SKILL.md` целиком (часть сценария «Промпт из навыка»): для этого нужен запуск агента. Достаточно того, что `coauthor.instructions` равно `agent_prompt("coauthor")`.
- Изменения Agno `LocalSkills`.

## Constraints (из контекст-пака)

- Ответы LLM в pytest не проверяются (06-testing-and-quality, 07-anti-patterns п. 21).
- Без fallback: тест проверяет именно явный отказ, а не подмену промпта.

## Acceptance criteria

- `./scripts/dev.sh test` запускает `test_prompts.py`, и тесты проходят на текущих навыках.
- Удалённый или испорченный `SKILL.md` соавтора (`name`, `description`, тело) роняет тест, а сообщение называет файл и причину.
- Каждый каталог в `agno/skills/` загружается тестом.
- `coauthor.instructions` равно телу `SKILL.md` соавтора.

## Risks

- **Импорт `agents.coauthor` в тесте тянет настройки старта** (цены биллинга, ключи Яндекса). Сверку `coauthor.instructions` нужно делать там, где эти настройки уже есть (`dev.sh test` их даёт), или сравнивать без импорта агента. Решить при `/opsx:propose`.

## Open Questions

- Нет.

## References

- `agno/agents/prompts.py` (`agent_skill`, `agent_prompt`, `SKILLS_DIR`), `agno/agents/coauthor.py`.
- `openspec/specs/api/agents/spec.md`, «Соавтор»: «Промпт из навыка», «Нет навыка», «Неверный заголовок навыка».
- `openspec/changes/archive/2026-11-17-coauthor-role-and-facts/tasks.md`, задача 1.1.
- `business-intents/agent-prompts-as-skills.md`.
