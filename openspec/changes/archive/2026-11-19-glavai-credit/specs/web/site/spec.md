## ADDED Requirements

### Requirement: Подпись ГлавAI в подвале
Подвал каждой страницы сайта MUST содержать рядом со строкой «Соавтор, закрытая бета, 2026» строку «Продукт и сайт сделаны в ГлавAI: проектируем и разрабатываем продукты с ИИ», где «ГлавAI» — ссылка на `https://glavai.ru/cases/soavtor-landing?utm_source=soavtor&utm_medium=credit`, открывающаяся в новой вкладке. Подпись MUST NOT добавлять скрипты, изображения или запросы к другим хостам при показе страницы; ссылки подвала из «Документы в подвале» и «Войти» MUST оставаться.

#### Scenario: Подпись на главной
- GIVEN собранная главная
- WHEN читается подвал
- THEN в нём MUST быть строка «Продукт и сайт сделаны в ГлавAI: проектируем и разрабатываем продукты с ИИ»
- AND «ГлавAI» MUST быть ссылкой на `https://glavai.ru/cases/soavtor-landing?utm_source=soavtor&utm_medium=credit` с `target="_blank"` и `rel="noopener"`
- AND среди ссылок подвала MUST оставаться `/pricing/`, `/legal/offer/`, `/legal/privacy/` и «Войти»

#### Scenario: Подпись на странице документа
- GIVEN собранные страницы `/legal/offer/`, `/legal/privacy/`, `/pricing/`, `/privacy/` и `404.html`
- WHEN читается подвал каждой
- THEN в каждом MUST быть та же строка с той же ссылкой

#### Scenario: Сборка без подписи
- GIVEN в подвале собранной страницы нет ссылки на `https://glavai.ru/cases/soavtor-landing?utm_source=soavtor&utm_medium=credit`
- WHEN выполняется проверка сборки сайта
- THEN проверка MUST завершиться ошибкой, называющей файл страницы

#### Scenario: Подпись на узком экране
- GIVEN главная открыта при ширине окна 375 px
- WHEN посетитель доходит до подвала
- THEN строка подписи MUST быть видна целиком без горизонтальной прокрутки
