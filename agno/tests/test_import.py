"""Import of manuscripts (openspec/specs/api/story-import) on samples exported by the editor."""

import io
import json
import uuid
from pathlib import Path

import pytest
from docx import Document as DocxDocument
from sqlalchemy import Connection, select

from core.documents import create_documents, draft_row, list_documents
from core.drafts import list_drafts, update_draft
from core.errors import Conflict, Invalid
from core.files import FORMATS, CheckedFile, get_file, store_file, upload_file
from core.importers.fdx import parse_fdx
from core.importers.fountain import parse_fountain
from core.importers.screenplay import cast_from_text, places_from_text
from core.importers.starc import Skipped
from core.imports import (
    chat_file_scenes,
    create_draft_from_chat_file,
    create_project_from_chat_file,
    import_into,
    parse_manuscript,
)
from core.projects import create_project, list_projects
from core.saves import list_versions
from core.tables import files
from core.texts import ELEMENT_NAMES, block_text, get_text, screenplay_id
from core.users import get_or_create_user
from tests.starc_sample import cloud_project

SAMPLES = Path(__file__).parent / "fixtures" / "import"


def _types(doc: dict) -> list[str]:  # type: ignore[type-arg]
    return [block["type"] for block in doc["content"]]


def test_fountain_matches_the_editor_importer() -> None:
    expected = json.loads((SAMPLES / "fountain-expected.json").read_text())["files"]
    for name, paragraphs in expected.items():
        got = [
            {"type": p.kind, "text": "".join(r.text for r in p.runs)}
            for p in parse_fountain((SAMPLES / name).read_text())
        ]
        assert got == paragraphs, name


def test_fdx_sample_matches_the_fountain_sample() -> None:
    """Both samples come from one document: FDX gives the same paragraphs, line breaks included."""
    expected = json.loads((SAMPLES / "fountain-expected.json").read_text())["files"]["all-types.fountain"]
    got = [
        {"type": p.kind, "text": "".join(r.text for r in p.runs)}
        for p in parse_fdx((SAMPLES / "all-types.fdx").read_bytes())
    ]
    assert got == expected


def test_round_trip_through_our_fountain() -> None:
    doc = parse_manuscript(".fountain", (SAMPLES / "all-types.fountain").read_bytes()).doc
    assert set(ELEMENT_NAMES) <= set(_types(doc))


def test_fdx_keeps_every_type_and_drops_brackets() -> None:
    doc = parse_manuscript(".fdx", (SAMPLES / "all-types.fdx").read_bytes()).doc
    assert set(ELEMENT_NAMES) <= set(_types(doc))
    parenthetical = next(b for b in doc["content"] if b["type"] == "parenthetical")
    assert parenthetical["content"][0]["text"] == "тихо"


def test_fdx_marks() -> None:
    xml = (
        '<?xml version="1.0"?><FinalDraft><Content><Paragraph Type="Action">'
        '<Text Style="Bold+Italic">Вера</Text><Text> молчит</Text></Paragraph></Content></FinalDraft>'
    ).encode()
    (paragraph,) = parse_fdx(xml)
    assert [(r.text, r.marks) for r in paragraph.runs] == [("Вера", ("bold", "italic")), (" молчит", ())]


def _paragraphs(source: str) -> list[tuple[str, str]]:
    return [(p.kind, "".join(r.text for r in p.runs)) for p in parse_fountain(source)]


def test_fountain_dialogue_lines_are_one_dialogue() -> None:
    assert _paragraphs("ДАРЬЯН\nФыва\nывафы\n") == [("character", "ДАРЬЯН"), ("dialogue", "Фыва\nывафы")]
    # Two spaces keep an empty line inside the dialogue; a parenthetical ends it.
    assert _paragraphs("ВЕРА\nА\n  \nБ\n(тихо)\nВ\n") == [
        ("character", "ВЕРА"),
        ("dialogue", "А\n\nБ"),
        ("parenthetical", "тихо"),
        ("dialogue", "В"),
    ]


def test_fountain_action_lines_are_one_action() -> None:
    assert _paragraphs("Пывапыв\nдальше\n\nДругое\n") == [("action", "Пывапыв\nдальше"), ("action", "Другое")]


def test_fountain_note_on_several_lines() -> None:
    assert _paragraphs("ВЕРА\n[[@parenthetical тихо\nпочти шёпотом]]\nДа.\n") == [
        ("character", "ВЕРА"),
        ("parenthetical", "тихо\nпочти шёпотом"),
        ("dialogue", "Да."),
    ]
    assert _paragraphs("[[@text а\n  \nб]]\n") == [("unformatted", "а\n\nб")]
    # Without `]]` before a blank line the line is no note.
    assert _paragraphs("[[незакрытая\n\nТекст\n") == [("action", "[[незакрытая"), ("action", "Текст")]


def test_fdx_keeps_a_line_break() -> None:
    xml = (
        '<?xml version="1.0"?><FinalDraft><Content><Paragraph Type="Dialogue">'
        "<Text>Фыва\nывафы</Text></Paragraph></Content></FinalDraft>"
    ).encode()
    (paragraph,) = parse_fdx(xml)
    assert (paragraph.kind, "".join(r.text for r in paragraph.runs)) == ("dialogue", "Фыва\nывафы")


@pytest.mark.parametrize(
    ("data", "reason"),
    [
        (b"<FinalDraft><Content><Paragraph", "XML"),
        (b"<Script/>", "Final Draft"),
        (b'<FinalDraft><Content><Paragraph Type="Chorus"/></Content></FinalDraft>', "Chorus"),
        (b"<FinalDraft><Content/></FinalDraft>", "нет абзацев"),
    ],
)
def test_broken_fdx(data: bytes, reason: str) -> None:
    with pytest.raises(Invalid, match=reason):
        parse_fdx(data)


def test_russian_txt() -> None:
    doc = parse_manuscript(".txt", (SAMPLES / "manuscript.txt").read_bytes()).doc
    assert _types(doc)[:5] == ["sceneHeading", "action", "character", "parenthetical", "dialogue"]
    uids = [b["attrs"]["uid"] for b in doc["content"] if b["type"] == "sceneHeading"]
    assert len(uids) == 2 and len(set(uids)) == 2


def test_docx_reads_like_txt() -> None:
    document = DocxDocument()
    lines = ("ИНТ. КУХНЯ — ДЕНЬ", "Вера ставит чайник.", "ВЕРА", "(тихо)", "Ты опять ходил к воде?", "Миша молчит.")
    for line in lines:
        document.add_paragraph(line)
    out = io.BytesIO()
    document.save(out)
    doc = parse_manuscript(".docx", out.getvalue()).doc
    assert _types(doc) == ["sceneHeading", "action", "character", "parenthetical", "dialogue", "action"]


def test_names_from_the_text() -> None:
    doc = parse_manuscript(".fountain", (SAMPLES / "all-types.fountain").read_bytes()).doc
    assert cast_from_text(doc) == ["Вера", "Миша"]
    assert places_from_text(doc) == ["Озеро, Мостки", "Дом Веры"]


def test_import_into_a_story(connection: Connection) -> None:
    owner = get_or_create_user(connection, "s1", "writer@authorled.test", "Сценарист").id
    project, draft, script_id = create_project(connection, owner, "Тихая вода")
    create_documents(connection, draft, [{"kind": "character", "name": "Вера", "role": "main"}], owner)
    stored = upload_file(
        connection, project.id, owner, "manuscript.txt", "import", None, (SAMPLES / "manuscript.txt").read_bytes()
    )
    imported = import_into(connection, draft, stored.id, 1, owner)
    assert imported.text.revision == 2
    assert imported.skipped == []
    (snapshot,) = [v for v in list_versions(connection, script_id, "text") if v.reason == "import"]
    assert snapshot.content["content"][0]["type"] == "sceneHeading"
    assert _types(get_text(connection, script_id).content)[0] == "sceneHeading"
    names = sorted((d.kind, d.name) for d in list_documents(connection, draft) if d.kind != "script")
    assert names == [("character", "Вера"), ("character", "Миша"), ("location", "Кухня"), ("location", "Озеро")]
    with pytest.raises(Conflict):
        import_into(connection, draft, stored.id, 1, owner)


def test_chat_file_is_not_imported(connection: Connection) -> None:
    owner = get_or_create_user(connection, "s1", "writer@authorled.test", "Сценарист").id
    project, draft, _ = create_project(connection, owner, "Тихая вода")
    stored = upload_file(connection, project.id, owner, "notes.txt", "chat", f"{project.id}:1", b"text")
    with pytest.raises(Invalid):
        import_into(connection, draft, stored.id, 1, owner)


# --- A file of a co-author conversation (story-import, «Разбор файла беседы» and after it) ---

CHAT_FOUNTAIN = (
    "INT. КУХНЯ - ДЕНЬ\n\nВера ставит чайник.\n\nВЕРА\nТы опять ходил к воде?\n\n"
    "EXT. ПРИСТАНЬ - ВЕЧЕР\n\nДАРЬЯН\nФыва\nывафы\n\nОЛЕГ\nПошли.\n\n"
    "INT. ДОМ ВЕРЫ - НОЧЬ\n\nТихо.\n"
).encode()


def _chat_file(connection: Connection, project_id: uuid.UUID, owner: uuid.UUID, name: str, data: bytes) -> uuid.UUID:
    return upload_file(
        connection, project_id, owner, name, "chat", f"{project_id}:{uuid.uuid4()}:{uuid.uuid4()}", data
    ).id


def _paragraphs_of(doc: dict) -> list[tuple[str, str]]:  # type: ignore[type-arg]
    return [(b["type"], block_text(b)) for b in doc["content"]]


def test_new_draft_from_a_chat_file(connection: Connection) -> None:
    owner = get_or_create_user(connection, "s1", "writer@authorled.test", "Сценарист").id
    project, draft, script_id = create_project(connection, owner, "Паром")
    create_documents(connection, draft, [{"kind": "character", "name": "Вера", "role": "main"}], owner)
    before = get_text(connection, script_id)
    file_id = _chat_file(connection, project.id, owner, "Паром.fountain", CHAT_FOUNTAIN)

    made = create_draft_from_chat_file(connection, draft, file_id, "Паром — правка", owner)

    assert made.draft.name == "Паром — правка" and not made.draft.locked and made.skipped == []
    new_script = screenplay_id(connection, made.draft.id)
    got = get_text(connection, new_script).content
    expected = parse_manuscript(".fountain", CHAT_FOUNTAIN).doc
    assert _paragraphs_of(got) == _paragraphs_of(expected)
    uids = [b["attrs"]["uid"] for b in got["content"] if b["type"] == "sceneHeading"]
    assert len(uids) == 3 and len(set(uids)) == 3
    assert [v for v in list_versions(connection, new_script, "text") if v.reason == "import"] == []
    names = sorted(d.name for d in list_documents(connection, made.draft.id) if d.kind == "character")
    assert names == ["Вера", "Дарьян", "Олег"]
    assert get_text(connection, script_id) == before
    assert [d.name for d in list_documents(connection, draft) if d.kind == "character"] == ["Вера"]


def test_new_draft_from_a_locked_base(connection: Connection) -> None:
    owner = get_or_create_user(connection, "s1", "writer@authorled.test", "Сценарист").id
    project, draft, script_id = create_project(connection, owner, "Паром")
    update_draft(connection, draft, {"locked": True})
    file_id = _chat_file(connection, project.id, owner, "Паром.fountain", CHAT_FOUNTAIN)
    made = create_draft_from_chat_file(connection, draft, file_id, "Паром", owner)
    assert not made.draft.locked
    assert draft_row(connection, draft).locked
    assert get_text(connection, script_id).revision == 1


def _broken_chat_fdx(connection: Connection, project_id: uuid.UUID, owner: uuid.UUID) -> uuid.UUID:
    """A chat file of FDX the import cannot parse; the upload of a chat file reads it too, so it is stored directly."""
    checked = CheckedFile("Сломан.fdx", FORMATS[".fdx"], b"<FinalDraft><Content><Paragraph", "")
    return store_file(connection, project_id, owner, "chat", f"{project_id}:{uuid.uuid4()}:{uuid.uuid4()}", checked).id


@pytest.mark.parametrize(
    ("name", "data", "reason"),
    [
        ("Эпоха.md", "# Эпоха\n".encode(), "Fountain, Final Draft, STARC, DOCX, TXT"),
        ("Сломан.fdx", None, "XML"),
    ],
)
def test_chat_file_refused(connection: Connection, name: str, data: bytes | None, reason: str) -> None:
    owner = get_or_create_user(connection, "s1", "writer@authorled.test", "Сценарист").id
    project, draft, _ = create_project(connection, owner, "Паром")
    file_id = (
        _broken_chat_fdx(connection, project.id, owner)
        if data is None
        else _chat_file(connection, project.id, owner, name, data)
    )
    drafts_before = len(list_drafts(connection, project.id))
    with pytest.raises(Invalid, match=reason):
        create_draft_from_chat_file(connection, draft, file_id, "Паром", owner)
    with pytest.raises(Invalid, match=reason):
        create_project_from_chat_file(connection, project.id, file_id, owner, "Паром 2")
    with pytest.raises(Invalid, match=reason):
        chat_file_scenes(connection, project.id, file_id)
    assert len(list_drafts(connection, project.id)) == drafts_before
    assert [p.title for p in list_projects(connection, owner, False)] == ["Паром"]


def test_chat_file_of_another_story(connection: Connection) -> None:
    owner = get_or_create_user(connection, "s1", "writer@authorled.test", "Сценарист").id
    project, draft, _ = create_project(connection, owner, "Паром")
    other, _, _ = create_project(connection, owner, "Другая")
    file_id = _chat_file(connection, other.id, owner, "Паром.fountain", CHAT_FOUNTAIN)
    with pytest.raises(Invalid, match="другую историю"):
        create_draft_from_chat_file(connection, draft, file_id, "Паром", owner)
    with pytest.raises(Invalid, match="другую историю"):
        chat_file_scenes(connection, project.id, file_id)


def test_import_file_is_not_a_chat_file(connection: Connection) -> None:
    owner = get_or_create_user(connection, "s1", "writer@authorled.test", "Сценарист").id
    project, draft, _ = create_project(connection, owner, "Паром")
    stored = upload_file(connection, project.id, owner, "Паром.fountain", "import", None, CHAT_FOUNTAIN)
    with pytest.raises(Invalid, match="не файл беседы"):
        create_draft_from_chat_file(connection, draft, stored.id, "Паром", owner)


def test_new_draft_from_a_starc_chat_file(connection: Connection) -> None:
    owner = get_or_create_user(connection, "s1", "writer@authorled.test", "Сценарист").id
    project, draft, _ = create_project(connection, owner, "Паром")
    file_id = _chat_file(connection, project.id, owner, "Паром.starc", cloud_project())
    made = create_draft_from_chat_file(connection, draft, file_id, "Паром", owner)
    assert made.skipped == [Skipped("location", "КОЛИБА"), Skipped("screenplay", "Выбор 2")]
    names = [d.name for d in list_documents(connection, made.draft.id)]
    assert "Колиба" not in names


def test_new_story_from_a_chat_file(connection: Connection) -> None:
    owner = get_or_create_user(connection, "s1", "writer@authorled.test", "Сценарист").id
    project, _, _ = create_project(connection, owner, "Паром")
    file_id = _chat_file(connection, project.id, owner, "Паром.fountain", CHAT_FOUNTAIN)
    made, draft_id, skipped = create_project_from_chat_file(connection, project.id, file_id, owner, "Паром 2")
    assert made.title == "Паром 2" and skipped == []
    assert sorted(p.title for p in list_projects(connection, owner, False)) == ["Паром", "Паром 2"]
    got = get_text(connection, screenplay_id(connection, draft_id)).content
    assert _paragraphs_of(got) == _paragraphs_of(parse_manuscript(".fountain", CHAT_FOUNTAIN).doc)
    assert connection.execute(select(files.c.purpose).where(files.c.project_id == made.id)).scalars().all() == [
        "import"
    ]
    assert get_file(connection, file_id).purpose == "chat" and get_file(connection, file_id).project_id == project.id


def test_scenes_of_a_chat_file(connection: Connection) -> None:
    owner = get_or_create_user(connection, "s1", "writer@authorled.test", "Сценарист").id
    project, _, _ = create_project(connection, owner, "Паром")
    file_id = _chat_file(connection, project.id, owner, "Паром.fountain", CHAT_FOUNTAIN)
    name, found = chat_file_scenes(connection, project.id, file_id)
    assert name == "Паром.fountain"
    assert [(s.number, len(s.paragraphs)) for s in found] == [(1, 4), (2, 5), (3, 2)]
    assert found[1].paragraphs[1:3] == [
        {"type": "character", "text": "ДАРЬЯН"},
        {"type": "dialogue", "text": "Фыва\nывафы"},
    ]
    assert found[1].paragraphs[0]["type"] == "sceneHeading"
