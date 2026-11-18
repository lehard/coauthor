import { useRef } from "react";

import { EPIGRAPH, TEAM_NOTE } from "../content/copy";
import { useInView } from "../motion/hooks";

export function TeamNote() {
  const ref = useRef<HTMLDivElement>(null);
  useInView(ref);

  return (
    <section
      aria-labelledby="team-note-title"
      className="px-4 pt-16 sm:px-6 sm:pt-24"
    >
      <div
        ref={ref}
        data-reveal
        className="mx-auto flex w-full max-w-3xl flex-col gap-7 border-b border-border pb-16 sm:pb-24"
      >
        <h2 id="team-note-title" className="heading-2 text-foreground">
          {TEAM_NOTE.title}
        </h2>
        <figure className="border-l-2 border-ai-border pl-5">
          <blockquote className="body-lg text-muted-foreground italic">
            «{EPIGRAPH.quote}»
          </blockquote>
          <figcaption className="mt-2 caption-1 text-muted-foreground">
            {EPIGRAPH.author}
          </figcaption>
        </figure>
        <div className="flex max-w-[65ch] flex-col gap-5 body-lg text-foreground">
          {TEAM_NOTE.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </div>
    </section>
  );
}
