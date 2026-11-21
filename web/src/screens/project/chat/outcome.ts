// The result of a changing call of the co-author, as the chat shows it under the call
// (openspec/specs/web/workspace, «Сделанное соавтором в чате»). Agno 3.1.10 sends every tool
// result over AG-UI as JSON (`to_json_str`, agno/os/interfaces/agui/utils.py): the tools'
// `{"done", "target"}` as it is, a refusal of the core («Отказ: …») as a JSON string. No runtime
// imports here: `npm run check:chat` runs this in Node.

// `project` comes with a new draft, `draft` with a new story (a file of the conversation imported by
// the co-author, openspec/specs/api/agents, «Новый драфт из файла беседы», «Новая история из файла
// беседы»): both open outside the draft of the conversation.
export type Target = {
  type: string;
  id: string;
  kind?: string;
  project?: string;
  draft?: string;
};

/** The screenplay of a new draft or of the first draft of a new story; null for a target inside the draft. */
export function outsidePath(target: Target): string | null {
  if (!complete(target))
    throw new Error(
      `The target ${target.type} ${target.id} does not name where it opens`,
    );
  if (target.type === "draft")
    return `/p/${String(target.project)}/d/${target.id}/text`;
  if (target.type === "project")
    return `/p/${target.id}/d/${String(target.draft)}/text`;
  return null;
}

// A target that opens outside the draft must name where: the story of a draft, the draft of a story.
function complete(target: Target): boolean {
  if (target.type === "draft") return typeof target.project === "string";
  if (target.type === "project") return typeof target.draft === "string";
  return true;
}

export type Outcome =
  | { kind: "done"; done: string; target: Target }
  | { kind: "refused"; text: string }
  | { kind: "unreadable" };

export function readOutcome(content: string): Outcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Agno sends only JSON: anything else is a result the chat cannot read.
    return { kind: "unreadable" };
  }
  if (typeof parsed === "string") return { kind: "refused", text: parsed };
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    const { done, target } = parsed as { done?: unknown; target?: unknown };
    if (
      typeof done === "string" &&
      typeof target === "object" &&
      target !== null &&
      typeof (target as Target).type === "string" &&
      typeof (target as Target).id === "string" &&
      complete(target as Target)
    )
      return { kind: "done", done, target: target as Target };
  }
  return { kind: "unreadable" };
}
