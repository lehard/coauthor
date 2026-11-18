import { useRef } from "react";

import { STORY_APPROACH } from "../content/copy";
import { useInView } from "../motion/hooks";

export function StoryApproach() {
  const ref = useRef<HTMLDivElement>(null);
  useInView(ref);

  return (
    <section
      aria-labelledby="story-approach-title"
      className="bg-panel px-4 py-16 sm:px-6 sm:py-24"
    >
      <div
        ref={ref}
        data-reveal
        className="mx-auto grid w-full max-w-6xl items-start gap-8 lg:grid-cols-[2fr_3fr] lg:gap-16"
      >
        <div className="flex flex-col gap-4">
          <p className="w-fit rounded-full bg-muted px-3 py-1 caption-1 text-muted-foreground ring-1 ring-border">
            {STORY_APPROACH.badge}
          </p>
          <h2 id="story-approach-title" className="heading-2 text-foreground">
            {STORY_APPROACH.title}
          </h2>
          <p className="max-w-sm body-6 text-muted-foreground">
            {STORY_APPROACH.notYet}
          </p>
        </div>
        <div className="flex max-w-[65ch] flex-col gap-5 body-lg text-foreground">
          {STORY_APPROACH.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </div>
    </section>
  );
}
