import { Section } from "../components/ui";
import { ANSWERS } from "../content/demo";

export function Sandbox() {
  return (
    <Section labelledBy="sandbox-title" className="bg-panel">
      <div className="grid gap-6 lg:grid-cols-[2fr_3fr] lg:gap-14">
        <div>
          <h2 id="sandbox-title" className="heading-2">
            Спросите о своём сценарии
          </h2>
          <p className="mt-4 body-6 text-muted-foreground">
            Примеры ответов по демо-истории «Тихая вода».
          </p>
        </div>
        <div className="divide-y divide-border border-y border-border">
          {ANSWERS.map(({ question, answer }) => (
            <details key={question} className="group py-1">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 title-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                {question}
                <span
                  aria-hidden="true"
                  className="text-ai group-open:rotate-45"
                >
                  ＋
                </span>
              </summary>
              <p className="mb-5 max-w-prose border-l-2 border-ai-border pl-4 body-3">
                {answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}
