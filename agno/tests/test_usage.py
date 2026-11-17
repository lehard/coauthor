"""The usage journal, the limit and the administrator's commands (openspec/specs/billing/subscriptions: «Журнал расхода
соавтора», «Проверка лимита до запуска», «Смена тарифа», «Команды администратора»; openspec/specs/billing/module,
«Таблица журнала расхода биллинга»)."""

import re
import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import Connection, insert, select, update
from sqlalchemy.exc import IntegrityError

import billing.plans as plans_module
from admin.__main__ import main as admin_main
from admin.__main__ import print_report
from billing.plans import UnknownModel
from billing.subscriptions import NoSubscription, set_plan, start_subscription
from billing.tables import subscriptions, tool_usage_records, usage_records
from billing.usage import (
    LimitReached,
    ModelUsage,
    NoTokens,
    RunNotFound,
    RunUsage,
    ToolUsage,
    check_limit,
    period_spend,
    record_run,
    recorded_run_ids,
    report,
    run_session,
)
from core.tables import users
from core.users import user_id_by_email

START = datetime(2027, 11, 7, 10, tzinfo=UTC)
NOW = START + timedelta(days=3)


@pytest.fixture
def plans_with_plus(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """The plans file of the release plus beta-plus with a larger limit."""
    path = tmp_path / "plans.toml"
    path.write_text(
        plans_module.PLANS_FILE.read_text(encoding="utf-8")
        + '\n[plans.beta-plus]\nname = "Бета+"\nprice_rub = 0\nperiod_months = 1\n'
        + "limit_rub = 1500\nstorage_mb = 1000\npurchasable = false\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(plans_module, "PLANS_FILE", path)
    plans_module.plans.cache_clear()
    yield
    plans_module.plans.cache_clear()


def _author(connection: Connection) -> uuid.UUID:
    """A user of the core with a subscription; billing knows only the identifier."""
    user_id = uuid.uuid4()
    start_subscription(connection, user_id, "beta", "granted", START)
    return user_id


def _account(connection: Connection, email: str) -> uuid.UUID:
    subject = f"test-{uuid.uuid4()}"
    user_id: uuid.UUID = connection.execute(
        insert(users).values(auth_subject=subject, email=email, display_name="Автор").returning(users.c.id)
    ).scalar_one()
    return user_id


def _run(
    run_id: str | None = None,
    occurred_at: datetime = NOW,
    input_tokens: int = 10_000,
    cache_read_tokens: int = 4_000,
    output_tokens: int = 2_000,
    model: str = "deepseek-fast",
    tools: tuple[ToolUsage, ...] = (),
) -> RunUsage:
    return RunUsage(
        run_id=run_id or str(uuid.uuid4()),
        session_id="p:d:c",
        agent_id="coauthor",
        status="completed",
        occurred_at=occurred_at,
        models=(ModelUsage(model, input_tokens, cache_read_tokens, output_tokens, Decimal("0.0045")),),
        tools=tools,
    )


def _rows(connection: Connection, user_id: uuid.UUID) -> list[Any]:
    return list(connection.execute(select(usage_records).where(usage_records.c.user_id == user_id)).all())


def test_record_once(connection: Connection) -> None:
    user_id = _author(connection)
    run = _run("r-once")
    assert record_run(connection, user_id, run, NOW) == 1
    assert record_run(connection, user_id, run, NOW) == 0
    (row,) = _rows(connection, user_id)
    assert (row.run_id, row.model, row.run_status) == ("r-once", "deepseek-fast", "completed")
    assert (row.input_tokens, row.cache_read_tokens, row.output_tokens) == (10_000, 4_000, 2_000)
    assert row.cost_rub == Decimal("0.422400")
    assert row.provider_cost_usd == Decimal("0.004500")
    assert recorded_run_ids(connection, ["r-once", "r-other"]) == {"r-once"}


def test_run_without_tokens(connection: Connection) -> None:
    user_id = _author(connection)
    run = RunUsage("r1", "p:d:c", "coauthor", "completed", NOW, (), ())
    with pytest.raises(NoTokens):
        record_run(connection, user_id, run, NOW)


def test_model_without_price(connection: Connection) -> None:
    user_id = _author(connection)
    with pytest.raises(UnknownModel, match="'gpt-4o'"):
        record_run(connection, user_id, _run(model="gpt-4o"), NOW)
    assert _rows(connection, user_id) == []


def test_no_subscription_to_record_under(connection: Connection) -> None:
    with pytest.raises(NoSubscription):
        record_run(connection, uuid.uuid4(), _run(), NOW)


def test_spend_of_the_period(connection: Connection) -> None:
    user_id = _author(connection)
    record_run(connection, user_id, _run(occurred_at=START - timedelta(minutes=1)), NOW)
    record_run(connection, user_id, _run(occurred_at=START), NOW)
    record_run(connection, user_id, _run(occurred_at=NOW), NOW)
    allowance = check_limit(connection, user_id, NOW)
    assert allowance.spent == period_spend(connection, allowance.subscription) == Decimal("0.8448")
    assert allowance.plan.limit_rub == Decimal(500)


def test_limit_reached(connection: Connection) -> None:
    user_id = _author(connection)
    # 500 RUB of output at 120 RUB per million.
    record_run(connection, user_id, _run(input_tokens=0, cache_read_tokens=0, output_tokens=4_166_667), NOW)
    with pytest.raises(LimitReached) as reached:
        check_limit(connection, user_id, NOW)
    assert reached.value.renews_at == datetime(2027, 12, 7, 10, tzinfo=UTC)
    assert reached.value.spent >= reached.value.limit == Decimal(500)


def test_new_period_starts_from_zero(connection: Connection) -> None:
    user_id = _author(connection)
    record_run(connection, user_id, _run(input_tokens=0, cache_read_tokens=0, output_tokens=4_166_667), NOW)
    later = datetime(2027, 12, 8, tzinfo=UTC)
    allowance = check_limit(connection, user_id, later)
    assert allowance.spent == 0
    assert allowance.subscription.period_start == datetime(2027, 12, 7, 10, tzinfo=UTC)


def test_new_plan_limit_applies_at_once(connection: Connection, plans_with_plus: None) -> None:
    user_id = _author(connection)
    record_run(connection, user_id, _run(input_tokens=0, cache_read_tokens=0, output_tokens=4_166_667), NOW)
    with pytest.raises(LimitReached):
        check_limit(connection, user_id, NOW)
    set_plan(connection, user_id, "beta-plus")
    allowance = check_limit(connection, user_id, NOW)
    assert allowance.plan.code == "beta-plus"
    assert allowance.spent > Decimal(500)
    assert allowance.subscription.period_start == START


def test_limit_without_subscription(connection: Connection) -> None:
    user_id = _author(connection)
    connection.execute(
        update(subscriptions).where(subscriptions.c.user_id == user_id).values(status="ended", ended_at=NOW)
    )
    with pytest.raises(NoSubscription):
        check_limit(connection, user_id, NOW)


def test_report(connection: Connection) -> None:
    user_id = _author(connection)
    record_run(connection, user_id, _run(), NOW)
    record_run(connection, user_id, _run(), NOW)
    record_run(connection, user_id, _run(occurred_at=START - timedelta(days=1)), NOW)
    (row,) = report(connection, [user_id], NOW)
    assert row.user_id == user_id
    assert (row.plan, row.runs, row.period_start) == ("beta", 2, START)
    assert (row.input_tokens, row.cache_read_tokens, row.output_tokens) == (20_000, 8_000, 4_000)
    assert row.spent_rub == Decimal("0.8448")
    assert row.remaining_rub == Decimal(500) - Decimal("0.8448")
    assert row.provider_cost_usd == Decimal("0.009")


def test_report_of_a_user_without_subscription(connection: Connection) -> None:
    with pytest.raises(NoSubscription):
        report(connection, [_author(connection), uuid.uuid4()], NOW)


def test_run_session(connection: Connection) -> None:
    user_id = _author(connection)
    record_run(connection, user_id, _run("r-own"), NOW)
    assert run_session(connection, user_id, "r-own", "coauthor") == "p:d:c"
    with pytest.raises(RunNotFound):
        run_session(connection, _author(connection), "r-own", "coauthor")
    with pytest.raises(RunNotFound):
        run_session(connection, user_id, "r-own", "other-agent")
    with pytest.raises(RunNotFound):
        run_session(connection, user_id, "r-none", "coauthor")


def test_user_by_email(connection: Connection) -> None:
    user_id = _account(connection, "one@example.com")
    assert user_id_by_email(connection, "one@example.com") == user_id
    with pytest.raises(LookupError, match="found 0"):
        user_id_by_email(connection, "nobody@example.com")
    _account(connection, "one@example.com")
    with pytest.raises(LookupError, match="found 2"):
        user_id_by_email(connection, "one@example.com")


def test_report_command_prints_the_email(connection: Connection, capsys: pytest.CaptureFixture[str]) -> None:
    user_id = _author(connection)
    record_run(connection, user_id, _run(), NOW)
    (row,) = report(connection, [user_id], NOW)
    print_report([("anna@example.com", row)])
    header, line = capsys.readouterr().out.splitlines()
    assert header.split()[:3] == ["почта", "тариф", "период"]
    assert line.split()[:2] == ["anna@example.com", "beta"]
    assert "0.42" in line.split()


def test_set_plan_command_refuses_unknown_email(capsys: pytest.CaptureFixture[str]) -> None:
    assert admin_main(["set-plan", "nobody@example.com", "beta"]) == 1
    assert "nobody@example.com" in capsys.readouterr().err


def test_repeat_run_and_model_is_refused(connection: Connection) -> None:
    user_id = _author(connection)
    record_run(connection, user_id, _run("r-dup"), NOW)
    (row,) = _rows(connection, user_id)
    values = {column: getattr(row, column) for column in row._fields if column not in ("id", "created_at")}
    with pytest.raises(IntegrityError, match="uq_usage_records_run_id_model"):
        connection.execute(insert(usage_records).values(values))


def test_cache_over_input_is_refused(connection: Connection) -> None:
    user_id = _author(connection)
    record_run(connection, user_id, _run("r-cache"), NOW)
    with pytest.raises(IntegrityError, match="ck_usage_records_tokens_valid"):
        connection.execute(
            update(usage_records).where(usage_records.c.run_id == "r-cache").values(cache_read_tokens=10_001)
        )


def test_user_with_usage_cannot_drop_subscription(connection: Connection) -> None:
    user_id = _author(connection)
    record_run(connection, user_id, _run(), NOW)
    with pytest.raises(IntegrityError, match="fk_usage_records_subscription_id_subscriptions"):
        connection.execute(subscriptions.delete().where(subscriptions.c.user_id == user_id))


SEARCHES = (ToolUsage("web_search", 2),)


def _tool_rows(connection: Connection, user_id: uuid.UUID) -> list[Any]:
    return list(connection.execute(select(tool_usage_records).where(tool_usage_records.c.user_id == user_id)).all())


def test_record_paid_searches_once(connection: Connection) -> None:
    user_id = _author(connection)
    run = _run("r-search", tools=SEARCHES)
    assert record_run(connection, user_id, run, NOW) == 2
    assert record_run(connection, user_id, run, NOW) == 0
    (row,) = _tool_rows(connection, user_id)
    assert (row.run_id, row.tool, row.calls, row.run_status) == ("r-search", "web_search", 2, "completed")
    assert row.cost_rub == Decimal("0.976000")
    assert (row.session_id, row.agent_id, row.occurred_at) == ("p:d:c", "coauthor", NOW)


def test_run_without_searches_has_no_tool_rows(connection: Connection) -> None:
    user_id = _author(connection)
    record_run(connection, user_id, _run(), NOW)
    assert _tool_rows(connection, user_id) == []


def test_spend_of_the_period_adds_searches(connection: Connection) -> None:
    user_id = _author(connection)
    record_run(connection, user_id, _run(tools=SEARCHES), NOW)
    record_run(connection, user_id, _run(occurred_at=START - timedelta(minutes=1), tools=SEARCHES), NOW)
    allowance = check_limit(connection, user_id, NOW)
    assert allowance.spent == Decimal("0.4224") + Decimal("0.976")


def test_report_counts_paid_searches(connection: Connection, capsys: pytest.CaptureFixture[str]) -> None:
    user_id = _author(connection)
    record_run(connection, user_id, _run(tools=SEARCHES), NOW)
    record_run(connection, user_id, _run(), NOW)
    (row,) = report(connection, [user_id], NOW)
    assert (row.runs, row.paid_tool_calls) == (2, 2)
    assert row.spent_rub == Decimal("0.8448") + Decimal("0.976")
    assert row.remaining_rub == Decimal(500) - row.spent_rub
    print_report([("anna@example.com", row)])
    header, line = capsys.readouterr().out.splitlines()
    cells = dict(zip(re.split(r"\s{2,}", header), re.split(r"\s{2,}", line), strict=True))
    assert cells["поиски"] == "2"


def test_repeat_run_and_tool_is_refused(connection: Connection) -> None:
    user_id = _author(connection)
    record_run(connection, user_id, _run("r-dup-tool", tools=SEARCHES), NOW)
    (row,) = _tool_rows(connection, user_id)
    values = {column: getattr(row, column) for column in row._fields if column not in ("id", "created_at")}
    with pytest.raises(IntegrityError, match="uq_tool_usage_records_run_id_tool"):
        connection.execute(insert(tool_usage_records).values(values))


def test_zero_tool_calls_are_refused(connection: Connection) -> None:
    user_id = _author(connection)
    record_run(connection, user_id, _run("r-zero", tools=SEARCHES), NOW)
    with pytest.raises(IntegrityError, match="ck_tool_usage_records_calls_positive"):
        connection.execute(update(tool_usage_records).where(tool_usage_records.c.run_id == "r-zero").values(calls=0))


def test_subscription_with_tool_calls_cannot_be_dropped(connection: Connection) -> None:
    user_id = _author(connection)
    connection.execute(
        insert(tool_usage_records).values(
            user_id=user_id,
            subscription_id=check_limit(connection, user_id, NOW).subscription.id,
            run_id="r-only-tools",
            session_id="p:d:c",
            agent_id="coauthor",
            tool="web_search",
            run_status="completed",
            calls=1,
            cost_rub=Decimal("0.488"),
            occurred_at=NOW,
        )
    )
    with pytest.raises(IntegrityError, match="fk_tool_usage_records_subscription_id_subscriptions"):
        connection.execute(subscriptions.delete().where(subscriptions.c.user_id == user_id))
