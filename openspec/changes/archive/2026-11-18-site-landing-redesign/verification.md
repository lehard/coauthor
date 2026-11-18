# Verification: site-landing-redesign

## Local (2026-11-18)

- Static: `./scripts/validate.sh`, `git diff --check`, `openspec validate site-landing-redesign --strict`, the site build
  with `check-build.mjs` — passed; scripts of the main page 84.0 KB gzip.
- Deterministic: `npm run check:behaviour --prefix site` on the built site — passed at 1440×900 and 918×900 with and
  without JavaScript, 390×844 by touch with reduced motion and without JavaScript, windows 1000×862 and 1024×768.
- Chromium against the mock at 390, 918 and 1440 px: the heights of the first five blocks match to the pixel; the beta
  block is 16–20 px taller (the existing form component).
- Safari (safaridriver, outside the sandbox of Claude Code): at 1440 px the blocks, the edges of the first screen and the
  ends of the 16 lines of the layers match the mock. At 390 and 918 px the page is 10 px narrower than the window: the
  `::-webkit-scrollbar` style of `web/src/design-system/typography.css` takes room in desktop Safari; at 918 px the
  three questions wrap to a second row.

## Server (2026-11-18, release v0.3.29)

- The deploy workflow of v0.3.29 passed (including `deploy/check_site.sh`).
- `https://soavtor.app/`, `/privacy/`, `/legal/offer/` — 200; the main page has «Что стоит за одним ответом», «Дай ключ
  на тринадцать», «Пример из беты» and the header button, no `suggestion-1440`; `/shots/workspace-1440.webp` — 200, the
  new screenshot (75 212 bytes).
- `npm run check:behaviour --prefix site` with `SITE_URL=https://soavtor.app/` — passed at every size of the local run
  (the beta request is answered by the check itself, nothing reached the server).
- The layers of «Что стоит за одним ответом» are shown before Story Architecture Framework is connected to the product
  (owner's decision of 2026-11-18).
- Not checked on the server: Safari.
