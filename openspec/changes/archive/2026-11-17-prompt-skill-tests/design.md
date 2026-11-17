# Design: тесты загрузки промптов и ошибка навыка с файлом

## Context

`agent_skill(agent_id)` в `agno/agents/prompts.py`:
- проверяет, что `SKILL.md` есть;
- загружает его через `LocalSkills(path, validate=True).load()`;
- проверяет, что навык один, `name` равен id, тело и `description` не пусты.

На каждую свою ошибку он бросает `RuntimeError` с путём.

Проверка 2026-11-17 на Agno 3.1.10 (временные навыки) показала, что `LocalSkills` с `validate=True` раньше наших проверок бросает `SkillValidationError`:
- без `description` — «Missing required field in frontmatter: description»;
- с пустым `description` — «Field 'description' must be a non-empty string»;
- с `name`, не равным каталогу, — «Directory name 'coauthor' must match skill name 'other'»;
- с битым YAML — «Invalid YAML in frontmatter: …»;
- без заголовка — «SKILL.md must start with YAML frontmatter (---)».

Пути к файлу ни в сообщении, ни в атрибутах исключения нет (`errors` — список строк). Пустое тело Agno пропускает; его ловит наша проверка.

Тестов на `agents/prompts.py` нет. Импорт `agents.coauthor` тянет проверки старта: цены биллинга, настройки Яндекса.

## Goals / Non-Goals

**Goals:**
- Любой отказ загрузки навыка называет файл и причину.
- `dev.sh test` ловит сломанный навык любого агента репозитория.

**Non-Goals:**
- Свои проверки заголовка поверх Agno; запуск агента в тесте.

## Decisions

### 1. Перехват `SkillValidationError` с путём

`LocalSkills(...).load()` оборачивается в `try`: `except SkillValidationError as error: raise RuntimeError(f"{skill_md}: {error}") from error`.
- Тип исключения тот же, что у остальных отказов `agent_skill`.
- Причина Agno сохраняется целиком в тексте и в `__cause__`.

Это не fallback: ошибка не глушится и промпт не подменяется.

Проверки `name != agent_id` и пустого `description` остаются в `agent_skill`. Сейчас их опережает Agno, но они срабатывают, если Agno перестанет проверять сам (например, при `validate=False` в другой версии).

Альтернатива — свои проверки заголовка до `LocalSkills`. Отклонена: это дублирование валидации Agno.

### 2. Временные навыки через подмену `SKILLS_DIR`

`skill_dir` строит путь от модульной `SKILLS_DIR`. Тесты подменяют её через `monkeypatch.setattr(prompts, "SKILLS_DIR", tmp_path)` и пишут `tmp_path/<id>/SKILL.md`. Каталог называется по id агента, как в репозитории.

### 3. Промпт соавтора — без импорта агента

Чтобы не тянуть проверки старта, тест сверяет `agno/agents/coauthor.py` по AST: в вызове `Agent(...)` аргумент `instructions` — это `agent_prompt(COAUTHOR_ID)`, а `COAUTHOR_ID == "coauthor"`. Так же устроены тесты старта ClamAV и Яндекса (`test_clamav.py`, `test_web_search.py`).

Альтернатива — импорт `agents.coauthor` с переменными Яндекса в окружении теста. Отклонена: тест зависел бы от настроек, к промпту не относящихся.

### 4. Все навыки репозитория — параметризованным тестом

Список берётся из каталогов `agno/skills/*/` с файлом `SKILL.md`. Каждый проходит `agent_skill(<имя каталога>)`. Пустой список — падение теста: тест не может пройти, ничего не проверив.

## Risks / Trade-offs

- [Agno поменяет текст своих ошибок] → тесты проверяют путь к файлу и ключевое слово причины (`description`, `name`, `frontmatter`), а не текст целиком.
- [Новый навык с намеренно неполным заголовком] → в репозитории таких нет; тест 4 его поймает, и это правильно.

## Migration Plan

Только код загрузки и тесты: применяется с релизом, данных и настроек не трогает.
