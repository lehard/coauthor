import { useEffect, useRef, type CSSProperties } from "react";

import { EPIGRAPH, TEAM_NOTE } from "../content/copy";
import { observeOnce, useInView } from "../motion/hooks";

// «Зачем мы делаем Соавтора» (openspec/specs/web/site, «Обращение команды»; design D12): the first sentence is the
// opening line, the epigraph a quotation, the last sentence stands on a card in the theme «Вечер у лампы» and its
// words light up one after another, once, when the card has risen into the upper three quarters of the screen.

export function TeamNote() {
  const ref = useRef<HTMLDivElement>(null);
  const screen = useRef<HTMLDivElement>(null);
  const credo = useRef<HTMLParagraphElement>(null);
  useInView(ref);
  useInView(screen);
  useEffect(() => {
    const element = credo.current;
    if (element === null)
      throw new Error("TeamNote: the last sentence is not mounted");
    return observeOnce(
      [element],
      { threshold: 0.6, rootMargin: "0px 0px -25% 0px" },
      (target) => target.setAttribute("data-in", ""),
    );
  }, []);
  const words = TEAM_NOTE.credo.split(" ");
  return (
    <section aria-labelledby="team-note-title" className="sec sec-panel">
      <div className="wrap">
        <div ref={ref} data-reveal className="team-grid">
          <div className="team-head">
            <h2 className="h2" id="team-note-title">
              {TEAM_NOTE.title}
            </h2>
            <figure className="epigraph">
              <blockquote>«{EPIGRAPH.quote}»</blockquote>
              <figcaption>{EPIGRAPH.author}</figcaption>
            </figure>
          </div>
          <div className="letter">
            <p className="lead-line">{TEAM_NOTE.opening}</p>
            {TEAM_NOTE.paragraphs.map((paragraph) => (
              <p key={paragraph} className="letter-prose">
                {paragraph}
              </p>
            ))}
          </div>
        </div>
        <div ref={screen} data-reveal className="screen" data-theme="dark">
          <p ref={credo} className="credo">
            {words.map((word, index) => (
              <span key={index}>
                <span className="w" style={{ "--i": index } as CSSProperties}>
                  {word}
                </span>{" "}
              </span>
            ))}
          </p>
        </div>
      </div>
    </section>
  );
}
