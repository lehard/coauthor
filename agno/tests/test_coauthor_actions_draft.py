"""The fresh draft of a request of the measurement of actions on real PostgreSQL (openspec/specs/coauthor-actions-eval,
«Набор просьб замера действий»: «Пустой сценарий у просьбы»)."""

import uuid
from typing import Any

from sqlalchemy import Engine, delete, insert

from core import texts
from core.projects import create_project
from core.tables import projects, users
from evals.coauthor.user import Place, fresh_draft

SCENE = {"type": "doc", "content": [texts.heading("s1", "НАТ. ПЕРЕПРАВА — УТРО")]}


def _place(engine: Engine) -> tuple[Place, uuid.UUID]:
    with engine.begin() as connection:
        owner = connection.execute(
            insert(users)
            .values(auth_subject=f"test-{uuid.uuid4()}", email=f"{uuid.uuid4()}@authorled.test", display_name="Замер")
            .returning(users.c.id)
        ).scalar_one()
        story, draft_id, script = create_project(connection, owner, "Последний паром")
        texts.put_text(connection, script, 1, SCENE, owner)
    return Place("Последний паром", "", story.id, draft_id, "Драфт 1"), owner


def _text(engine: Engine, draft_id: uuid.UUID) -> dict[str, Any]:
    with engine.connect() as connection:
        return texts.get_text(connection, texts.screenplay_id(connection, draft_id)).content


def test_empty_text_gives_the_copy_a_new_screenplay(engine: Engine) -> None:
    place, owner = _place(engine)
    try:
        copy = fresh_draft(place, "замер r1", True, owner)
        (only,) = _text(engine, copy.draft_id)["content"]
        assert only["type"] == "sceneHeading" and "content" not in only
        assert _text(engine, place.draft_id) == SCENE
        kept = fresh_draft(place, "замер r1", False, owner)
        assert _text(engine, kept.draft_id)["content"][0]["content"][0]["text"] == "НАТ. ПЕРЕПРАВА — УТРО"
    finally:
        with engine.begin() as connection:
            connection.execute(delete(projects).where(projects.c.id == place.project_id))
            connection.execute(delete(users).where(users.c.id == owner))
