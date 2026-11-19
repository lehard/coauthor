# Tasks

## 1. Подпись в подвале сайта

- [x] 1.1 В `site/src/components/Layout.tsx` верхний ряд подвала («Соавтор, закрытая бета, 2026» и ссылки) оставить как есть, под ним отдельной строкой во всю ширину добавить «Продукт и сайт сделаны в ГлавAI: проектируем и разрабатываем продукты с ИИ», где «ГлавAI» — ссылка на `https://glavai.ru/cases/soavtor-landing?utm_source=soavtor&utm_medium=credit` (константа рядом с `FOOTER_DOCUMENTS`), `target="_blank"`, `rel="noopener"`, всегда подчёркнута, цвет текста подвала, при наведении `text-foreground` (design, D1). Проверка: `npm run build --prefix site` проходит; в собранном `index.html` подвал содержит строку и ссылку с нужным адресом, `/pricing/`, `/legal/offer/`, `/legal/privacy/` и «Войти» на месте.
- [x] 1.2 В `site/scripts/check-build.mjs` в цикле по страницам, где читается подвал, требовать ссылку с точным адресом подписи (в HTML `&amp;`), `target="_blank"` у неё и текст «Продукт и сайт сделаны в»; ошибка называет файл (design, D4). Проверка: временно испортить адрес подписи в `Layout.tsx` — проверка падает и называет каждую страницу; вернуть — сборка проходит.
- [x] 1.3 Посмотреть подвал главной и `/legal/offer/` на 1440 и 375 px (`npm run preview --prefix site`) в браузере и в Safari (`safaridriver`, по глобальным инструкциям): подпись стоит отдельной строкой под рядом подвала, на 375 px видна целиком без горизонтальной прокрутки. Проверка: скриншоты показаны владельцу.

## 2. Подпись в настройках сервиса

- [x] 2.1 В `web/scripts/check-contrast.ts` добавить пару `["muted-foreground", "paper", TEXT]` (design, D2). Проверка: `npm run check:contrast --prefix web` проходит в `light`, `sepia`, `dark`.
- [x] 2.2 В `web/src/screens/settings/SettingsScreen.tsx` после раздела «Ваши тексты» — `<hr>` и строка «ИИ-соавтор создан в ГлавAI» (`text-caption text-muted-foreground`), «ГлавAI» — подчёркнутая ссылка того же цвета на `https://glavai.ru/cases/soavtor?utm_source=soavtor-app&utm_medium=credit`, `target="_blank"`, `rel="noopener"`, при наведении `text-paper-foreground`; в `SECTIONS` пункта не добавлять (design, D2, D3). Комментарий экрана дополнить ссылкой на требование «Подпись ГлавAI в настройках».

  Проверка в браузере на `npm run dev --prefix web` с `VITE_DATA_SOURCE=fixtures`:
  - строка внизу `/settings`, ссылка с нужным адресом, `target="_blank"`, `rel="noopener"`;
  - список разделов прежний: «Профиль», «Внешний вид», «Ваши тексты»;
  - в темах «Утро», «Бумага», «Вечер у лампы» строка читается; скриншоты трёх тем;
  - на 375 px без горизонтальной прокрутки;
  - во вкладке сети при открытии `/settings` нет запросов к `glavai.ru`;
  - на полке, в корзине и в окне истории с чатом нет ссылки на `glavai.ru` (`find` по странице).
- [x] 2.3 Проверить, что `glavai.ru` упоминается в `web/src` только в `SettingsScreen.tsx`: `grep -rn "glavai.ru" web/src` находит одну строку.

## 3. Проверки и статус

- [x] 3.1 Пройти проверки: `./scripts/validate.sh` через `env -u BASH_ENV` после активации `agno/.venv`, `npm run check:behaviour --prefix site`, `git diff --check`. Записать проверки и ограничения в `tmp/VERIFY.md` по видам: static, deterministic, локальный браузер; hosted — только после релиза. Проверка: все команды завершаются с кодом 0, `tmp/VERIFY.md` обновлён.
- [x] 3.2 Обновить строку статуса `business-intents/glavai-credit.md`: change `glavai-credit` создан; дельта настроек — в `web/workspace`, а не в `web/app`; темы называются «Утро», «Бумага», «Вечер у лампы». Проверка: строка статуса называет change.

## Workflow follow-up

- `/opsx:verify`, затем `/opsx:archive`, слияние в `main` по AGENTS.md («OpenSpec is mandatory», п. 4).
- Выкладка — релизом из `main`; после релиза проверить подвал `https://soavtor.app/` и низ `https://app.soavtor.app/settings`, переход по обеим ссылкам и метки в адресе. Проверку записать отдельным маленьким PR от свежего `origin/main`.
