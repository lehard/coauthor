# Verification: glavai-credit

## Local (2026-11-19)

- Static: `./scripts/validate.sh`, `git diff --check`, `openspec validate glavai-credit --strict`; `check:contrast` with
  the new pair `muted-foreground` on `paper` passes in light, sepia and dark.
- Deterministic: the site build check requires the credit link in the footer of every page; with a broken address it
  fails and names each page. `npm run check:behaviour --prefix site` passed three runs in a row (two earlier runs failed
  in «В начале сценария» with different values; the footer does not touch that block).
- Chromium and Safari (safaridriver): the footer credit at 1440, 800 and 375–400 px without horizontal scroll. The
  settings credit after a dev sign-in: in all three themes, at 375 px, no request to glavai.ru, absent on the shelf,
  trash and story window.

## Server (2026-11-19, release v0.3.30)

- The deploy workflow of v0.3.30 passed (validate, deploy, `deploy/check_site.sh`).
- `https://soavtor.app/`, `/legal/offer/`, `/legal/privacy/`, `/pricing/`, `/privacy/`: the footer has the credit link
  `https://glavai.ru/cases/soavtor-landing?utm_source=soavtor&utm_medium=credit` with `target="_blank"` and
  `rel="noopener"`.
- `https://app.soavtor.app/`: the served bundle holds the settings credit
  `https://glavai.ru/cases/soavtor?utm_source=soavtor-app&utm_medium=credit`; both case pages on glavai.ru answer 200.
- Not checked on the server: the settings screen after a sign-in and Safari.
