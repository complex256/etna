// One IntersectionObserver for everything that loads when scrolled near the view.
const callbacks = new WeakMap<Element, () => void>();
let observer: IntersectionObserver | null = null;

/** Calls `cb` once, when `el` comes within 200px of the view. */
export function onVisible(el: Element, cb: () => void) {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        observer!.unobserve(en.target);
        const fn = callbacks.get(en.target);
        callbacks.delete(en.target);
        fn?.();
      }
    },
    { rootMargin: "200px" },
  );
  callbacks.set(el, cb);
  observer.observe(el);
}
export function stopVisible(el: Element) {
  callbacks.delete(el);
  observer?.unobserve(el);
}
