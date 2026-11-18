import { useRef } from "react";

import {
  ANSWER_CAPTION,
  ANSWERS,
  type Line,
  type Segment,
} from "../content/demo";
import { useInView } from "../motion/hooks";

// «Спросите о своём сценарии» (openspec/specs/web/site, «Вопросы автора о своём сценарии»; design D5): three
// radios before the questions and the panels, the panel of the checked one shown by CSS, so the questions switch
// from the keyboard and without JavaScript. The checked question lives in Home: the ready questions of the first
// screen choose it too.

const LINE_CLASS: Record<Line["kind"], string> = {
  char: "sc-char",
  paren: "sc-paren",
  dialogue: "sc-dialogue",
  action: "",
  fact: "ex-fact",
};

function Run({ segment }: { segment: Segment }) {
  if (typeof segment === "string") return segment;
  if ("mark" in segment) return <mark>{segment.mark}</mark>;
  return <s>{segment.strike}</s>;
}

function SheetLine({ line }: { line: Line }) {
  const className = [
    LINE_CLASS[line.kind],
    line.gap ? "gap" : "",
    line.hit ? "hit" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <p className={className || undefined}>
      {line.text.map((segment, index) => (
        <Run key={index} segment={segment} />
      ))}
    </p>
  );
}

export function Sandbox({
  selected,
  onSelect,
}: {
  selected: number;
  onSelect: (question: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useInView(ref);
  return (
    <section
      id="ask"
      aria-labelledby="sandbox-title"
      className="sec sec-panel scroll-mt-6"
    >
      <div ref={ref} className="wrap" data-reveal>
        <div className="sec-head sec-head-row">
          <h2 className="h2" id="sandbox-title">
            Спросите о своём сценарии
          </h2>
          <p className="small muted">
            Примеры ответов по демо-истории «Тихая вода».
          </p>
        </div>
        <div className="ask-ui">
          {ANSWERS.map(({ question }, index) => (
            <input
              key={question}
              className="sr-only"
              type="radio"
              name="ask"
              id={`ask-${index + 1}`}
              checked={selected === index + 1}
              onChange={() => onSelect(index + 1)}
            />
          ))}
          <div className="ask-tabs">
            {ANSWERS.map(({ question }, index) => (
              <label
                key={question}
                className="ask-q"
                htmlFor={`ask-${index + 1}`}
              >
                {question}
              </label>
            ))}
          </div>
          <div className="ask-stage">
            {ANSWERS.map(({ question, answer, sheet }, index) => (
              <div key={question} className="ask-panel" data-q={index + 1}>
                <div className="ask-sheet script">
                  {sheet.map((excerpt) => (
                    <div key={excerpt.meta} className="ex">
                      <p className="ex-meta small">{excerpt.meta}</p>
                      {excerpt.lines.map((line, lineIndex) => (
                        <SheetLine key={lineIndex} line={line} />
                      ))}
                    </div>
                  ))}
                </div>
                <div className="ask-answer">
                  <p className="who who-ai">Соавтор</p>
                  <p className="answer">{answer}</p>
                  <p className="eg small muted">{ANSWER_CAPTION}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
