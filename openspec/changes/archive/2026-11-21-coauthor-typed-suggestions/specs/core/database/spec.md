## MODIFIED Requirements

### Requirement: Таблица предложений
Схема `authorled` MUST содержать `suggestions` (`id`, `document_id`, `place` — `replace`, `after`, `scene_end`, `scene_body`, `script_start` или `script_end`, `scene_uid`, `quote`, `text`, `paragraphs` — JSON-список абзацев, `why`, `status` — `open`, `accepted` или `rejected`, `author_kind` — `coauthor` или `user`, `author_id` — ссылка на `users.id`, `session_id`, `created_at`, `decided_at`, `decided_by` — ссылка на `users.id`). Предложения MUST удаляться вместе с документом; `decided_at` MUST быть заполнен ровно у решённых предложений. `author_id` MUST быть заполнен ровно у предложений с `author_kind` `user`. Существующие предложения MUST получить `author_kind` `coauthor`. Ровно одно из `text` и `paragraphs` MUST быть заполнено, `text` — только у места `replace`; `scene_uid` MUST быть пуст ровно у мест `script_start` и `script_end`, непустая `quote` MUST быть ровно у мест `replace` и `after`. Существующие предложения MUST получить `place` `replace`.

#### Scenario: Решение без времени
- GIVEN все миграции применены
- WHEN вставляется предложение со `status` `accepted` и пустым `decided_at`
- THEN база MUST отклонить запись

#### Scenario: Предложение человека без автора
- GIVEN все миграции применены
- WHEN вставляется предложение с `author_kind` `user` и пустым `author_id`
- THEN база MUST отклонить запись

#### Scenario: Строка у вставки
- GIVEN все миграции применены
- WHEN вставляется предложение с `place` `after`, заполненным `text` и пустыми `paragraphs`
- THEN база MUST отклонить запись

#### Scenario: Сцена у конца сценария
- GIVEN все миграции применены
- WHEN вставляется предложение с `place` `script_end` и заполненным `scene_uid`
- THEN база MUST отклонить запись

#### Scenario: Прежние предложения
- GIVEN до миграции в базе было открытое предложение соавтора с цитатой и текстом
- WHEN миграция применена
- THEN у него MUST быть `place` `replace`, прежние `quote` и `text` и пустые `paragraphs`
