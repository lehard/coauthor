# Verification: coauthor-web-search

## Local (2026-11-17)

- Static: `./scripts/validate.sh`, `git diff --check`, `openspec validate coauthor-web-search --strict` — passed.
- Deterministic: `./scripts/dev.sh test` — 1128 passed; `b0002_tool_usage_records` applied on the worktree database.
- Yandex Search API with the owner's key: a search gives XML with 5 results and passages (fixture `found.xml`); an
  invalid key — 401. An empty result (code 15) could not be produced; its fixture is hand-made.
- Model (real co-author on demo stories, read by eye): fact questions — `web_search` with short queries in own words,
  answers with links; questions about the story and the research brief — no web search; an invalid key — a refusal, the
  log has `HTTP 401`, nothing paid. Two searches in one answer got `HTTP 429` (quota 1 request per second) until the
  pause of decision 9a; after it both searches pass.

## Server (2026-11-17, release v0.3.28)

- `YANDEX_SEARCH_API_KEY` and `YANDEX_CLOUD_FOLDER_ID` added to `/etc/authorled/authorled.env` (copy
  `authorled.env.bak-2026-11-17`); a request from the server to Yandex Search API — 200, 5 results.
- The deploy workflow of v0.3.28 passed; `GET https://app.soavtor.app/os/health` — 200.
- Both variables are set in `agentos-api` (lengths 40 and 20); `billing.alembic_version` is `b0002_tool_usage_records`,
  `billing.tool_usage_records` exists (0 rows).
- In `agentos-api`, `agents.web_search.search("паромная переправа Волга")` — 5 results.
- Not checked on the server: a run of the co-author in the chat (needs an author's sign-in).
