"""The journal of paid calls of tools: billing.tool_usage_records, one row per run and tool.

The co-author's search of the internet is paid from the user's limit (openspec/specs/billing/module, «Таблица журнала
вызовов инструментов биллинга»; change coauthor-web-search). Only adds a table: the previous release works with it.

Revision ID: b0002_tool_usage_records
Revises: b0001_from_core
Create Date: 2026-11-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b0002_tool_usage_records"
down_revision: str | None = "b0001_from_core"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "tool_usage_records",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("subscription_id", sa.Uuid(), nullable=False),
        sa.Column("run_id", sa.Text(), nullable=False),
        sa.Column("session_id", sa.Text(), nullable=False),
        sa.Column("agent_id", sa.Text(), nullable=False),
        sa.Column("tool", sa.Text(), nullable=False),
        sa.Column("run_status", sa.Text(), nullable=False),
        sa.Column("calls", sa.BigInteger(), nullable=False),
        sa.Column("cost_rub", sa.Numeric(14, 6), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_tool_usage_records"),
        sa.ForeignKeyConstraint(
            ["subscription_id"],
            ["billing.subscriptions.id"],
            name="fk_tool_usage_records_subscription_id_subscriptions",
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint("run_id", "tool", name="uq_tool_usage_records_run_id_tool"),
        sa.CheckConstraint(
            "run_id <> '' AND session_id <> '' AND agent_id <> '' AND tool <> ''",
            name="ck_tool_usage_records_ids_not_empty",
        ),
        sa.CheckConstraint(
            "run_status IN ('completed', 'error', 'cancelled')", name="ck_tool_usage_records_run_status_known"
        ),
        sa.CheckConstraint("calls > 0", name="ck_tool_usage_records_calls_positive"),
        sa.CheckConstraint("cost_rub >= 0", name="ck_tool_usage_records_cost_not_negative"),
        schema="billing",
    )
    op.create_index(
        "ix_tool_usage_records_subscription_id_occurred_at",
        "tool_usage_records",
        ["subscription_id", "occurred_at"],
        schema="billing",
    )
    op.create_index("ix_tool_usage_records_user_id", "tool_usage_records", ["user_id"], schema="billing")


def downgrade() -> None:
    # Migrations only go forward (openspec/context/04-engineering-standards.md).
    raise NotImplementedError("Migrations of schema billing only go forward")
