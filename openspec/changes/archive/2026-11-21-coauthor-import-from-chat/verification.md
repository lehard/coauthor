# Verification: coauthor-import-from-chat

## Server (2026-11-21, release v0.3.31)

- The deploy workflow of v0.3.31 passed (validate, deploy, `deploy/check_site.sh`, `deploy/check_admin.sh`).
- `https://app.soavtor.app/os/health` answers 200, `/os/agents` without a token 401, `https://app.soavtor.app/` 200.
- The server checkout is at tag `v0.3.31`; `agentos-migrate` exited 0, `authorled.alembic_version` is
  `0020_suggestion_paragraphs`; `agentos-api` is up after the restart, the other services healthy.
- Not checked on the server: the co-author in the chat after a sign-in (a typed suggestion and its acceptance, the
  import of a chat file), and Safari.
