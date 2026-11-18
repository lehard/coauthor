import { useRef } from "react";
import { Section } from "../components/ui";
import { GARAGE } from "../content/garage";

export function StoryApproach() {
  const breakdown = useRef<HTMLDetailsElement>(null);

  function revealNotes() {
    const details = breakdown.current;
    if (!details) throw new Error("StoryApproach: the scene notes are missing");
    details.open = true;
  }

  return (
    <Section labelledBy="story-approach-title" className="bg-desk">
      <div className="grid items-start gap-8 lg:grid-cols-[2fr_3fr] lg:gap-14">
        <div>
          <h2 id="story-approach-title" className="heading-2">
            {GARAGE.title}
          </h2>
          <p className="mt-5 max-w-prose body-lg text-muted-foreground">
            {GARAGE.lead}
          </p>
        </div>
        <article
          aria-label="Редакционный пример"
          className="rounded-2xl bg-paper p-5 shadow-panel ring-1 ring-border sm:p-8"
        >
          <p className="mb-6 caption-1 text-muted-foreground">
            Редакционный пример · Финал в гараже
          </p>
          <p className="caption-1 text-muted-foreground">Автор</p>
          <p className="mt-1 heading-5">{GARAGE.author}</p>
          <div className="my-6 border-l-2 border-ai-border pl-4">
            <p className="caption-1 text-ai">Соавтор</p>
            <p className="mt-1 body-3">
              {GARAGE.reply}{" "}
              <a
                href="#garage-key"
                onClick={revealNotes}
                className="text-ai underline decoration-dotted underline-offset-4 focus-visible:outline-ring"
              >
                {GARAGE.gesture}
              </a>
              .
            </p>
            <p className="mt-2 heading-5 text-ai">{GARAGE.line}</p>
          </div>
          <details ref={breakdown} className="group border-t border-border">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 pt-4 title-3 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
              {GARAGE.summary}
              <span aria-hidden="true" className="text-ai group-open:rotate-45">
                ＋
              </span>
            </summary>
            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              {GARAGE.notes.map((note) => (
                <div
                  key={note.id}
                  id={note.id}
                  tabIndex={-1}
                  className="scroll-mt-24 rounded-md border-l-2 border-ai-border px-3 py-2 target:bg-ai-subtle target:outline-2 target:outline-ai focus-visible:outline-ring"
                >
                  <dt className="caption-1 text-ai">{note.title}</dt>
                  <dd className="mt-1 body-6">{note.text}</dd>
                </div>
              ))}
            </dl>
          </details>
        </article>
      </div>
    </Section>
  );
}
