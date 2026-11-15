# Verification: share-read-link-only

## Local (2026-11-15)

- Static: `./scripts/validate.sh`, `git diff --check`, `openspec validate share-read-link-only --strict` — passed.
- Browser (local stand, 1440 and 375 px): «Поделиться» of the owner shows only «Ссылка почитать»; the link opens
  without a token (200) and after «Отключить» answers 404, `/read/<key>` shows «Ссылка не работает: её отключили или
  она неверная».
- Model: one call, «Как пригласить редактора?» — the co-author says inviting is not possible yet and points to the link.
- Server code unchanged: server tests not re-run.

## Server (2026-11-15, release v0.3.27)

- The deploy workflow of v0.3.27 passed.
- `GET https://app.soavtor.app/os/health` — 200.
- The deployed frontend chunk `ProjectScreen-*.js` contains the new description of the window («Приглашать участников
  пока нельзя»).
