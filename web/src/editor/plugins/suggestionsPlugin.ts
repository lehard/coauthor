import { Plugin, type EditorState } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

import type { BlockSuggestion } from "../anchors.ts";
import { elementClass, isElementName } from "../elements.ts";
import { suggestionRanges, suggestionsKey } from "./suggestions.ts";

// How open co-author suggestions look and open (coauthor-suggestions, decision 2): the old text
// struck through, the suggested text after it as a widget that cannot be edited. A suggestion of
// paragraphs strikes the paragraphs it replaces and shows its own as a block of typed paragraphs
// at its place (coauthor-typed-suggestions, decision 5).

function suggestedText(id: string, text: string, active: boolean) {
  const ins = document.createElement("ins");
  ins.className = active
    ? "pw-suggestion-ins pw-suggestion-active"
    : "pw-suggestion-ins";
  ins.dataset.suggestionId = id;
  ins.contentEditable = "false";
  ins.textContent = text;
  return ins;
}

function suggestedParagraphs(
  id: string,
  block: BlockSuggestion,
  active: boolean,
) {
  const box = document.createElement("div");
  box.className = active
    ? "pw-suggestion-block pw-suggestion-active"
    : "pw-suggestion-block";
  box.dataset.suggestionId = id;
  box.contentEditable = "false";
  for (const p of block.paragraphs) {
    if (!isElementName(p.type))
      throw new Error(`Неизвестный тип абзаца предложения: ${p.type}`);
    const el = document.createElement("p");
    el.className = elementClass(p.type);
    el.textContent = p.text;
    box.append(el);
  }
  return box;
}

/** The open suggestion under a clicked element, or null. */
function suggestionAt(
  target: EventTarget | null,
  root: HTMLElement,
  open: (id: string) => boolean,
) {
  let el = target instanceof Element ? target : null;
  while (el !== null && el !== root) {
    const id = el.getAttribute("data-suggestion-id");
    if (id !== null && open(id)) return id;
    el = el.parentElement;
  }
  return null;
}

export function suggestionsPlugin(onOpen: (id: string) => void): Plugin {
  return new Plugin({
    props: {
      decorations(state: EditorState) {
        const s = suggestionsKey.getState(state);
        if (s === undefined || (s.open.size === 0 && s.places.size === 0))
          return DecorationSet.empty;
        const decorations: Decoration[] = [];
        for (const [id, place] of s.places) {
          const block = s.blocks.get(id);
          if (block === undefined)
            throw new Error(`Нет предложения ${id} для его места`);
          const active = id === s.active;
          state.doc.nodesBetween(place.from, place.to, (node, pos) => {
            decorations.push(
              Decoration.node(pos, pos + node.nodeSize, {
                class: active
                  ? "pw-suggestion-del pw-suggestion-active"
                  : "pw-suggestion-del",
                "data-suggestion-id": id,
              }),
            );
            return false;
          });
          decorations.push(
            Decoration.widget(
              place.to,
              () => suggestedParagraphs(id, block, active),
              {
                // Before the gap of the card (-2) and a page break (-1) at the same place.
                side: -3,
                key: `${id}:${active}:${JSON.stringify(block.paragraphs)}`,
                ignoreSelection: true,
              },
            ),
          );
        }
        for (const [id, text] of s.open) {
          const ranges = suggestionRanges(state.doc, id);
          const active = id === s.active;
          for (const r of ranges) {
            decorations.push(
              Decoration.inline(r.from, r.to, {
                class: active
                  ? "pw-suggestion-del pw-suggestion-active"
                  : "pw-suggestion-del",
              }),
            );
          }
          const last = ranges.at(-1);
          if (last !== undefined && text !== "") {
            decorations.push(
              Decoration.widget(
                last.to,
                () => suggestedText(id, text, active),
                {
                  side: -1,
                  key: `${id}:${active}:${text}`,
                  ignoreSelection: true,
                },
              ),
            );
          }
        }
        return DecorationSet.create(state.doc, decorations);
      },
      handleClick(view, _pos, event) {
        const s = suggestionsKey.getState(view.state);
        if (s === undefined) return false;
        const id = suggestionAt(
          event.target,
          view.dom,
          (v) => s.open.has(v) || s.places.has(v),
        );
        if (id !== null) onOpen(id);
        return false;
      },
    },
  });
}
