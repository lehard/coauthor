"""Comments and co-author suggestions in the core (openspec/specs/api/review; api/agents, suggestions)."""

import uuid
from typing import Any

import pytest
from sqlalchemy import Connection, text
from sqlalchemy.exc import IntegrityError

from core.documents import create_documents, draft_row
from core.drafts import create_draft, update_draft
from core.errors import Conflict, Forbidden, Invalid, Locked, NotFound
from core.projects import create_project
from core.review import (
    MAX_PARAGRAPHS,
    Paragraph,
    add_reply,
    create_coauthor_thread,
    create_suggestion,
    create_thread,
    decide,
    delete_message,
    edit_message,
    list_suggestions,
    list_threads,
    set_resolved,
)
from core.saves import list_versions
from core.texts import get_text, heading, new_screenplay, put_text, screenplay_id
from core.users import get_or_create_user

SESSION = "story:1"


def _p(kind: str, text: str) -> dict[str, Any]:
    return {"type": kind, "content": [{"type": "text", "text": text}]}


def _story(connection: Connection) -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
    """A story whose screenplay has scene s3 «Вера молчит»; returns the draft, the screenplay and the author."""
    author = get_or_create_user(connection, "s1", "writer@authorled.test", "Сценарист").id
    _, draft_id, script_id = create_project(connection, author, "Маяк")
    put_text(
        connection,
        script_id,
        1,
        {"type": "doc", "content": [heading("s3", "НАТ. ОЗЕРО — ДЕНЬ"), _p("action", "Вера молчит.")]},
        author,
    )
    return draft_id, script_id, author


def test_new_thread(connection: Connection) -> None:
    _, script_id, author = _story(connection)
    thread = create_thread(connection, script_id, uuid.uuid4(), "Вера смотрит на воду", "Слишком прямо", author, "")
    (listed,) = list_threads(connection, script_id)
    assert listed.id == thread.id
    assert [(m.author_id, m.body) for m in listed.messages] == [(author, "Слишком прямо")]


def test_empty_comment_is_refused(connection: Connection) -> None:
    _, script_id, author = _story(connection)
    with pytest.raises(Invalid):
        create_thread(connection, script_id, uuid.uuid4(), "Вера", "  ", author, "")
    assert list_threads(connection, script_id) == []


def test_repeated_thread_id(connection: Connection) -> None:
    _, script_id, author = _story(connection)
    thread_id = uuid.uuid4()
    create_thread(connection, script_id, thread_id, "Вера", "Да", author, "")
    with pytest.raises(Conflict):
        create_thread(connection, script_id, thread_id, "Вера", "Ещё", author, "")


def _second_draft(connection: Connection, draft_id: uuid.UUID, author: uuid.UUID) -> tuple[uuid.UUID, uuid.UUID]:
    project_id = draft_row(connection, draft_id).project_id
    second = create_draft(connection, project_id, "Драфт 2", draft_id, author).id
    return second, screenplay_id(connection, second)


def test_any_draft_takes_comments(connection: Connection) -> None:
    draft_id, script_id, author = _story(connection)
    _, second_script = _second_draft(connection, draft_id, author)
    thread = create_thread(connection, second_script, uuid.uuid4(), "Вера", "Да", author, "")
    assert [t.id for t in list_threads(connection, second_script)] == [thread.id]
    assert list_threads(connection, script_id) == []


def test_locked_draft_refuses_review(connection: Connection) -> None:
    draft_id, script_id, author = _story(connection)
    thread = create_thread(connection, script_id, uuid.uuid4(), "Вера", "Да", author, "")
    suggestion = create_suggestion(connection, script_id, "s3", "Вера молчит", "Вера плачет", "", "x:y:z")
    update_draft(connection, draft_id, {"locked": True})
    with pytest.raises(Locked):
        create_thread(connection, script_id, uuid.uuid4(), "Вера", "Да", author, "")
    with pytest.raises(Locked):
        decide(connection, suggestion.id, "accepted", author)
    assert [t.id for t in list_threads(connection, script_id)] == [thread.id]


def test_accepting_keeps_the_text_as_a_snapshot(connection: Connection) -> None:
    _, script_id, author = _story(connection)
    before = get_text(connection, script_id).content
    accepted = create_suggestion(connection, script_id, "s3", "Вера молчит", "Вера плачет", "", "x:y:z")
    decide(connection, accepted.id, "accepted", author)
    (version,) = [v for v in list_versions(connection, script_id, "text") if v.reason == "suggestion"]
    assert version.content == before


def test_rejecting_keeps_no_snapshot(connection: Connection) -> None:
    _, script_id, author = _story(connection)
    rejected = create_suggestion(connection, script_id, "s3", "Вера молчит", "Вера плачет", "", "x:y:z")
    versions = len(list_versions(connection, script_id, "text"))
    decide(connection, rejected.id, "rejected", author)
    assert len(list_versions(connection, script_id, "text")) == versions


def test_character_has_no_text(connection: Connection) -> None:
    draft_id, _, author = _story(connection)
    (vera,) = create_documents(connection, draft_id, [{"kind": "character", "name": "Вера", "role": "main"}], author)
    with pytest.raises(NotFound):
        list_threads(connection, vera.id)


def test_only_own_messages_change(connection: Connection) -> None:
    _, script_id, author = _story(connection)
    other = get_or_create_user(connection, "s2", "editor@authorled.test", "Редактор").id
    thread = create_thread(connection, script_id, uuid.uuid4(), "Вера", "Слишком прямо", author, "")
    thread = add_reply(connection, thread.id, "Согласен", other, "редактор")
    reply = thread.messages[1]
    with pytest.raises(Forbidden):
        edit_message(connection, thread.id, reply.id, "Нет", author)
    edited = edit_message(connection, thread.id, reply.id, "Согласен полностью", other)
    assert edited.messages[1].body == "Согласен полностью" and edited.messages[1].edited_at is not None
    assert edited.messages[1].author_role == "редактор"


def test_deleting_the_first_message_deletes_the_thread(connection: Connection) -> None:
    _, script_id, author = _story(connection)
    thread = create_thread(connection, script_id, uuid.uuid4(), "Вера", "Первое", author, "")
    add_reply(connection, thread.id, "Второе", author, "")
    thread = add_reply(connection, thread.id, "Третье", author, "")
    assert delete_message(connection, thread.id, thread.messages[1].id, author, may_remove_coauthor=True) is False
    assert delete_message(connection, thread.id, thread.messages[0].id, author, may_remove_coauthor=True) is True
    assert list_threads(connection, script_id) == []


def test_resolve_and_reopen(connection: Connection) -> None:
    _, script_id, author = _story(connection)
    thread = create_thread(connection, script_id, uuid.uuid4(), "Вера", "Да", author, "")
    assert set_resolved(connection, thread.id, True, author).resolved_at is not None
    assert set_resolved(connection, thread.id, False, author).resolved_at is None


def test_suggestion_keeps_the_text(connection: Connection) -> None:
    _, script_id, _ = _story(connection)
    before = get_text(connection, script_id)
    suggestion = create_suggestion(
        connection, script_id, "s3", "Вера молчит", "Вера отворачивается", "Действие", SESSION
    )
    assert suggestion.status == "open"
    after = get_text(connection, script_id)
    assert (after.revision, after.content) == (before.revision, before.content)
    assert [s.id for s in list_suggestions(connection, script_id, "open")] == [suggestion.id]


def test_suggestion_needs_the_quote_in_the_scene(connection: Connection) -> None:
    _, script_id, _ = _story(connection)
    with pytest.raises(Invalid, match="Цитата не найдена в сцене"):
        create_suggestion(connection, script_id, "s3", "Вода холодная", "Вода тёплая", "", SESSION)
    with pytest.raises(NotFound):
        create_suggestion(connection, script_id, "s9", "Вера молчит", "Вера плачет", "", SESSION)
    assert list_suggestions(connection, script_id, None) == []


def test_coauthor_thread_keeps_the_text(connection: Connection) -> None:
    _, script_id, author = _story(connection)
    before = get_text(connection, script_id)
    thread = create_coauthor_thread(connection, script_id, "s3", "Вера молчит", "Здесь пауза важнее реплики")
    assert (thread.quote, thread.scene_uid) == ("Вера молчит", "s3")
    (message,) = thread.messages
    assert (message.author_kind, message.author_id, message.author_name) == ("coauthor", None, "Соавтор")
    after = get_text(connection, script_id)
    assert (after.revision, after.content) == (before.revision, before.content)
    replied = add_reply(connection, thread.id, "Подумаю", author, "")
    assert [m.author_kind for m in replied.messages] == ["coauthor", "user"]
    assert [t.id for t in list_threads(connection, script_id)] == [thread.id]


def test_coauthor_thread_needs_the_quote_in_the_scene(connection: Connection) -> None:
    _, script_id, _ = _story(connection)
    with pytest.raises(Invalid, match="Цитата не найдена в сцене"):
        create_coauthor_thread(connection, script_id, "s3", "Вода холодная", "Холодно")
    with pytest.raises(NotFound):
        create_coauthor_thread(connection, script_id, "s9", "Вера молчит", "Пауза")
    with pytest.raises(Invalid):
        create_coauthor_thread(connection, script_id, "s3", "Вера молчит", "  ")
    assert list_threads(connection, script_id) == []


def test_coauthor_thread_in_a_locked_draft(connection: Connection) -> None:
    draft_id, script_id, _ = _story(connection)
    update_draft(connection, draft_id, {"locked": True})
    with pytest.raises(Locked):
        create_coauthor_thread(connection, script_id, "s3", "Вера молчит", "Пауза")


def test_message_of_the_coauthor_is_not_edited_but_removed(connection: Connection) -> None:
    _, script_id, author = _story(connection)
    thread = create_coauthor_thread(connection, script_id, "s3", "Вера молчит", "Пауза")
    message = thread.messages[0]
    with pytest.raises(Forbidden):
        edit_message(connection, thread.id, message.id, "Другое", author)
    assert delete_message(connection, thread.id, message.id, author, may_remove_coauthor=True) is True
    assert list_threads(connection, script_id) == []


def test_filter_and_decide_once(connection: Connection) -> None:
    _, script_id, author = _story(connection)
    first = create_suggestion(connection, script_id, "s3", "Вера молчит", "Вера отворачивается", "", SESSION)
    second = create_suggestion(connection, script_id, "s3", "молчит", "кричит", "", SESSION)
    decide(connection, second.id, "rejected", author)
    assert [s.id for s in list_suggestions(connection, script_id, "open")] == [first.id]
    accepted = decide(connection, first.id, "accepted", author)
    assert accepted.decided_at is not None
    assert accepted.decided_by == author
    assert (accepted.author_kind, accepted.author_name, accepted.session_id) == ("coauthor", "Соавтор", SESSION)
    with pytest.raises(Conflict):
        decide(connection, first.id, "rejected", author)
    with pytest.raises(Invalid):
        list_suggestions(connection, script_id, "maybe")


LINES = [{"type": "character", "text": "ДЯДЯ КОЛЯ"}, {"type": "dialogue", "text": "Пойдём домой."}]


@pytest.mark.parametrize(
    ("place", "scene_uid", "quote"),
    [
        ("replace", "s3", "Вера молчит"),
        ("after", "s3", "Вера молчит"),
        ("scene_end", "s3", ""),
        ("scene_body", "s3", ""),
        ("script_start", "", ""),
        ("script_end", "", ""),
    ],
)
def test_paragraphs_at_every_place(connection: Connection, place: str, scene_uid: str, quote: str) -> None:
    """openspec/specs/api/review, «Предложение соавтора»: the text stays, the paragraphs keep their types."""
    _, script_id, _ = _story(connection)
    before = get_text(connection, script_id)
    suggestion = create_suggestion(connection, script_id, scene_uid, quote, "", "Сцена", SESSION, place, LINES)
    assert (suggestion.place, suggestion.scene_uid, suggestion.quote, suggestion.text) == (
        place,
        scene_uid or None,
        quote or None,
        None,
    )
    assert suggestion.paragraphs == [Paragraph("character", "ДЯДЯ КОЛЯ"), Paragraph("dialogue", "Пойдём домой.")]
    after = get_text(connection, script_id)
    assert (after.revision, after.content) == (before.revision, before.content)


def test_line_suggestion_has_no_paragraphs(connection: Connection) -> None:
    _, script_id, _ = _story(connection)
    suggestion = create_suggestion(connection, script_id, "s3", "Вера молчит", "Вера плачет", "", SESSION)
    assert (suggestion.place, suggestion.text, suggestion.paragraphs) == ("replace", "Вера плачет", None)


def test_start_of_a_new_screenplay(connection: Connection) -> None:
    """A new story has one empty scene heading and no quote: the paragraphs go to the start of the screenplay."""
    author = get_or_create_user(connection, "s2", "new@authorled.test", "Новый").id
    _, _, script_id = create_project(connection, author, "Пусто")
    assert len(get_text(connection, script_id).content["content"]) == len(new_screenplay()["content"])
    suggestion = create_suggestion(connection, script_id, "", "", "", "", SESSION, "script_start", LINES)
    assert suggestion.place == "script_start"


@pytest.mark.parametrize(
    ("place", "scene_uid", "quote", "line", "paragraphs", "reason"),
    [
        ("speech", "s3", "Вера молчит", "", LINES, "Место предложения"),
        ("after", "s3", "Вера молчит", "", [{"type": "speech", "text": "Да"}], "неизвестный тип «speech»"),
        ("scene_end", "s3", "", "", [], "непустой список"),
        ("scene_end", "s3", "", "", [{"type": "action", "text": "  "}], "не может быть пустым"),
        ("scene_end", "s3", "", "", [{"type": "action", "text": "Раз\nдва"}], "переноса строки"),
        ("scene_end", "s3", "", "", [{"type": "action", "text": "Да", "color": "1"}], "ровно с полями"),
        ("scene_end", "s3", "", "", [{"type": "parenthetical", "text": "(тихо)"}], "без скобок"),
        ("script_end", "", "Вера молчит", "", LINES, "нет цитаты"),
        ("script_end", "s3", "", "", LINES, "нет сцены"),
        ("after", "s3", "", "", LINES, "нужна цитата"),
        ("scene_end", "s3", "", "Строка", None, "нужны абзацы"),
        ("replace", "s3", "Вера молчит", "Строка", LINES, "либо текст строкой"),
        ("scene_end", "", "", "", LINES, "нужен uid сцены"),
        ("after", "s3", "Вода холодная", "", LINES, "Цитата не найдена в сцене"),
    ],
)
def test_wrong_place_or_paragraphs_are_refused(
    connection: Connection, place: str, scene_uid: str, quote: str, line: str, paragraphs: Any, reason: str
) -> None:
    """openspec/specs/api/review, «Поля места предложения» and «Проверка абзацев предложения»."""
    _, script_id, _ = _story(connection)
    with pytest.raises(Invalid, match=reason):
        create_suggestion(connection, script_id, scene_uid, quote, line, "", SESSION, place, paragraphs)
    assert list_suggestions(connection, script_id, None) == []


def test_too_many_paragraphs(connection: Connection) -> None:
    _, script_id, _ = _story(connection)
    many = [{"type": "action", "text": "Тишина."}] * (MAX_PARAGRAPHS + 1)
    with pytest.raises(Invalid, match=f"не больше {MAX_PARAGRAPHS}"):
        create_suggestion(connection, script_id, "s3", "", "", "", SESSION, "scene_end", many)


def test_scene_of_an_insertion_must_exist(connection: Connection) -> None:
    _, script_id, _ = _story(connection)
    with pytest.raises(NotFound, match="Сцены s9 нет"):
        create_suggestion(connection, script_id, "s9", "", "", "", SESSION, "scene_end", LINES)


def test_accepting_paragraphs_keeps_a_snapshot(connection: Connection) -> None:
    _, script_id, author = _story(connection)
    suggestion = create_suggestion(connection, script_id, "", "", "", "", SESSION, "script_end", LINES)
    decide(connection, suggestion.id, "accepted", author)
    assert [v for v in list_versions(connection, script_id, "text") if v.reason == "suggestion"] != []


@pytest.mark.parametrize(
    "values",
    [
        "'after', 's3', 'Вера', 'Да', NULL",
        "'script_end', 's3', NULL, NULL, '[]'",
        "'after', 's3', '', NULL, '[]'",
        "'replace', 's3', 'Вера', 'Да', '[]'",
        "'scene_end', 's3', NULL, NULL, '{}'",
    ],
)
def test_table_refuses_a_place_without_its_fields(connection: Connection, values: str) -> None:
    """openspec/specs/core/database, «Таблица предложений»."""
    _, script_id, _ = _story(connection)
    with pytest.raises(IntegrityError), connection.begin_nested():
        connection.execute(
            text(
                "INSERT INTO authorled.suggestions (document_id, place, scene_uid, quote, text, paragraphs, why, "
                f"session_id, author_kind) VALUES (:script, {values}, '', 'x:y:z', 'coauthor')"
            ),
            {"script": script_id},
        )
