"""The measurement of actions: its set, what one request produced, the checks and the report.

openspec/specs/coauthor-actions-eval. The set is actions.toml here; it is checked against
core/fields.py and the demo stories before any model call. Plain data and code checks, without the agent or the
database, so the checks and their tests run without a model; actions_run.py runs a request through the co-author.
"""

import json
import tomllib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal, get_args, get_origin

from core.fields import FIELDS, KINDS_WITH_ROLE, SCRIPT_NAME, Role
from core.tables import SUGGESTION_PLACES
from core.texts import ELEMENT_NAMES
from evals.coauthor.demo_set import demo_stories
from evals.coauthor.records import CHANGING, Call, Usage
from evals.coauthor.user import PLACES

SET_FILE = Path(__file__).parent / "actions.toml"
NO_ACTION = "none"
# Changing tools that need a file attached to the message: the measurement sends text only, so the set does not ask
# for them (spec «Набор просьб замера действий»); called anyway, they are a change nobody asked for.
NEEDS_FILE = frozenset({"save_chat_file_to_notes"})
# The tools the set asks for: every changing tool but those of NEEDS_FILE. A suggestion of an edit is checked by its
# place and the types of its paragraphs (design of coauthor-typed-suggestions, decision 9); one nobody asked for is a
# change nobody asked for.
ACTION_TOOLS = frozenset(CHANGING - NEEDS_FILE)
SUGGEST = "suggest_edit"
DOCUMENT_TOOLS = ("create_story_document", "update_story_document")
TARGET_TOOLS = ("update_story_document", "update_story_note")
CREATED_KINDS = ("character", "location", "world")
ROLES: tuple[str, ...] = get_args(Role)
REFUSAL = "Отказ:"
# Calls of the expected tool up to its first success; more is a failure (spec «Проверки замера действий»).
MAX_ATTEMPTS = 2
# The profile fell into the description: expected fields are empty and the summary is longer than this (design,
# decision 5; the threshold is tuned by the first run).
SUMMARY_DUMP = 300
_KEYS = {
    "id",
    "place",
    "message",
    "expect",
    "kind",
    "target",
    "fields",
    "role",
    "name",
    "max_words",
    "suggest_place",
    "types",
    "empty_text",
}
# The requests whose written text may have a limit of words: the expected fields of the document, the text of the note.
LIMITED_TOOLS = ("update_story_document", "create_story_note")


class ActionSetError(ValueError):
    """A request of the set the measurement cannot use."""


@dataclass(frozen=True)
class Request:
    id: str
    place: str
    message: str
    expect: str  # a tool of ACTION_TOOLS or NO_ACTION
    kind: str | None = None  # the kind of the created or changed card
    target: str | None = None  # the name of the changed card or the title of the changed note
    fields: tuple[tuple[str, ...], ...] = ()  # groups of fields; each group needs one filled
    role: str | None = None
    name: str | None = None
    max_words: int | None = None  # the written text is not longer than this (spec «Проверки замера действий»)
    suggest_places: tuple[str, ...] = ()  # the places a suggestion may have; one is enough
    types: tuple[str, ...] = ()  # paragraph types the suggestion must have in this order, others between allowed
    empty_text: bool = False  # the screenplay of the request's draft is the text of a new story

    @property
    def section(self) -> str:
        return self.expect


def _text_fields(kind: str) -> frozenset[str]:
    """Profile fields of a kind whose value is a string; the screenplay's `show` and `title_page` are not."""
    names = set()
    for name, info in FIELDS[kind].model_fields.items():
        parts = get_args(info.annotation) or (info.annotation,)
        if all(part is str or part is type(None) or get_origin(part) is Literal for part in parts):
            names.add(name)
    return frozenset(names)


def _string(where: str, value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ActionSetError(f"{where} must be a non-empty string")
    return value


def parse_request(row: Any, cards: dict[str, dict[str, str]], notes: dict[str, frozenset[str]]) -> Request:
    """One `[[request]]` table; `cards` maps a place to card name → kind, `notes` a place to note titles."""
    if not isinstance(row, dict):
        raise ActionSetError("A request must be a table")
    request_id = _string("A request's id", row.get("id"))
    unknown = set(row) - _KEYS
    if unknown:
        raise ActionSetError(f"{request_id}: unknown keys {', '.join(sorted(unknown))}")
    place = _string(f"{request_id}: place", row.get("place"))
    if place not in PLACES:
        raise ActionSetError(f"{request_id}: place {place!r} is not one of {', '.join(PLACES)}")
    message = _string(f"{request_id}: message", row.get("message"))
    expect = _string(f"{request_id}: expect", row.get("expect"))
    if expect != NO_ACTION and expect not in ACTION_TOOLS:
        raise ActionSetError(f"{request_id}: tool {expect!r} is not a changing tool of the co-author")

    allowed = {"id", "place", "message", "expect"}
    kind: str | None = None
    target: str | None = None
    if expect in TARGET_TOOLS:
        allowed.add("target")
        target = _string(f"{request_id}: target", row.get("target"))
        if expect == "update_story_document":
            if target not in cards[place]:
                raise ActionSetError(f"{request_id}: the open draft of {place} has no card «{target}»")
            kind = cards[place][target]
        elif target not in notes[place]:
            raise ActionSetError(f"{request_id}: the story of {place} has no note «{target}»")
    if expect == "create_story_document":
        allowed.add("kind")
        kind = _string(f"{request_id}: kind", row.get("kind"))
        if kind not in CREATED_KINDS:
            raise ActionSetError(f"{request_id}: kind {kind!r} is not one of {', '.join(CREATED_KINDS)}")
    if expect in DOCUMENT_TOOLS:
        allowed.add("fields")
    if expect == "update_story_document":
        allowed |= {"role", "name"}
    if expect in LIMITED_TOOLS:
        allowed.add("max_words")
    if expect == SUGGEST:
        allowed |= {"suggest_place", "types", "empty_text"}
    extra = set(row) - allowed
    if extra:
        raise ActionSetError(f"{request_id}: {', '.join(sorted(extra))} do not belong to a request for {expect}")

    groups: list[tuple[str, ...]] = []
    raw_fields = row.get("fields", [])
    if not isinstance(raw_fields, list):
        raise ActionSetError(f"{request_id}: fields must be a list of strings")
    for item in raw_fields:
        group = tuple(_string(f"{request_id}: a field", item).split("|"))
        for name in group:
            if kind is None or name not in _text_fields(kind):
                raise ActionSetError(f"{request_id}: field {name!r} is not a text field of {kind}")
        groups.append(group)
    role: str | None = row.get("role")
    if role is not None:
        if role not in ROLES:
            raise ActionSetError(f"{request_id}: role {role!r} is not one of {', '.join(ROLES)}")
        if kind not in KINDS_WITH_ROLE:
            raise ActionSetError(f"{request_id}: a card of kind {kind} has no role")
    new_name = None if row.get("name") is None else _string(f"{request_id}: name", row.get("name"))
    if expect == "update_story_document" and not (groups or role or new_name):
        raise ActionSetError(f"{request_id}: a request to change a card names fields, a role or a name")
    max_words = row.get("max_words")
    if max_words is not None:
        if not isinstance(max_words, int) or isinstance(max_words, bool) or max_words < 1:
            raise ActionSetError(f"{request_id}: max_words must be a positive whole number")
        if expect == "update_story_document" and not groups:
            raise ActionSetError(f"{request_id}: max_words limits the expected fields, and the request names none")
    places: tuple[str, ...] = ()
    types: tuple[str, ...] = ()
    empty_text = False
    if expect == SUGGEST:
        places = tuple(_string(f"{request_id}: suggest_place", row.get("suggest_place")).split("|"))
        for name in places:
            if name not in SUGGESTION_PLACES:
                raise ActionSetError(
                    f"{request_id}: suggest_place {name!r} is not one of {', '.join(SUGGESTION_PLACES)}"
                )
        raw_types = row.get("types", [])
        if not isinstance(raw_types, list):
            raise ActionSetError(f"{request_id}: types must be a list of paragraph types")
        for item in raw_types:
            if item not in ELEMENT_NAMES:
                raise ActionSetError(f"{request_id}: paragraph type {item!r} is not a type of the editor")
        types = tuple(raw_types)
        empty_text = row.get("empty_text", False)
        if not isinstance(empty_text, bool):
            raise ActionSetError(f"{request_id}: empty_text must be true or false")
    return Request(
        request_id,
        place,
        message,
        expect,
        kind,
        target,
        tuple(groups),
        role,
        new_name,
        max_words,
        places,
        types,
        empty_text,
    )


def parse_set(rows: Any) -> list[Request]:
    """Every request of the set, checked; a repeated id stops the measurement."""
    if not isinstance(rows, list) or not rows:
        raise ActionSetError("The set must have at least one [[request]]")
    stories = demo_stories()
    # The screenplay of the draft is a card too: its logline and synopsis are text fields (spec «Набор просьб замера
    # действий»).
    cards = {
        place: {name: kind for kind in CREATED_KINDS for name in story.names[kind]} | {SCRIPT_NAME: "script"}
        for place, story in stories.items()
    }
    notes = {place: story.names["note"] for place, story in stories.items()}
    requests = [parse_request(row, cards, notes) for row in rows]
    seen: set[str] = set()
    for request in requests:
        if request.id in seen:
            raise ActionSetError(f"{request.id}: the id is repeated")
        seen.add(request.id)
    return requests


def load_set(path: Path = SET_FILE) -> list[Request]:
    with path.open("rb") as file:
        data = tomllib.load(file)
    if set(data) != {"request"}:
        raise ActionSetError(f"{path.name}: only [[request]] tables are allowed")
    return parse_set(data["request"])


@dataclass(frozen=True)
class Card:
    """A document of the request's draft after the run."""

    id: str
    kind: str
    name: str
    role: str | None
    summary: str
    fields: dict[str, Any]


@dataclass(frozen=True)
class Suggested:
    """A suggestion the request made: its place and the types of its paragraphs (none for a line)."""

    place: str
    types: tuple[str, ...]


@dataclass(frozen=True)
class Changes:
    """What the request changed, read from the core before and after the run."""

    created: tuple[Card, ...] = ()
    updated: tuple[tuple[str, Card], ...] = ()  # the name before the run and the card after it
    notes_created: tuple[str, ...] = ()
    notes_created_text: tuple[str, ...] = ()  # the text of each created note, in the order of notes_created
    notes_updated: tuple[str, ...] = ()  # titles before the run
    comments: int = 0
    suggestions: int = 0
    suggested: tuple[Suggested, ...] = ()  # the new suggestions, in the order of their creation
    open_draft: tuple[str, ...] = ()  # documents of the story's open draft that changed: never expected


@dataclass(frozen=True)
class ActionRun:
    request_id: str
    outcome: str  # "done" or "error"
    answer: str
    seconds: float
    calls: tuple[Call, ...] = ()
    changes: Changes = field(default_factory=Changes)
    usage: Usage | None = None
    error: str | None = None
    continuations: int = 0


@dataclass(frozen=True)
class Verdict:
    request: Request
    run: ActionRun
    refusals: tuple[str, ...]  # refused changing calls: "tool: reason"
    attempts: int  # calls of the expected tool up to its first success, all of them without a success
    action_ok: bool
    missing: tuple[str, ...]  # expected fields not filled, a role or a name the card does not have
    summary_dump: bool
    extra: tuple[str, ...]  # changes nobody asked for
    too_long: tuple[str, ...]  # written texts over the request's max_words: "what: N слов, предел M"
    placement: tuple[str, ...] = ()  # a suggestion not at an expected place or without the expected types

    @property
    def fields_expected(self) -> bool:
        return bool(self.request.fields or self.request.role or self.request.name)

    @property
    def passed(self) -> bool:
        return (
            self.run.outcome == "done"
            and self.action_ok
            and self.attempts <= MAX_ATTEMPTS
            and not self.missing
            and not self.extra
            and not self.too_long
            and not self.placement
        )


def _refused(call: Call) -> bool:
    return call.result.startswith(REFUSAL)


def _filled(card: Card, group: tuple[str, ...]) -> bool:
    return any(isinstance(card.fields.get(name), str) and card.fields[name].strip() for name in group)


def _extra(request: Request, changes: Changes) -> list[str]:
    extra: list[str] = []
    created = list(changes.created)
    if request.expect == "create_story_document":
        same = [card for card in created if card.kind == request.kind]
        if same:
            created.remove(same[0])
    extra += [f"создан документ «{card.name}» ({card.kind})" for card in created]
    allowed = request.target if request.expect == "update_story_document" else None
    extra += [f"изменён документ «{before}»" for before, _ in changes.updated if before != allowed]
    notes_created = len(changes.notes_created) - (1 if request.expect == "create_story_note" else 0)
    extra += [f"создана заметка «{title}»" for title in changes.notes_created[: max(notes_created, 0)]]
    allowed = request.target if request.expect == "update_story_note" else None
    extra += [f"изменена заметка «{title}»" for title in changes.notes_updated if title != allowed]
    comments = changes.comments - (1 if request.expect == "comment_on_screenplay" else 0)
    if comments > 0:
        extra.append(f"лишних комментариев: {comments}")
    suggestions = changes.suggestions - (1 if request.expect == SUGGEST else 0)
    if suggestions > 0:
        extra.append(f"предложений правки: {changes.suggestions}")
    extra += [f"изменён открытый драфт: «{name}»" for name in changes.open_draft]
    return extra


def _card(request: Request, changes: Changes) -> Card | None:
    if request.expect == "create_story_document":
        return next((card for card in changes.created if card.kind == request.kind), None)
    if request.expect == "update_story_document":
        return next((card for before, card in changes.updated if before == request.target), None)
    return None


def _words(text: str) -> int:
    return len(text.split())


def _too_long(request: Request, card: Card | None, changes: Changes) -> list[str]:
    """The written texts over the request's limit of words (spec «Проверки замера действий»)."""
    limit = request.max_words
    if limit is None:
        return []
    written: list[tuple[str, str]] = []
    if request.expect == "update_story_document" and card is not None:
        for group in request.fields:
            written += [(name, card.fields[name]) for name in group if isinstance(card.fields.get(name), str)]
    if request.expect == "create_story_note" and changes.notes_created:
        written.append((f"заметка «{changes.notes_created[0]}»", changes.notes_created_text[0]))
    return [f"{what}: {_words(text)} слов, предел {limit}" for what, text in written if _words(text) > limit]


def _in_order(expected: tuple[str, ...], found: tuple[str, ...]) -> bool:
    """The expected types appear in `found` in this order, other types between them allowed."""
    rest = iter(found)
    return all(any(kind == wanted for kind in rest) for wanted in expected)


def _placement(request: Request, changes: Changes) -> list[str]:
    """The suggestion of a request for one (spec «Проверки замера действий»): one, at an expected place, the expected
    types in order."""
    if request.expect != SUGGEST:
        return []
    if len(changes.suggested) != 1:
        return [f"предложений: {len(changes.suggested)} вместо 1"]
    (made,) = changes.suggested
    issues: list[str] = []
    if made.place not in request.suggest_places:
        issues.append(f"место {made.place} вместо {'|'.join(request.suggest_places)}")
    if not _in_order(request.types, made.types):
        issues.append(f"типы: ожидались {', '.join(request.types)}; получены {', '.join(made.types) or 'строка'}")
    return issues


def check(request: Request, run: ActionRun) -> Verdict:
    """The checks of one request by code (spec «Проверки замера действий», «Сведения профиля не в описании»)."""
    changing = [call for call in run.calls if call.name in CHANGING]
    refusals = tuple(f"{call.name}: {call.result}" for call in changing if _refused(call))
    if request.expect == NO_ACTION:
        attempts, action_ok = 0, not changing
    else:
        expected = [call for call in changing if call.name == request.expect]
        first = next((index for index, call in enumerate(expected) if not _refused(call)), None)
        attempts = len(expected) if first is None else first + 1
        action_ok = first is not None
    card = _card(request, run.changes)
    missing: list[str] = []
    if request.expect in DOCUMENT_TOOLS:
        missing += ["|".join(group) for group in request.fields if card is None or not _filled(card, group)]
        if request.role is not None and (card is None or card.role != request.role):
            missing.append(f"role={request.role}")
        if request.name is not None and (card is None or card.name != request.name):
            missing.append(f"name={request.name}")
    dump = bool(missing) and card is not None and len(card.summary) > SUMMARY_DUMP
    extra = _extra(request, run.changes)
    too_long = _too_long(request, card, run.changes)
    if run.outcome == "error":
        action_ok = False
    placement = tuple(_placement(request, run.changes))
    return Verdict(
        request, run, refusals, attempts, action_ok, tuple(missing), dump, tuple(extra), tuple(too_long), placement
    )


@dataclass(frozen=True)
class Share:
    requests: int = 0
    clean: int = 0  # ran without a refused changing call
    action_ok: int = 0
    expected_fields: int = 0
    fields_ok: int = 0
    passed: int = 0
    attempts: int = 0  # sum over requests with an expected tool that was called
    attempted: int = 0


def _share(verdicts: list[Verdict]) -> Share:
    tried = [v for v in verdicts if v.request.expect != NO_ACTION and v.attempts]
    with_fields = [v for v in verdicts if v.fields_expected]
    return Share(
        requests=len(verdicts),
        clean=sum(1 for v in verdicts if v.run.outcome == "done" and not v.refusals),
        action_ok=sum(1 for v in verdicts if v.action_ok),
        expected_fields=len(with_fields),
        fields_ok=sum(1 for v in with_fields if not v.missing),
        passed=sum(1 for v in verdicts if v.passed),
        attempts=sum(v.attempts for v in tried),
        attempted=len(tried),
    )


@dataclass(frozen=True)
class Summary:
    total: Share
    tools: dict[str, Share]
    kinds: dict[str, Share]
    errors: int
    failures: tuple[str, ...]  # request ids


def summarize(verdicts: list[Verdict]) -> Summary:
    tools = {tool: [v for v in verdicts if v.request.expect == tool] for tool in (*sorted(ACTION_TOOLS), NO_ACTION)}
    kinds = {kind: [v for v in verdicts if v.request.kind == kind] for kind in CREATED_KINDS}
    return Summary(
        total=_share(verdicts),
        tools={name: _share(group) for name, group in tools.items() if group},
        kinds={name: _share(group) for name, group in kinds.items() if group},
        errors=sum(1 for v in verdicts if v.run.outcome == "error"),
        failures=tuple(v.request.id for v in verdicts if not v.passed),
    )


def _pct(part: int, whole: int) -> str:
    return "—" if whole == 0 else f"{part / whole:.0%} ({part}/{whole})"


def _row(name: str, share: Share) -> str:
    attempts = "—" if not share.attempted else f"{share.attempts / share.attempted:.2f}"
    cells = [
        name,
        str(share.requests),
        _pct(share.clean, share.requests),
        _pct(share.action_ok, share.requests),
        _pct(share.fields_ok, share.expected_fields),
        attempts,
        _pct(share.passed, share.requests),
    ]
    return "| " + " | ".join(cells) + " |"


_HEAD = "Просьб | Без отказа | Верное действие | Поля заполнены | Попыток в среднем | Прошла"


def _failure(verdict: Verdict) -> list[str]:
    request, run = verdict.request, verdict.run
    lines = [f"### `{request.id}` ({request.expect}{'' if request.kind is None else ', ' + request.kind})", ""]
    lines += [f"**Автор:** {request.message}", ""]
    if run.outcome == "error":
        lines += [f"Ошибка запуска: {run.error}", ""]
    for call in run.calls:
        lines.append(f"- `{call.name}`: {json.dumps(call.args, ensure_ascii=False)[:600]}")
        if call.result:
            lines.append(f"  - ответ: {call.result[:300]}")
    lines.append("")
    if not verdict.action_ok:
        lines.append("Ожидаемое действие не выполнено." if request.expect != NO_ACTION else "Действие без просьбы.")
    if verdict.attempts > MAX_ATTEMPTS:
        lines.append(f"Попыток: {verdict.attempts}.")
    if verdict.missing:
        lines.append(f"Не заполнено: {', '.join(verdict.missing)}.")
    if verdict.summary_dump:
        lines.append(f"Сведения в описании (summary длиннее {SUMMARY_DUMP} знаков).")
    if verdict.extra:
        lines.append(f"Сверх просьбы: {'; '.join(verdict.extra)}.")
    if verdict.too_long:
        lines.append(f"Длиннее предела: {'; '.join(verdict.too_long)}.")
    if verdict.placement:
        lines.append(f"Предложение: {'; '.join(verdict.placement)}.")
    lines += ["", f"**Соавтор:** {run.answer}", ""]
    return lines


def markdown(meta: dict[str, Any], summary: Summary, verdicts: list[Verdict], usage: Usage) -> str:
    lines = [
        f"# Замер действий соавтора: {meta['requests']} просьб",
        "",
        f"Начало {meta['started']}, код {meta['commit']}, модель {meta['model']}. Ошибок запуска {summary.errors}.",
        "",
        f"**Прошли {_pct(summary.total.passed, summary.total.requests)}; без отказа ядра "
        f"{_pct(summary.total.clean, summary.total.requests)}; поля заполнены "
        f"{_pct(summary.total.fields_ok, summary.total.expected_fields)}.**",
        "",
    ]
    for title, first, shares in (("Инструменты", "Инструмент", summary.tools), ("Виды", "Вид", summary.kinds)):
        lines += [f"## {title}", "", f"| {first} | {_HEAD} |", "|" + "---|" * 7]
        lines += [_row(name, share) for name, share in shares.items()]
        lines.append("")
    lines += [
        "## Цена и время",
        "",
        f"- Соавтор: вызовов модели {usage.model_calls}, вход {usage.input_tokens} (из кэша "
        f"{usage.cache_read_tokens}), выход {usage.output_tokens}, {usage.cost_rub:.2f} ₽; "
        f"на просьбу {meta['cost_per_request']} ₽.",
    ]
    if meta["median_seconds"] is None:
        lines.append("- Времени нет: ни один запуск не завершился.")
    else:
        lines.append(f"- Время просьбы: медиана {meta['median_seconds']:.1f} с, всего {meta['seconds']:.0f} с.")
    lines += ["", "## Провалы", ""]
    failed = [v for v in verdicts if not v.passed]
    for verdict in failed:
        lines += _failure(verdict)
    if not failed:
        lines.append("Нет.")
    return "\n".join(lines) + "\n"
