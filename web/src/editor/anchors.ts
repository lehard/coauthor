// Places of co-author suggestions and comments by their anchor (openspec/specs/web/workspace,
// «Предложение по якорю», «Комментарий соавтора по якорю»; design of story-data-web, decision 5):
// the co-author names a scene by its `uid` and the exact words; the text screen puts the
// `suggestion` or `comment` mark there. No DOM here: check:editor runs these in Node.
import type { Node } from "prosemirror-model";
import type { Transform } from "prosemirror-transform";

import { commentRanges } from "./plugins/comments.ts";
import { suggestionRanges } from "./plugins/suggestions.ts";
import { schema } from "./schema/index.ts";

export type SuggestionAnchor = { id: string; sceneUid: string; quote: string };

/** Where a suggestion of paragraphs goes (openspec/specs/api/review, «Поля места предложения»). */
export type BlockPlace =
  | "replace"
  | "after"
  | "scene_end"
  | "scene_body"
  | "script_start"
  | "script_end";

/**
 * A suggestion of typed paragraphs (design of coauthor-typed-suggestions, decision 5): no mark in
 * the text, its place is found by the anchor. `type` is checked when the paragraphs are made.
 */
export type BlockSuggestion = {
  place: BlockPlace;
  sceneUid: string | null;
  quote: string | null;
  paragraphs: { type: string; text: string }[];
};

/**
 * The place of a suggestion of paragraphs in `doc` (positions between top-level paragraphs): the
 * paragraphs it replaces, or an empty range where it inserts; null without its scene or quote.
 * A scene is its heading and the paragraphs up to the next heading, group or act, as for
 * `findAnchor`; the quote is the first match inside one paragraph of the scene.
 */
export function findBlockPlace(
  doc: Node,
  block: BlockSuggestion,
): { from: number; to: number } | null {
  if (block.place === "script_start") return { from: 0, to: 0 };
  const end = doc.content.size;
  if (block.place === "script_end") return { from: end, to: end };
  let inScene = false;
  let heading: { from: number; to: number } | null = null;
  let sceneEnd: number | null = null;
  let paragraph: { from: number; to: number } | null = null;
  doc.forEach((node, offset) => {
    const type = node.type.name;
    const closes =
      type === "sceneHeading" || type === "act" || type === "sequence";
    if (closes && inScene && sceneEnd === null) sceneEnd = offset;
    if (type === "sceneHeading") {
      inScene = node.attrs.uid === block.sceneUid;
      if (inScene && heading === null)
        heading = { from: offset, to: offset + node.nodeSize };
    } else if (closes) inScene = false;
    if (
      !inScene ||
      paragraph !== null ||
      block.quote === null ||
      block.quote === "" ||
      !node.isTextblock ||
      !node.textContent.includes(block.quote)
    )
      return;
    paragraph = { from: offset, to: offset + node.nodeSize };
  });
  const found = heading as { from: number; to: number } | null;
  if (found === null) return null;
  const last = (sceneEnd as number | null) ?? end;
  const hit = paragraph as { from: number; to: number } | null;
  switch (block.place) {
    case "replace":
      return hit;
    case "after":
      return hit === null ? null : { from: hit.to, to: hit.to };
    case "scene_end":
      return { from: last, to: last };
    case "scene_body":
      return { from: found.to, to: last };
  }
}

/**
 * The first match of `quote` inside one paragraph of the scene with `sceneUid` (its heading and
 * the text up to the next heading, group or act); null without the scene or the words.
 */
export function findAnchor(
  doc: Node,
  sceneUid: string,
  quote: string,
): { from: number; to: number } | null {
  if (quote === "") return null;
  let inScene = false;
  let found: { from: number; to: number } | null = null;
  doc.forEach((node, offset) => {
    if (found !== null) return;
    const type = node.type.name;
    if (type === "sceneHeading") inScene = node.attrs.uid === sceneUid;
    else if (type === "act" || type === "sequence") inScene = false;
    if (!inScene || !node.isTextblock) return;
    // Paragraphs hold text only, so a character offset is a position offset.
    const at = node.textContent.indexOf(quote);
    if (at >= 0)
      found = { from: offset + 1 + at, to: offset + 1 + at + quote.length };
  });
  return found;
}

/**
 * Marks the place of every anchor that has no mark in the text yet, in `tr`; returns the ids of
 * anchors without a place: no scene, no words, or words another suggestion already covers.
 */
export function placeAnchors(
  tr: Transform,
  anchors: SuggestionAnchor[],
): string[] {
  const missing: string[] = [];
  for (const a of anchors) {
    if (suggestionRanges(tr.doc, a.id).length > 0) continue;
    const place = findAnchor(tr.doc, a.sceneUid, a.quote);
    if (
      place === null ||
      tr.doc.rangeHasMark(place.from, place.to, schema.marks.suggestion)
    ) {
      missing.push(a.id);
      continue;
    }
    tr.addMark(
      place.from,
      place.to,
      schema.marks.suggestion.create({ id: a.id }),
    );
  }
  return missing;
}

/**
 * Marks the place of every comment anchor that has no mark in the text yet, in `tr`; returns the
 * ids without a place (no scene or no words). Comments may cover the same words as others.
 */
export function placeCommentAnchors(
  tr: Transform,
  anchors: SuggestionAnchor[],
): string[] {
  const missing: string[] = [];
  for (const a of anchors) {
    if (commentRanges(tr.doc, a.id).length > 0) continue;
    const place = findAnchor(tr.doc, a.sceneUid, a.quote);
    if (place === null) {
      missing.push(a.id);
      continue;
    }
    tr.addMark(place.from, place.to, schema.marks.comment.create({ id: a.id }));
  }
  return missing;
}
