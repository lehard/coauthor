# Design: «Обсудить в чате» у вставки в начало или конец сценария

## Context

Мотивация — `proposal.md`, требование — дельта `specs/web/workspace/spec.md`. Сейчас (сверка кода 2026-11-21):

- Фрагмент для чата хранит `useSelectionIn()` в `ProjectScreen.tsx`. Он ловит `selectionchange` внутри `[data-chat-source]`, держит текст, пока тот есть в открытом документе, и отдаёт `clearSelection`. Этот сброс сейчас вызывает только кнопка «Убрать» на плашке в `CoauthorChat.tsx`.
- Экран документа получает через `ProjectData` (`ProjectContext.tsx`) только `openChat`.
- `useEditorSuggestions` в «Обсудить в чате» вызывает `view().selectSuggestion(id)` и `openChat()`.
- `selectSuggestion` (`web/src/editor/index.ts`) у `script_start` и `script_end` ничего не выделяет, только фокусирует редактор. Если в тексте осталось прежнее выделение (после прошлого «Обсудить» оно ещё стоит), фокус оставляет его, и `useSelectionIn` вернёт старую плашку.

## Goals / Non-Goals

**Goals:** у начала и конца сценария плашка прошлого фрагмента исчезает и не возвращается.

**Non-Goals:** см. proposal; правило «Контекста соавтора» для остальных случаев не меняется.

## Decisions

### 1. Сброс выделения чата — новый член `ProjectData`

`ProjectData` получает `clearChatSelection: () => void`, равный `clearSelection` из `useSelectionIn`. `TextDoc` передаёт его в `useEditorSuggestions` вместе с `openChat`, а у роли без чата — `null`, как `openChat`.

Альтернатива — `openChat({ clearSelection: true })`. Отвергнута: открыть чат и сбросить фрагмент — разные действия, а `openChat` зовут и другие экраны.

### 2. Курсор вместо выделения в тексте

`selectSuggestion` у `script_start` и `script_end` ставит свёрнутое выделение (курсор) на место вставки: `Selection.atStart(doc)` или `Selection.atEnd(doc)`. Затем фокусирует редактор. Так старое выделение текста не вернёт плашку через `selectionchange`: у свёрнутого выделения `useSelectionIn` ничего не берёт.

### 3. Порядок в «Обсудить в чате»

Порядок такой: `setActive(null)`, затем `selectSuggestion(id)`, затем, только у `script_start` и `script_end`, `clearChatSelection()`, затем `openChat()`. Сброс идёт после курсора, чтобы никакое событие выделения не пришло позже него.

## Risks / Trade-offs

- [Автор нарочно выделил фрагмент, чтобы спросить о нём вместе с началом сценария] → он выделит его заново одним движением; риск принят в интенте.
- [`selectionchange` приходит асинхронно после смены выделения] → свёрнутое выделение плашку не ставит, поэтому позднее событие её не вернёт. Проверка в браузере (задача 2.1) смотрит плашку после паузы.

## Migration Plan

Только фронтенд. Выкатывается обычным релизом, отката данных нет.
