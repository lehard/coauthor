import { LinkButton } from "../components/ui";
import { HERO } from "../content/copy";

export function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="px-4 pt-12 pb-16 sm:px-6 sm:py-20"
    >
      <div
        data-appear
        className="mx-auto grid max-w-6xl items-center gap-9 lg:grid-cols-[5fr_6fr] lg:gap-12"
      >
        <div>
          <h1
            id="hero-title"
            className="heading-1 leading-[1.04] tracking-tight"
          >
            {HERO.title}
          </h1>
          <p className="mt-6 max-w-lg body-lg text-muted-foreground">
            {HERO.lead}
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2">
            <LinkButton href="#beta" variant="primary">
              {HERO.primary}
            </LinkButton>
            <span className="body-6 text-muted-foreground">{HERO.note}</span>
          </div>
        </div>
        <figure className="min-w-0">
          <div className="overflow-hidden rounded-2xl border border-border bg-paper shadow-panel">
            <img
              src="/shots/suggestion-1440.webp"
              srcSet="/shots/suggestion-720.webp 720w, /shots/suggestion-1440.webp 1440w"
              sizes="(min-width: 640px) 1440px, 950px"
              width="1440"
              height="900"
              alt={HERO.alt}
              fetchPriority="high"
              className="editor-crop"
            />
          </div>
          <figcaption className="mt-3 body-6 text-muted-foreground">
            <span className="mb-1 block font-medium text-foreground sm:hidden">
              {HERO.mobileEdit}
            </span>
            {HERO.caption}
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
