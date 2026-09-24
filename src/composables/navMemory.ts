// Where an illustration was opened from (list, search, graphic navigation…), for its Back button.
// Moving between illustrations with Prev/Next keeps the original origin.
import { locationToState, router, type AppState } from "../router";

let origin: { path: string; state: AppState } | null = null;
/** Illustration to scroll to when the list it was opened from shows again. */
let returnTo: string | null = null;

router.afterEach((to, from) => {
  const next = locationToState(to);
  const prev = locationToState(from);
  if (next.plate && !prev.plate && from.matched.length)
    origin = { path: from.fullPath, state: prev };
});

export const navMemory = {
  get origin() {
    return origin;
  },
  setReturnTo(key: string) {
    returnTo = key;
  },
  /** Takes the illustration to highlight in a list (once). */
  takeReturnTo() {
    const k = returnTo;
    returnTo = null;
    return k;
  },
};

// Holds app-wide state: a hot update would create a second copy of it, so reload instead.
import.meta.hot?.accept(() => location.reload());
