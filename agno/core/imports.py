"""Import of a manuscript into a story (openspec/specs/api/story-import).

The file passed the checks of an upload (core/files.py): size, type and the antivirus. The text of the
screenplay of a draft is replaced and the missing characters and locations are added in one transaction;
other drafts, comments and suggestions stay as they are.

A file of a co-author conversation (`purpose` `chat`) is parsed by the same rules, only for the co-author: into a
new draft, a new story or the scenes of the file («Разбор файла беседы» and the requirements after it). The
co-author's tool checks that the file belongs to its conversation.
"""

import uuid
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import Connection, select

from core.documents import Draft, create_documents, draft_row, ensure_writable
from core.drafts import create_draft
from core.errors import Invalid
from core.files import StoredFile, check_upload, file_bytes, file_format, get_file, store_file
from core.importers.fdx import parse_fdx
from core.importers.fountain import parse_fountain
from core.importers.plain import parse_docx, parse_txt, text_of_txt
from core.importers.screenplay import Paragraph, build_doc, cast_from_text, places_from_text
from core.importers.starc import Named, Skipped, parse_starc
from core.projects import NEXT_COLOR, Project, create_project
from core.tables import documents
from core.texts import Doc, Text, block_text, put_text, scenes, screenplay_id, text_row, validate_text, write_text


@dataclass(frozen=True)
class Manuscript:
    """The text, and the characters and locations a project file names apart from its text (STARC).

    `skipped`: records of a STARC project whose documents are not in the file, for the author to see.
    """

    doc: Doc
    characters: list[Named] = field(default_factory=list)
    locations: list[Named] = field(default_factory=list)
    skipped: list[Skipped] = field(default_factory=list)


@dataclass(frozen=True)
class Imported:
    """The new text of the screenplay and what the file did not have (core/importers/starc.py)."""

    text: Text
    skipped: list[Skipped]


def parse_manuscript(extension: str, data: bytes) -> Manuscript:
    if extension == ".starc":
        project = parse_starc(data)
        return Manuscript(build_doc(project.paragraphs), project.characters, project.locations, project.skipped)
    parsers = {
        ".fountain": lambda: parse_fountain(text_of_txt(data)),
        ".fdx": lambda: parse_fdx(data),
        ".docx": lambda: parse_docx(data),
        ".txt": lambda: parse_txt(data),
    }
    paragraphs: list[Paragraph] = parsers[extension]()
    return Manuscript(build_doc(paragraphs))


def _manuscript(connection: Connection, project_id: uuid.UUID, file_id: uuid.UUID) -> Manuscript:
    stored = get_file(connection, file_id)
    if stored.project_id != project_id:
        raise Invalid("Файл загружен в другую историю.", "file_id")
    if stored.purpose != "import":
        raise Invalid("Импортировать можно только файл, загруженный для импорта.", "file_id")
    data = file_bytes(connection, file_id)
    return parse_manuscript(file_format(stored.name, "import", data).extension, data)


def _add_cast_and_places(
    connection: Connection, draft_id: uuid.UUID, manuscript: Manuscript, user_id: uuid.UUID
) -> None:
    have = {
        (kind, name.upper())
        for kind, name in connection.execute(
            select(documents.c.kind, documents.c.name).where(
                documents.c.draft_id == draft_id, documents.c.deleted_at.is_(None)
            )
        ).all()
    }
    doc = manuscript.doc
    items: list[dict[str, Any]] = []
    for kind, names in (
        ("character", [*manuscript.characters, *(Named(name, "episodic") for name in cast_from_text(doc))]),
        ("location", [*manuscript.locations, *(Named(name, "episodic") for name in places_from_text(doc))]),
    ):
        for named in names:
            if (kind, named.name.upper()) not in have:
                have.add((kind, named.name.upper()))
                items.append({"kind": kind, "name": named.name, "role": named.role})
    if items:
        create_documents(connection, draft_id, items, user_id)


def import_into(
    connection: Connection, draft_id: uuid.UUID, file_id: uuid.UUID, expected_revision: int, user_id: uuid.UUID
) -> Imported:
    """Replace the screenplay text of a draft by the manuscript if its revision is still `expected_revision`."""
    draft = draft_row(connection, draft_id)
    ensure_writable(connection, draft)
    manuscript = _manuscript(connection, draft.project_id, file_id)
    script_id = screenplay_id(connection, draft_id)
    text = put_text(connection, script_id, expected_revision, manuscript.doc, user_id, "import")
    _add_cast_and_places(connection, draft_id, manuscript, user_id)
    return Imported(text, manuscript.skipped)


def create_project_from_file(
    connection: Connection, owner_id: uuid.UUID, title: Any, name: str, data: bytes, cover_color: Any = NEXT_COLOR
) -> tuple[Project, uuid.UUID, uuid.UUID, list[Skipped]]:
    """A new story whose screenplay is the manuscript; the file is checked and parsed before anything is written.

    The last item: records of a STARC project the file did not have.
    """
    checked = check_upload(name, "import", data)
    manuscript = parse_manuscript(checked.format.extension, checked.data)
    project, draft_id, script_id = create_project(
        connection, owner_id, title, text=manuscript.doc, cover_color=cover_color
    )
    store_file(connection, project.id, owner_id, "import", None, checked)
    _add_cast_and_places(connection, draft_id, manuscript, owner_id)
    return project, draft_id, script_id, manuscript.skipped


def chat_file(connection: Connection, project_id: uuid.UUID, file_id: uuid.UUID) -> StoredFile:
    """A file of a conversation of this story: another story's file, a file for import or an original of a note is
    refused."""
    stored = get_file(connection, file_id)
    if stored.project_id != project_id:
        raise Invalid("Файл загружен в другую историю.", "file_id")
    if stored.purpose != "chat":
        raise Invalid("Это не файл беседы.", "file_id")
    return stored


def _chat_manuscript(connection: Connection, stored: StoredFile) -> Manuscript:
    """The manuscript of a file of a conversation; PDF and Markdown are refused with the formats of import."""
    data = file_bytes(connection, stored.id)
    return parse_manuscript(file_format(stored.name, "import", data).extension, data)


@dataclass(frozen=True)
class DraftFromFile:
    draft: Draft
    skipped: list[Skipped]


def create_draft_from_chat_file(
    connection: Connection, base_id: uuid.UUID, file_id: uuid.UUID, name: Any, user_id: uuid.UUID
) -> DraftFromFile:
    """A new draft of the story of `base_id`: a copy of the base whose screenplay is the file of the conversation.

    The file is parsed before anything is written; the base may be locked and does not change. The new draft has no
    snapshot of the copied text: its history starts with the file.
    """
    base = draft_row(connection, base_id)
    manuscript = _chat_manuscript(connection, chat_file(connection, base.project_id, file_id))
    draft = create_draft(connection, base.project_id, name, base_id, user_id)
    script_id = screenplay_id(connection, draft.id)
    text_row(connection, script_id, for_update=True)
    write_text(connection, script_id, validate_text(manuscript.doc), user_id)
    _add_cast_and_places(connection, draft.id, manuscript, user_id)
    return DraftFromFile(draft, manuscript.skipped)


def create_project_from_chat_file(
    connection: Connection, project_id: uuid.UUID, file_id: uuid.UUID, owner_id: uuid.UUID, title: Any
) -> tuple[Project, uuid.UUID, list[Skipped]]:
    """A new story of `owner_id` from a file of a conversation of `project_id`, by the rules of a story from a file:
    the new story keeps its own copy for import, the file of the conversation stays where it is."""
    stored = chat_file(connection, project_id, file_id)
    project, draft_id, _, skipped = create_project_from_file(
        connection, owner_id, title, stored.name, file_bytes(connection, stored.id)
    )
    return project, draft_id, skipped


@dataclass(frozen=True)
class FileScene:
    number: int
    heading: str
    paragraphs: list[dict[str, str]]


def chat_file_scenes(connection: Connection, project_id: uuid.UUID, file_id: uuid.UUID) -> tuple[str, list[FileScene]]:
    """The name of a file of a conversation and its scenes as the import would put them into the screenplay: each
    paragraph is its type and its text, line breaks inside a paragraph included."""
    stored = chat_file(connection, project_id, file_id)
    doc = _chat_manuscript(connection, stored).doc
    return stored.name, [
        FileScene(
            scene.number,
            scene.heading,
            [{"type": block["type"], "text": block_text(block)} for block in scene.blocks],
        )
        for scene in scenes(doc)
    ]
