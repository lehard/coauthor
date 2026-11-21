"""Suggestions by place and typed paragraphs (openspec/changes/coauthor-typed-suggestions, design decision 4).

Existing suggestions become `replace` by a line and keep their quote and text.

Revision ID: 0020_suggestion_paragraphs
Revises: 0019_story_sharing
Create Date: 2026-11-21
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0020_suggestion_paragraphs"
down_revision: str | None = "0019_story_sharing"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

S = "authorled"
T = "suggestions"


def upgrade() -> None:
    op.add_column(T, sa.Column("place", sa.Text(), server_default="replace", nullable=False), schema=S)
    op.add_column(T, sa.Column("paragraphs", postgresql.JSONB(), nullable=True), schema=S)
    for column in ("scene_uid", "quote", "text"):
        op.alter_column(T, column, existing_type=sa.Text(), nullable=True, schema=S)
    # 0004 named it twice by the naming convention.
    op.drop_constraint(op.f("ck_suggestions_ck_suggestions_quote_not_empty"), T, schema=S, type_="check")
    checks = {
        "place_known": "place IN ('replace', 'after', 'scene_end', 'scene_body', 'script_start', 'script_end')",
        "scene_of_place": "(scene_uid IS NULL) = (place IN ('script_start', 'script_end'))",
        "quote_of_place": "(quote IS NOT NULL AND quote <> '') = (place IN ('replace', 'after'))",
        "text_or_paragraphs": "(paragraphs IS NULL) = (text IS NOT NULL)",
        "text_of_replace": "text IS NULL OR place = 'replace'",
        "paragraphs_list": "paragraphs IS NULL OR jsonb_typeof(paragraphs) = 'array'",
    }
    for name, condition in checks.items():
        op.create_check_constraint(op.f(f"ck_suggestions_{name}"), T, condition, schema=S)


def downgrade() -> None:
    raise NotImplementedError("Migrations of schema authorled go forward only.")
