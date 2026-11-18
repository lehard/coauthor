import { useEffect, useRef } from "react";

import { observeOnce, useInView } from "../motion/hooks";

// «Продолжайте с того места, где остановились» (openspec/specs/web/site, «Продолжение работы со своим черновиком»;
// design D11): the screen of the beta, the file card above it and the arrow down onto the sheet. The card and the
// arrow are drawn without scripts; the scripts only play their appearance once.

const DRAFT = {
  title: "Продолжайте с того места, где остановились",
  lead: "Откройте свой файл в Соавторе. В редакторе появятся знакомые сцены. Можно сразу вернуться к нужной реплике или попробовать другой финал в отдельном драфте.",
  formats: "Импорт из Fountain, FDX, STARC, DOCX и TXT.",
  file: "Тихая вода.fdx",
  fileKind: "Final Draft · 7 сцен",
  alt: "Редактор Соавтора: слева документы истории и драфт, в центре текст сценария, справа чат Соавтора.",
  caption: "Экран беты. Сценарий «Тихая вода» в редакторе.",
};

export function DraftImport() {
  const ref = useRef<HTMLDivElement>(null);
  const picture = useRef<HTMLDivElement>(null);
  useInView(ref);
  useEffect(() => {
    const element = picture.current;
    if (element === null)
      throw new Error("DraftImport: the picture is not mounted");
    return observeOnce([element], { threshold: 0.35 }, (target) =>
      target.setAttribute("data-in", ""),
    );
  }, []);
  return (
    <section aria-labelledby="draft-title" className="sec draft">
      <div ref={ref} data-reveal className="wrap draft-grid">
        <div className="draft-copy">
          <h2 className="h2" id="draft-title">
            {DRAFT.title}
          </h2>
          <p className="body-lg">{DRAFT.lead}</p>
          <p className="small muted">{DRAFT.formats}</p>
        </div>
        <figure className="shot">
          <div className="shot-pic" ref={picture}>
            <div className="drop">
              <div className="file">
                <svg
                  width="32"
                  height="40"
                  viewBox="0 0 32 40"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M3 1h17l9 9v27a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2Z"
                    fill="var(--panel)"
                    stroke="var(--border-strong)"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M20 1v9h9"
                    stroke="var(--border-strong)"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M7 18h18M7 23h18M7 28h11"
                    stroke="var(--border-strong)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                <div>
                  <p className="file-name">{DRAFT.file}</p>
                  <p className="small muted">{DRAFT.fileKind}</p>
                </div>
              </div>
              <span className="drop-arrow" aria-hidden="true">
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  focusable="false"
                >
                  <path d="M0 0 C 62 0, 100 34, 100 100" />
                </svg>
              </span>
              <span className="drop-gap" aria-hidden="true" />
            </div>
            <div className="shot-frame">
              <img
                src="/shots/workspace-1440.webp"
                srcSet="/shots/workspace-720.webp 720w, /shots/workspace-1440.webp 1440w"
                sizes="(min-width: 1024px) 760px, 190vw"
                width={1440}
                height={900}
                loading="lazy"
                alt={DRAFT.alt}
              />
            </div>
          </div>
          <figcaption className="small muted shot-cap">
            {DRAFT.caption}
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
