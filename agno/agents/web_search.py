"""Search of the internet for the co-author: Yandex Search API v2 (openspec/specs/integrations, «Yandex Search API»).

One synchronous request of the Russian index, region Russia, XML: up to 5 results with their title, address and up to
5 passages. The key and the folder are required settings; any failure of Yandex is an explicit WebSearchFailed with
the code of the answer, and the log never gets the text of the query or the key. The tool of the co-author is
`web_search` in agents/coauthor_tools.py; the paid answers are told apart by FOUND_HEADER and NOTHING_FOUND
(agents/coauthor_usage.py).
"""

import base64
import binascii
import logging
import threading
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from os import environ

import httpx

log = logging.getLogger(__name__)

# The name of the tool of the co-author and of its price in billing/model_prices.toml.
TOOL = "web_search"
URL = "https://searchapi.api.cloud.yandex.net/v2/web/search"
TIMEOUT_SECONDS = 15
RESULTS = 5
PASSAGES = 5
REGION_RUSSIA = "225"
# Limits of a query of Yandex Search API (concepts/web-search).
MAX_QUERY_CHARS = 400
MAX_QUERY_WORDS = 40
# The default quota of Yandex Search API: 1 synchronous request per second (concepts/limits). One API instance runs,
# so one lock per process keeps the requests of all authors at most one a second (design, decision 9a).
MIN_INTERVAL_SECONDS = 1.0
_quota_lock = threading.Lock()
_last_request: float | None = None
# The code of the XML answer of Yandex for a query found nowhere.
NOTHING_FOUND_CODE = "15"

# The beginnings of the two answers a paid search gives the model; refusals begin with «Отказ:».
FOUND_HEADER = "Найдено в интернете по запросу"
NOTHING_FOUND = "В интернете ничего не нашлось по запросу"


class WebSearchFailed(Exception):
    """Yandex did not give a search result: an HTTP error, a code of Yandex, or an answer of an unknown shape."""


class QueryRejected(Exception):
    """The query breaks the limits of Yandex; it is refused before any request."""


@dataclass(frozen=True)
class Settings:
    api_key: str
    folder_id: str


@dataclass(frozen=True)
class Result:
    title: str
    url: str
    passages: tuple[str, ...]


def settings() -> Settings:
    """YANDEX_SEARCH_API_KEY and YANDEX_CLOUD_FOLDER_ID; the API checks them at startup and stops without them."""
    api_key = environ.get("YANDEX_SEARCH_API_KEY")
    if not api_key:
        raise RuntimeError(
            "Required environment variable YANDEX_SEARCH_API_KEY is not set "
            "(API key of a service account with the role search-api.webSearch.user)"
        )
    folder_id = environ.get("YANDEX_CLOUD_FOLDER_ID")
    if not folder_id:
        raise RuntimeError("Required environment variable YANDEX_CLOUD_FOLDER_ID is not set (folder of Yandex Cloud)")
    return Settings(api_key=api_key, folder_id=folder_id)


def check_query(query: str) -> str:
    """The query without outer spaces, or QueryRejected when it is empty or breaks the limits of Yandex."""
    text = query.strip()
    if not text:
        raise QueryRejected("пустой запрос к поиску.")
    if len(text) > MAX_QUERY_CHARS or len(text.split()) > MAX_QUERY_WORDS:
        raise QueryRejected(
            f"запрос длиннее {MAX_QUERY_CHARS} знаков или {MAX_QUERY_WORDS} слов; "
            "напиши короткий запрос своими словами."
        )
    return text


def _body(query: str, folder_id: str) -> dict[str, object]:
    return {
        "query": {"searchType": "SEARCH_TYPE_RU", "queryText": query},
        "groupSpec": {"groupMode": "GROUP_MODE_FLAT", "groupsOnPage": str(RESULTS), "docsInGroup": "1"},
        "maxPassages": str(PASSAGES),
        "region": REGION_RUSSIA,
        "l10n": "LOCALIZATION_RU",
        "folderId": folder_id,
        "responseFormat": "FORMAT_XML",
    }


def _failed(reason: str) -> WebSearchFailed:
    log.error("Yandex Search API failed: %s", reason)
    return WebSearchFailed(reason)


def _text(element: ET.Element | None) -> str:
    """Text of an element with the highlighting `hlword` flattened."""
    return "" if element is None else " ".join("".join(element.itertext()).split())


def parse(xml: bytes) -> list[Result]:
    """Results of the XML answer of Yandex; an empty list when nothing was found."""
    try:
        root = ET.fromstring(xml)
    except ET.ParseError as error:
        raise _failed(f"answer is not XML ({error})") from error
    response = root.find("response")
    if root.tag != "yandexsearch" or response is None:
        raise _failed("answer has no yandexsearch/response")
    refusal = response.find("error")
    if refusal is not None:
        code = refusal.get("code")
        if code == NOTHING_FOUND_CODE:
            return []
        raise _failed(f"Yandex error code {code}")
    grouping = response.find("results/grouping")
    if grouping is None:
        raise _failed("answer has neither results nor error")
    results = []
    for doc in grouping.iterfind("group/doc"):
        url = _text(doc.find("url"))
        if not url:
            raise _failed("a result has no url")
        passages = tuple(_text(p) for p in doc.iterfind("passages/passage") if _text(p))
        headline = _text(doc.find("headline"))
        results.append(
            Result(title=_text(doc.find("title")), url=url, passages=passages or ((headline,) if headline else ()))
        )
    return results[:RESULTS]


def search(query: str, client: httpx.Client) -> list[Result]:
    """One synchronous search of Yandex for a checked query (check_query), at most one request a second per process.

    A 429 of Yandex is a failure like any other: there is no second request.
    """
    global _last_request
    config = settings()
    with _quota_lock:
        if _last_request is not None:
            wait = MIN_INTERVAL_SECONDS - (time.monotonic() - _last_request)
            if wait > 0:
                time.sleep(wait)
        try:
            answer = client.post(
                URL,
                json=_body(query, config.folder_id),
                headers={"Authorization": f"Api-Key {config.api_key}"},
                timeout=TIMEOUT_SECONDS,
            )
        except httpx.HTTPError as error:
            raise _failed(f"request failed: {type(error).__name__}") from error
        finally:
            _last_request = time.monotonic()
    if answer.status_code != 200:
        raise _failed(f"HTTP {answer.status_code}")
    try:
        raw = answer.json()["rawData"]
        xml = base64.b64decode(raw, validate=True)
    except (ValueError, KeyError, TypeError, binascii.Error) as error:
        raise _failed(f"answer has no rawData in Base64 ({type(error).__name__})") from error
    return parse(xml)


def for_model(query: str, results: list[Result]) -> str:
    """The answer of the tool: numbered results with addresses and passages, or that nothing was found."""
    if not results:
        return f"{NOTHING_FOUND} «{query}»; не выдавай сведения по памяти за найденные."
    out = [f"{FOUND_HEADER} «{query}»:"]
    for number, result in enumerate(results, start=1):
        out.append(f"\n{number}. {result.title or result.url}\n{result.url}")
        out.extend(f"— {passage}" for passage in result.passages)
    out.append(
        "\nЭто отрывки, а не страницы целиком. Опирайся только на них и дай автору ссылки на страницы, "
        "по которым сделал вывод."
    )
    return "\n".join(out)
