"""Client of Yandex Search API (openspec/specs/integrations, «Yandex Search API»): without network, HTTP is replaced by
httpx.MockTransport over the answers in tests/fixtures/yandex_search/."""

import ast
import base64
import json
import logging
from collections.abc import Callable
from pathlib import Path

import httpx
import pytest

from agents import web_search
from agents.web_search import FOUND_HEADER, NOTHING_FOUND, QueryRejected, WebSearchFailed

FIXTURES = Path(__file__).parent / "fixtures" / "yandex_search"
KEY = "AQVN-test-key-not-real"
QUERY = "табачный киоск Москва 1972"


@pytest.fixture(autouse=True)
def yandex_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("YANDEX_SEARCH_API_KEY", KEY)
    monkeypatch.setenv("YANDEX_CLOUD_FOLDER_ID", "b1gtestfolder")
    # Each test starts with no earlier request, so the quota pause does not carry over between tests.
    monkeypatch.setattr(web_search, "_last_request", None)


def _client(handler: Callable[[httpx.Request], httpx.Response]) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(handler))


def _xml_answer(name: str) -> Callable[[httpx.Request], httpx.Response]:
    raw = base64.b64encode((FIXTURES / name).read_bytes()).decode()
    return lambda request: httpx.Response(200, json={"rawData": raw})


def test_request_asks_russian_index_region_and_xml() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return _xml_answer("found.xml")(request)

    web_search.search(QUERY, _client(handler))
    (request,) = seen
    body = json.loads(request.content)
    assert str(request.url) == web_search.URL
    assert request.headers["Authorization"] == f"Api-Key {KEY}"
    assert body["query"] == {"searchType": "SEARCH_TYPE_RU", "queryText": QUERY}
    assert body["region"] == "225"
    assert body["responseFormat"] == "FORMAT_XML"
    assert body["folderId"] == "b1gtestfolder"
    assert body["groupSpec"]["groupsOnPage"] == "5"
    assert body["maxPassages"] == "5"


def test_results_have_title_url_and_passages_without_highlighting() -> None:
    results = web_search.search(QUERY, _client(_xml_answer("found.xml")))
    assert len(results) == 5
    first = results[0]
    assert first.url == "https://varlamov.me/1464994.html"
    assert first.title == "Новые московские ларьки. Старые московские ларьки! — Teletype"
    assert any("Киоски на ВДНХ, 1972 год" in passage for passage in first.passages)
    assert all(result.url and result.passages for result in results)


def test_answer_for_model_lists_results_with_addresses() -> None:
    results = web_search.search(QUERY, _client(_xml_answer("found.xml")))
    text = web_search.for_model(QUERY, results)
    assert text.startswith(FOUND_HEADER)
    assert "1. Новые московские ларьки" in text
    assert "https://lori.ru/23670736" in text
    assert "<hlword>" not in text


def test_nothing_found_is_an_empty_result() -> None:
    results = web_search.search(QUERY, _client(_xml_answer("nothing_found.xml")))
    assert results == []
    assert web_search.for_model(QUERY, results).startswith(NOTHING_FOUND)


def test_other_yandex_error_fails() -> None:
    with pytest.raises(WebSearchFailed, match="code 55"):
        web_search.search(QUERY, _client(_xml_answer("error.xml")))


@pytest.mark.parametrize(
    "xml",
    [
        b'<?xml version="1.0" encoding="utf-8"?><yandexsearch><response><reqid>0</reqid></response></yandexsearch>',
        b"<html>not a search</html>",
        b"not xml at all",
    ],
)
def test_unknown_shape_fails(xml: bytes) -> None:
    raw = base64.b64encode(xml).decode()
    with pytest.raises(WebSearchFailed):
        web_search.search(QUERY, _client(lambda request: httpx.Response(200, json={"rawData": raw})))


def test_answer_without_raw_data_fails() -> None:
    with pytest.raises(WebSearchFailed, match="rawData"):
        web_search.search(QUERY, _client(lambda request: httpx.Response(200, json={"other": 1})))


def test_http_error_fails_with_code_and_logs_neither_query_nor_key(
    caplog: pytest.LogCaptureFixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    # The migration tests run Alembic's fileConfig in this process, which disables the loggers created before it.
    monkeypatch.setattr(web_search.log, "disabled", False)
    answer = {"code": 16, "message": "Unknown api key"}
    with caplog.at_level(logging.ERROR, logger="agents.web_search"), pytest.raises(WebSearchFailed, match="HTTP 401"):
        web_search.search(QUERY, _client(lambda request: httpx.Response(401, json=answer)))
    assert "HTTP 401" in caplog.text
    assert QUERY not in caplog.text
    assert KEY not in caplog.text


def test_network_error_fails() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("timed out", request=request)

    with pytest.raises(WebSearchFailed, match="ConnectTimeout"):
        web_search.search(QUERY, _client(handler))


@pytest.mark.parametrize("name", ["YANDEX_SEARCH_API_KEY", "YANDEX_CLOUD_FOLDER_ID"])
def test_missing_setting_is_named(monkeypatch: pytest.MonkeyPatch, name: str) -> None:
    monkeypatch.delenv(name)
    with pytest.raises(RuntimeError, match=name):
        web_search.settings()


@pytest.mark.parametrize("query", ["", "   ", "а" * 401, " ".join(["слово"] * 41)])
def test_query_out_of_limits_is_rejected(query: str) -> None:
    with pytest.raises(QueryRejected):
        web_search.check_query(query)


def test_query_is_trimmed() -> None:
    assert web_search.check_query("  киоск 1972 ") == "киоск 1972"


def test_coauthor_checks_settings_and_price_at_startup() -> None:
    """The module of the co-author calls both checks at its top level, so the API does not start without them
    (integrations, «Yandex Search API»; billing/subscriptions, «Цены моделей как данные»)."""
    module = ast.parse((Path(__file__).resolve().parents[1] / "agents" / "coauthor.py").read_text())
    calls = {
        ast.unparse(node.value)
        for node in module.body
        if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call)
    }
    assert "web_search.settings()" in calls
    assert "billing.check_tool_price(web_search.TOOL)" in calls


class Clock:
    """time.monotonic and time.sleep of web_search: the sleeps move the clock forward."""

    def __init__(self) -> None:
        self.now = 1000.0
        self.sleeps: list[float] = []

    def monotonic(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


@pytest.fixture
def clock(monkeypatch: pytest.MonkeyPatch) -> Clock:
    fake = Clock()
    monkeypatch.setattr(web_search.time, "monotonic", fake.monotonic)
    monkeypatch.setattr(web_search.time, "sleep", fake.sleep)
    return fake


def test_second_request_waits_the_rest_of_the_second(clock: Clock) -> None:
    client = _client(_xml_answer("found.xml"))
    web_search.search(QUERY, client)
    clock.now += 0.3
    web_search.search(QUERY, client)
    assert clock.sleeps == [pytest.approx(0.7)]


def test_request_after_a_second_does_not_wait(clock: Clock) -> None:
    client = _client(_xml_answer("found.xml"))
    web_search.search(QUERY, client)
    clock.now += 1.5
    web_search.search(QUERY, client)
    assert clock.sleeps == []


def test_failed_request_also_counts_for_the_quota(clock: Clock) -> None:
    with pytest.raises(WebSearchFailed):
        web_search.search(QUERY, _client(lambda request: httpx.Response(500, json={})))
    web_search.search(QUERY, _client(_xml_answer("found.xml")))
    assert clock.sleeps == [pytest.approx(1.0)]


def test_quota_refusal_is_not_retried(clock: Clock) -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(429, json={"code": 8, "message": "quota"})

    with pytest.raises(WebSearchFailed, match="HTTP 429"):
        web_search.search(QUERY, _client(handler))
    assert len(requests) == 1
