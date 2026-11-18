import { useRef } from "react";

import { FAQ } from "../content/copy";
import { useInView } from "../motion/hooks";

// Questions and answers (openspec/specs/web/site, «Вопросы и ответы списком»): native <details>, so they open from
// the keyboard and without JavaScript. They stand under the form, in the same grid (design D12).

export function Faq() {
  const ref = useRef<HTMLDivElement>(null);
  useInView(ref);
  return (
    <section aria-labelledby="faq-title" className="sec">
      <div ref={ref} data-reveal className="wrap faq-grid">
        <h2 id="faq-title" className="h3">
          {FAQ.title}
        </h2>
        <div className="faq">
          {FAQ.items.map((item) => (
            <details key={item.q} name="faq">
              <summary>
                {item.q}
                <span className="plus" aria-hidden="true" />
              </summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
