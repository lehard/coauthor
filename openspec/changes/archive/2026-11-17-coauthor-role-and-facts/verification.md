# Verification: coauthor-role-and-facts

## Local (2026-11-17)

- Static: `./scripts/validate.sh`, `git diff --check` — passed; `./scripts/dev.sh test` — 1128 passed.
- Model (real co-author on demo stories, 13 questions, read by eye, no judge): films for the mood, the shift on a Volga
  ferry and the longest bridge over the Volga — before a refusal, after a web search with links; Misha found by
  `search_story` «Миша»; the weather — a short refusal; questions about the story and the craft — no web search; no
  announcement before tools in 10 of 10 factual answers after the stronger rule.

## Server (2026-11-17, release v0.3.28)

- The deploy workflow of v0.3.28 passed; `GET https://app.soavtor.app/os/health` — 200.
- In `agentos-api`, the prompt of the co-author (`agent_prompt("coauthor")`) has the new rule of searching the story by
  one word.
- Not checked on the server: answers of the co-author in the chat (needs an author's sign-in).
