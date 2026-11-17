# Integrations Specification

## Purpose
Внешние сервисы, с которыми работает текущий код. Ключи передаются через переменные окружения (`example.env`); значения MUST NOT храниться в коде.

## Requirements

### Requirement: Parallel
Веб-инструмент MUST быть `ParallelTools()` при заданном `PARALLEL_API_KEY`; иначе MUST использоваться бесключевой MCP-сервер `https://search.parallel.ai/mcp`.

#### Scenario: Без ключа
- GIVEN `PARALLEL_API_KEY` не задан
- WHEN клиент выполняет `GET /registry`
- THEN ответ MUST содержать инструмент `parallel_tools`

### Requirement: GitHub releases Agno
Product `this-agentos` MUST содержать Source `website` `https://github.com/agno-agi/agno/releases`, который читает Routine `agentos-maintenance`.

#### Scenario: Source в списке
- GIVEN платформа запущена
- WHEN клиент выполняет `GET /company/sources`
- THEN ответ MUST содержать этот Source

### Requirement: AgentOS UI и JWT
При включённой авторизации система MUST проверять JWT ключами из файла `JWT_JWKS_FILE` (открытые ключи подписи Authentik, выгружаемые модулем `auth`); других источников ключей система MUST NOT принимать. Токены, принимаемые системой, MUST выпускаться Authentik (`openspec/specs/auth/spec.md`).

#### Scenario: Токен не подписан ключом
- GIVEN `RUNTIME_ENV=prd` с заданным ключом
- WHEN клиент передаёт токен, подписанный другим ключом
- THEN система MUST вернуть `401`

#### Scenario: Токен Authentik
- GIVEN ключи Authentik выгружены в `JWT_JWKS_FILE`
- WHEN клиент передаёт действительный Access Token Authentik
- THEN система MUST принять запрос и использовать `sub` токена как `user_id`

### Requirement: AWS AgentCore
`agentcore_sandbox` MUST использовать `AgentCoreSandbox(runtime_arn=...)` с регионом из ARN и checkpoints в `/data/checkpoints`. Учётные данные AWS хоста MUST NOT передаваться в sandbox.

#### Scenario: Выбор провайдера
- GIVEN `sandbox_provider()` возвращает `None`
- WHEN платформа стартует
- THEN AgentCore MUST NOT использоваться

### Requirement: DeepSeek
Система MUST использовать DeepSeek для всех чат-моделей через LiteLLM-прокси: псевдоним `deepseek-fast` для агентов по умолчанию и судьи evals, `deepseek-thinking` для OS Manager, Company Manager и `claude-engineer`. Ключ `DEEPSEEK_API_KEY` MUST задаваться только прокси.

#### Scenario: Модели в реестре
- GIVEN платформа запущена
- WHEN клиент выполняет `GET /registry`
- THEN ответ MUST содержать модели `deepseek-fast` и `deepseek-thinking`

### Requirement: GigaChat
Система MUST предоставлять GigaChat `Embeddings-2` (1024 измерения) как вариант эмбеддингов через псевдоним прокси `gigachat-embeddings`; он используется, когда выбран в `EMBEDDINGS_MODEL`. Учётные данные `GIGACHAT_CREDENTIALS` и `GIGACHAT_SCOPE` MUST задаваться только прокси.

#### Scenario: Эмбеддинг знаний
- GIVEN `EMBEDDINGS_MODEL=gigachat-embeddings`
- WHEN в `shared-knowledge` строится векторный индекс
- THEN эмбеддинги MUST запрашиваться у прокси псевдонимом `gigachat-embeddings` и иметь 1024 измерения

### Requirement: Эмбеддинги через Cloud.ru Foundation Models
Система MUST предоставлять эмбеддинги Cloud.ru Foundation Models (OpenAI-совместимый API) через псевдонимы прокси `giga-embeddings` (`ai-sage/Giga-Embeddings-instruct-480M`), `bge-m3-embeddings` (`BAAI/bge-m3`) и `qwen3-embeddings` (`Qwen/Qwen3-Embedding-0.6B`); все три MUST иметь 1024 измерения. Ключ `CLOUDRU_API_KEY` MUST задаваться только прокси. Соединение MUST проверять TLS-сертификат; отключение проверки MUST NOT использоваться.

#### Scenario: Эмбеддинг знаний через Cloud.ru
- GIVEN `EMBEDDINGS_MODEL=giga-embeddings`
- WHEN в `shared-knowledge` строится векторный индекс
- THEN эмбеддинги MUST запрашиваться у прокси псевдонимом `giga-embeddings` и иметь 1024 измерения

#### Scenario: Каждый псевдоним Cloud.ru отдаёт 1024 измерения
- GIVEN прокси запущен с рабочим `CLOUDRU_API_KEY`
- WHEN к прокси приходит запрос эмбеддинга с псевдонимом `giga-embeddings`, `bge-m3-embeddings` или `qwen3-embeddings`
- THEN ответ MUST содержать вектор из 1024 чисел

#### Scenario: Cloud.ru отказывает
- GIVEN выбран псевдоним Cloud.ru, а Cloud.ru отвечает ошибкой (нет денег на балансе, ключ отклонён или отозван)
- WHEN в `shared-knowledge` загружается контент
- THEN загрузка MUST завершиться ошибкой со статусом контента `failed`, без перехода на другой псевдоним или провайдер эмбеддингов

### Requirement: Выбор модели эмбеддингов
Система MUST использовать для эмбеддингов ровно один псевдоним, заданный обязательной переменной `EMBEDDINGS_MODEL`, без значения по умолчанию. Допустимы только псевдонимы с 1024 измерениями: `gigachat-embeddings`, `giga-embeddings`, `bge-m3-embeddings`, `qwen3-embeddings`. API MUST завершаться ошибкой, называющей `EMBEDDINGS_MODEL`, если переменная не задана или содержит иное значение. Если размерность полученного вектора не равна 1024, система MUST завершить запрос ошибкой. При ошибке выбранного псевдонима система MUST NOT переходить на другой. Векторы разных моделей MUST NOT смешиваться в одной таблице знаний: смена значения требует пересоздания `shared_knowledge` и повторной загрузки документов.

#### Scenario: Переключение модели
- GIVEN `EMBEDDINGS_MODEL=giga-embeddings`, а таблица `shared_knowledge` пересоздана
- WHEN оператор меняет значение на `bge-m3-embeddings` и перезапускает API
- THEN новые эмбеддинги MUST запрашиваться псевдонимом `bge-m3-embeddings` без изменения кода

#### Scenario: Неизвестное значение
- GIVEN `EMBEDDINGS_MODEL=giga-embeddings-instruct-3b`
- WHEN запускается API
- THEN запуск MUST завершиться ошибкой, называющей `EMBEDDINGS_MODEL` и перечисляющей допустимые значения

#### Scenario: Неверная размерность
- GIVEN выбранная модель вернула вектор не из 1024 чисел
- WHEN строится эмбеддинг
- THEN запрос MUST завершиться ошибкой с указанием ожидаемой и полученной размерности

### Requirement: Yandex Search API
Поиск соавтора в интернете MUST идти через синхронный веб-поиск Yandex Search API v2: поиск по русскому индексу, регион Россия (`225`), выдача XML, до 5 результатов и до 5 отрывков у каждого. Ключ API сервисного аккаунта с ролью `search-api.webSearch.user` MUST задаваться `YANDEX_SEARCH_API_KEY`, каталог Yandex Cloud — `YANDEX_CLOUD_FOLDER_ID`. Запросы к Yandex Search API MUST идти не чаще одного в секунду (квота по умолчанию). Других поисковиков у соавтора MUST NOT быть.

#### Scenario: Нет ключа
- GIVEN `YANDEX_SEARCH_API_KEY` или `YANDEX_CLOUD_FOLDER_ID` не задана
- WHEN запускается API
- THEN старт MUST завершиться ошибкой, называющей недостающую переменную

#### Scenario: Запрос к Яндексу
- GIVEN настройки Yandex Search API заданы
- WHEN соавтор ищет «табачный киоск Москва 1972»
- THEN к Yandex Search API MUST уйти один синхронный запрос с русским индексом, регионом `225` и XML
- AND соавтор MUST получить не больше 5 результатов с заголовком, адресом и отрывками

#### Scenario: Ответ не разобран
- GIVEN Yandex Search API вернул ответ, в котором нет ожидаемой выдачи XML
- WHEN соавтор ищет в интернете
- THEN инструмент MUST вернуть отказ о сбое поиска, а не пустую выдачу

#### Scenario: Квота 1 запрос в секунду
- GIVEN запрос к Yandex Search API ушёл меньше секунды назад
- WHEN соавтор ищет в интернете снова (в том же ответе или в ответе другому автору)
- THEN следующий запрос MUST уйти не раньше, чем через секунду после предыдущего, а не получить отказ квоты

#### Scenario: Ключ не в логах
- WHEN соавтор ищет в интернете, и Яндекс отвечает ошибкой
- THEN в логе API MUST NOT быть ключа и текста запроса
