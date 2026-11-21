"""One request of the measurement of actions through the real co-author, applied by the core (design, decision 5).

The core copies the open draft of the demo story for the request (`create_draft`); the conversation names the copy,
so the co-author works only there. The agent is the registered `coauthor` with its sessions in memory, run as the
user of the measurement of actions. Every pause is confirmed, as the chat does in the mode `auto`, and the run goes
on to the co-author's answer. The notes of a story are shared by its drafts, so before every request they are brought
back to the demo state (spec «Заметки истории перед просьбой»). What changed is read from the core before and after:
cards of the copy, notes of the story, comments and suggestions of the copy, and the documents of the open draft,
which must stay as they were. A request with a file attaches it to the conversation as the chat does: a file of
the conversation, its id and name in the context of the turn and «Файлы: <имя>» under the message; the new drafts
of the story are read after the run.
"""

import json
import time
import uuid
from dataclasses import dataclass

from agno.run.authorization import authorization_scope
from agno.run.base import RunStatus

from agents.coauthor import coauthor
from billing import ModelPrice
from core import notes, review, texts
from core.documents import list_documents
from core.drafts import list_drafts
from core.engine import get_engine
from core.files import upload_file
from evals.coauthor.actions import FILES_DIR, ActionRun, Card, Changes, NewDraft, Request, Suggested, paragraphs_of
from evals.coauthor.demo_notes import demo_notes, restore_notes
from evals.coauthor.run import caller, calls_of, chat_context, session_db, usage_of
from evals.coauthor.user import EvalUser, Place, fresh_draft

# A run that keeps pausing after this many confirmations is a failed request, not an endless loop (spec
# «Подтверждение действий в замере»).
MAX_CONTINUATIONS = 6
# How the chat names the files of a message for the co-author (web/src/screens/project/chat/CoauthorChat.tsx).
FILES_CONTEXT = "Файлы этого сообщения (id и имя)"


@dataclass(frozen=True)
class Snapshot:
    cards: dict[uuid.UUID, tuple[int, Card]]  # documents of the copy: revision and state
    notes: dict[uuid.UUID, tuple[int, str, str]]  # notes of the story: revision, title and text
    comments: int
    suggestions: int
    suggested: dict[uuid.UUID, Suggested]  # suggestions of the copy: place and paragraph types
    open_draft: dict[uuid.UUID, tuple[int, str]]  # documents of the open draft: revision and name
    text_revision: int  # the screenplay of the copy
    drafts: dict[uuid.UUID, NewDraft]  # drafts of the story with their screenplays


def snapshot(project_id: uuid.UUID, draft_id: uuid.UUID, open_draft_id: uuid.UUID) -> Snapshot:
    with get_engine().connect() as connection:
        cards = {
            document.id: (
                document.revision,
                Card(str(document.id), document.kind, document.name, document.role, document.summary, document.fields),
            )
            for document in list_documents(connection, draft_id)
            if document.deleted_at is None
        }
        screenplay = texts.screenplay_id(connection, draft_id)
        suggested = review.list_suggestions(connection, screenplay, None)
        return Snapshot(
            cards,
            {note.id: (note.revision, note.title, note.body) for note in notes.list_notes(connection, project_id)},
            len(review.list_threads(connection, screenplay)),
            len(suggested),
            {
                s.id: Suggested(
                    s.place,
                    tuple(p.type for p in s.paragraphs or ()),
                    tuple((p.type, p.text) for p in s.paragraphs or ()),
                )
                for s in suggested
            },
            {document.id: (document.revision, document.name) for document in list_documents(connection, open_draft_id)},
            texts.get_text(connection, screenplay).revision,
            {
                draft.id: NewDraft(
                    draft.name,
                    paragraphs_of(texts.get_text(connection, texts.screenplay_id(connection, draft.id)).content),
                )
                for draft in list_drafts(connection, project_id)
                if draft.deleted_at is None
            },
        )


def diff(before: Snapshot, after: Snapshot) -> Changes:
    return Changes(
        created=tuple(card for key, (_, card) in after.cards.items() if key not in before.cards),
        updated=tuple(
            (before.cards[key][1].name, card)
            for key, (revision, card) in after.cards.items()
            if key in before.cards and before.cards[key][0] != revision
        ),
        notes_created=tuple(title for key, (_, title, _) in after.notes.items() if key not in before.notes),
        notes_created_text=tuple(body for key, (_, _, body) in after.notes.items() if key not in before.notes),
        notes_updated=tuple(
            before.notes[key][1]
            for key, (revision, _, _) in after.notes.items()
            if key in before.notes and before.notes[key][0] != revision
        ),
        comments=after.comments - before.comments,
        suggestions=after.suggestions - before.suggestions,
        suggested=tuple(made for key, made in after.suggested.items() if key not in before.suggested),
        open_draft=tuple(
            name
            for key, (revision, name) in after.open_draft.items()
            if before.open_draft.get(key, (None, ""))[0] != revision
        ),
        drafts=tuple(made for key, made in after.drafts.items() if key not in before.drafts),
        text_changed=after.text_revision != before.text_revision,
    )


async def run_request(
    request: Request, place: Place, owner: uuid.UUID, user: EvalUser, model: str, price: ModelPrice
) -> ActionRun:
    open_draft_id = place.draft_id
    started = time.monotonic()
    with get_engine().begin() as connection:
        restore_notes(connection, place.project_id, demo_notes(place.title), owner)
    copy = fresh_draft(place, f"замер {request.id}", request.empty_text, owner)
    session_id = f"{copy.project_id}:{copy.draft_id}:{uuid.uuid4()}"
    context = chat_context(copy)
    message = request.message
    if request.file is not None:
        with get_engine().begin() as connection:
            stored = upload_file(
                connection,
                copy.project_id,
                owner,
                request.file,
                "chat",
                session_id,
                (FILES_DIR / request.file).read_bytes(),
            )
        context[FILES_CONTEXT] = json.dumps([{"id": str(stored.id), "name": stored.name}], ensure_ascii=False)
        message = f"{message}\n\nФайлы: {stored.name}"
    before = snapshot(copy.project_id, copy.draft_id, open_draft_id)
    agent = coauthor.deep_copy(update={"db": session_db(session_id, user.subject, None)})
    continuations = 0
    try:
        with authorization_scope(lambda: caller(user.subject)):
            output = await agent.arun(
                input=message,
                session_id=session_id,
                user_id=user.subject,
                dependencies=context,
                add_dependencies_to_context=True,
                stream=False,
            )
            while output.status == RunStatus.paused:
                continuations += 1
                if continuations > MAX_CONTINUATIONS:
                    raise RuntimeError(f"The run paused more than {MAX_CONTINUATIONS} times")
                requirements = output.active_requirements
                for requirement in requirements:
                    if not requirement.needs_confirmation or requirement.tool_execution is None:
                        raise RuntimeError(
                            f"The run paused on a requirement the measurement cannot answer: {requirement}"
                        )
                    requirement.confirm()
                output = await agent.acontinue_run(
                    run_response=output,
                    requirements=requirements,
                    session_id=session_id,
                    user_id=user.subject,
                    dependencies=context,
                    stream=False,
                )
    except Exception as error:
        # Recorded, not swallowed: the request is reported as a failed run with this text and what it changed
        # (spec «Проверки замера действий»).
        changes = diff(before, snapshot(copy.project_id, copy.draft_id, open_draft_id))
        seconds = time.monotonic() - started
        text = f"{type(error).__name__}: {error}"
        return ActionRun(request.id, "error", "", seconds, changes=changes, error=text, continuations=continuations)
    seconds = time.monotonic() - started
    changes = diff(before, snapshot(copy.project_id, copy.draft_id, open_draft_id))
    calls = calls_of(output, set())
    if output.status != RunStatus.completed:
        status = f"Run status {output.status}: {output.content}"
        return ActionRun(request.id, "error", "", seconds, calls, changes, error=status, continuations=continuations)
    answer = output.content if isinstance(output.content, str) else ""
    usage = usage_of(output, model, price)
    return ActionRun(request.id, "done", answer, seconds, calls, changes, usage, continuations=continuations)
