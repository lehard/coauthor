import { useEffect, type RefObject } from "react";

// Motion of the site (openspec/specs/web/site, «Движение на сайте»; design D1–D2). Sections appear once when 30% is visible.

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Sets `data-in` on the element once it has been on screen; CSS uses it to reveal the section. */
export function useInView(
  ref: RefObject<HTMLElement | SVGElement | null>,
): void {
  useEffect(() => {
    const element = ref.current;
    if (element === null)
      throw new Error("useInView: the element is not mounted");
    if (prefersReducedMotion()) {
      element.setAttribute("data-in", "");
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          element.setAttribute("data-in", "");
          observer.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
}
