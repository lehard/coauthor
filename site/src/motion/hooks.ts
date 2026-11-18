import { useEffect, type RefObject } from "react";

// Motion of the site (openspec/specs/web/site, «Движение на сайте»; design D9). Things appear once, through
// IntersectionObserver; with «уменьшить движение» they are marked at once and CSS shows the end state.

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Calls `onIn` once for each element when it comes into view; returns the cleanup of the observer. */
export function observeOnce(
  elements: Element[],
  options: IntersectionObserverInit,
  onIn: (element: Element) => void,
): () => void {
  if (prefersReducedMotion()) {
    elements.forEach(onIn);
    return () => {};
  }
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      onIn(entry.target);
    }
  }, options);
  elements.forEach((element) => observer.observe(element));
  return () => observer.disconnect();
}

/** Sets `data-in` on the element once it has been on screen; CSS uses it to reveal the section. */
export function useInView(
  ref: RefObject<HTMLElement | SVGElement | null>,
): void {
  useEffect(() => {
    const element = ref.current;
    if (element === null)
      throw new Error("useInView: the element is not mounted");
    return observeOnce([element], { threshold: 0.3 }, (target) =>
      target.setAttribute("data-in", ""),
    );
  }, [ref]);
}

/** Sets `data-in` once on every `[data-reveal]` inside the element as each comes into view. */
export function useRevealInside(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = ref.current;
    if (root === null)
      throw new Error("useRevealInside: the element is not mounted");
    return observeOnce(
      [...root.querySelectorAll("[data-reveal]")],
      { threshold: 0.15 },
      (target) => target.setAttribute("data-in", ""),
    );
  }, [ref]);
}
