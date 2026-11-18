import { useEffect, useRef, useState } from "react";

import { DraftImport } from "../blocks/DraftImport";
import { Faq } from "../blocks/Faq";
import { Hero } from "../blocks/Hero";
import { Sandbox } from "../blocks/Sandbox";
import { StoryApproach } from "../blocks/StoryApproach";
import { TeamNote } from "../blocks/TeamNote";
import { BetaForm } from "../components/BetaForm";
import { BETA_FORM } from "../content/copy";
import { useInView } from "../motion/hooks";
import { APP_URL } from "../site";

// The main page (openspec/specs/web/site, «Главная страница»): blocks in the order of the spec.

function Signup() {
  const ref = useRef<HTMLDivElement>(null);
  useInView(ref);
  return (
    <section
      id="beta"
      aria-labelledby="beta-title"
      className="sec scroll-mt-18 pb-0!"
    >
      <div ref={ref} data-reveal className="wrap beta-grid">
        <div className="beta-copy">
          <h2 id="beta-title" className="h2">
            {BETA_FORM.title}
          </h2>
          <p className="muted body-lg">{BETA_FORM.lead}</p>
          <p className="small muted">
            {BETA_FORM.invited}{" "}
            <a
              className="text-primary underline underline-offset-2 hover:no-underline"
              href={APP_URL}
            >
              {BETA_FORM.signIn}
            </a>{" "}
            {BETA_FORM.invitedTail}
          </p>
        </div>
        <BetaForm />
      </div>
    </section>
  );
}

/** Marks the page with `cta-away` while the button of the first screen is off screen (design D10). */
function useHeaderCta(ref: React.RefObject<HTMLAnchorElement | null>) {
  useEffect(() => {
    const cta = ref.current;
    if (cta === null)
      throw new Error("Home: the first-screen button is not mounted");
    const root = document.documentElement;
    const observer = new IntersectionObserver(
      ([entry]) => root.classList.toggle("cta-away", !entry.isIntersecting),
      { rootMargin: "-72px 0px 0px 0px" },
    );
    observer.observe(cta);
    return () => {
      observer.disconnect();
      root.classList.remove("cta-away");
    };
  }, [ref]);
}

export function Home() {
  // The question open in «Спросите о своём сценарии»; the ready questions of the first screen choose it too.
  const [question, setQuestion] = useState(1);
  const cta = useRef<HTMLAnchorElement>(null);
  useHeaderCta(cta);
  return (
    <div className="lp">
      <Hero onAsk={setQuestion} ctaRef={cta} />
      <Sandbox selected={question} onSelect={setQuestion} />
      <StoryApproach />
      <DraftImport />
      <TeamNote />
      <Signup />
      <Faq />
    </div>
  );
}
