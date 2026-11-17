# Verification: prompt-skill-tests

## Local (2026-11-17)

- Static: `./scripts/validate.sh`, `git diff --check`, `openspec validate prompt-skill-tests --strict` — passed.
- Deterministic: `./scripts/dev.sh test` — 1156 passed (28 new in `tests/test_prompts.py`); with the old `agent_skill`
  5 refusal tests fail (no path in Agno's error), with the fix all pass.

## Server (2026-11-17, release v0.3.28)

- The deploy workflow of v0.3.28 passed; the API started with every skill (`GET https://app.soavtor.app/os/health` —
  200), and `agent_prompt("coauthor")` loads in `agentos-api`.
