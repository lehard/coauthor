import { Fragment, type CSSProperties } from "react";

import { ANSWERS } from "../content/demo";
import { HERO, HERO_CHAT, HERO_SHEET } from "../content/copy";

// The first screen (openspec/specs/web/site, «Главная страница», «Раскладка первого экрана»; design D4): it only
// names the product. The editor is drawn in HTML: a whole A4 sheet with one marked line and the Co-author's chat
// beside it with the three ready questions of the next block.

const SHEET_CLASS = {
  heading: "sc-heading",
  action: "sc-action",
  char: "sc-char",
  paren: "sc-paren",
  dialogue: "sc-dialogue",
} as const;

const order = (index: number) => ({ "--i": index }) as CSSProperties;

function Toolbar() {
  return (
    <div className="ed-bar" aria-hidden="true">
      <span className="ic">
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5.5 3.5 2.5 6.5l3 3M2.5 6.5h7a3.5 3.5 0 0 1 0 7H7.5" />
        </svg>
      </span>
      <span className="ic">
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m10.5 3.5 3 3-3 3M13.5 6.5h-7a3.5 3.5 0 0 0 0 7h2" />
        </svg>
      </span>
      <span className="sep" />
      <span>Реплика</span>
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m3 4.5 3 3 3-3" />
      </svg>
      <span className="sep" />
      <span className="ic">
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <circle cx="7" cy="7" r="4.25" />
          <path d="m10.25 10.25 3.25 3.25" />
        </svg>
      </span>
      <span className="ed-fill" />
      <span className="count">
        <span className="dot" />2
      </span>
      <span className="count">
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        >
          <path d="M3 3.5h10v7.5H7.5L4.5 13.5V11H3z" />
        </svg>
        2
      </span>
    </div>
  );
}

function Sheet() {
  return (
    <div className="sheet script">
      {HERO_SHEET.map((line, index) => {
        const className = [
          SHEET_CLASS[line.kind],
          line.wide ? "sc-wide" : "",
          line.tail ? "sc-tail" : "",
          line.next ? "sc-next" : "",
        ]
          .filter(Boolean)
          .join(" ");
        const parts = line.text.split("\n");
        const text = parts.map((part, partIndex) => (
          <Fragment key={partIndex}>
            {partIndex > 0 ? <br /> : null}
            {part}
          </Fragment>
        ));
        return (
          <p key={index} className={className}>
            {line.lit ? <mark className="lit">{text}</mark> : text}
          </p>
        );
      })}
    </div>
  );
}

export function Hero({
  onAsk,
  ctaRef,
}: {
  onAsk: (question: number) => void;
  ctaRef: React.RefObject<HTMLAnchorElement | null>;
}) {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="wrap hero-grid">
        <div className="hero-copy">
          <h1 className="h1" id="hero-title" style={order(0)}>
            {HERO.title}
          </h1>
          <p className="muted hero-lead body-lg" style={order(1)}>
            {HERO.lead}
          </p>
          <div className="hero-cta" style={order(2)}>
            <a ref={ctaRef} className="btn btn-primary" href="#beta">
              {HERO.primary}
            </a>
            <span className="small muted">{HERO.note}</span>
          </div>
        </div>

        <figure className="stage" aria-label={HERO.label}>
          <div className="app">
            <div className="app-doc">
              <Toolbar />
              <Sheet />
            </div>
            <aside className="chat" aria-label={HERO_CHAT.label}>
              <div className="chat-head">
                <p className="chat-name">
                  <span className="dot" aria-hidden="true" />
                  {HERO_CHAT.name}
                </p>
                <p className="chat-sees">{HERO_CHAT.sees}</p>
              </div>
              <div className="chat-body">
                <p className="chat-title" style={order(0)}>
                  {HERO_CHAT.title}
                </p>
                <p className="chat-hint" style={order(1)}>
                  {HERO_CHAT.hint}
                </p>
                <ul className="co-qs">
                  {ANSWERS.map(({ question }, index) => (
                    <li key={question} style={order(index + 2)}>
                      <a
                        className="co-q"
                        href="#ask"
                        onClick={() => onAsk(index + 1)}
                      >
                        {question}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="co-input" aria-hidden="true">
                <span>{HERO_CHAT.input}</span>
                <span className="co-send">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M7 11.5v-9M3 6.5l4-4 4 4" />
                  </svg>
                </span>
              </div>
            </aside>
          </div>
          <figcaption className="ed-cap">{HERO.caption}</figcaption>
        </figure>
      </div>
    </section>
  );
}
