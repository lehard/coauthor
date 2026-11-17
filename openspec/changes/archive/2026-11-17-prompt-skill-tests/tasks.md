# Tasks

## 1. Ошибка навыка с файлом

- [x] 1.1 В `agent_skill` (`agno/agents/prompts.py`) перехватить `SkillValidationError` Agno вокруг `LocalSkills(...).load()` и бросить `RuntimeError(f"{skill_md}: {error}") from error` (design, решение 1). Проверить `ruff` и `mypy` по файлу.

## 2. Тесты

- [x] 2.1 Новый `agno/tests/test_prompts.py` (design, решения 2–4):
  - навык соавтора: `name` `coauthor`, `description` и тело не пусты, тело — текст `SKILL.md` после заголовка;
  - AST `agents/coauthor.py`: `instructions=agent_prompt(COAUTHOR_ID)`, `COAUTHOR_ID == "coauthor"`;
  - на временных навыках `RuntimeError` с путём к `SKILL.md` и причиной: нет файла; нет `description`; пустое `description`; `name` не равен id; битый YAML; нет заголовка; пустое тело;
  - каждый каталог `agno/skills/*/` с `SKILL.md` загружается по своему имени, список не пуст.

  Проверить: `pytest tests/test_prompts.py` проходит; при временно испорченном `description` в копии навыка соответствующий тест падает с путём в сообщении.
- [x] 2.2 `./scripts/validate.sh`, `git diff --check` и `./scripts/dev.sh test` в worktree проходят.

## Workflow follow-up

- Verify, архив, merge `origin/main`, проверки, PR и merge — по `AGENTS.md`, «OpenSpec is mandatory», шаг 4.
