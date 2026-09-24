// The router, and navigation by state patches (see urlState.ts for the URL mapping).
import { computed } from "vue";
import { createRouter, createWebHashHistory } from "vue-router";
import { locationToState, stateToLocation, type StatePatch } from "./urlState";

export { locationToState, type AppState, type StatePatch } from "./urlState";

// Routes (and so the page components) are registered from main.ts: keeping the views out of this
// module avoids an import cycle, since every view imports it.
export const router = createRouter({ history: createWebHashHistory(), routes: [] });

/** Reactive app state of the current URL. */
export const appState = computed(() => locationToState(router.currentRoute.value));

/** Navigate by patching the current state (push, or replace for in-place changes). */
export function go(patch: StatePatch, replace = false) {
  const next = { ...appState.value, ...patch };
  const to = stateToLocation(next);
  return replace ? router.replace(to) : router.push(to);
}
/** The href of a state patch, for real links. */
export function hrefFor(patch: StatePatch) {
  return router.resolve(stateToLocation({ ...appState.value, ...patch })).href;
}

// Holds app-wide state: a hot update would create a second copy of it, so reload instead.
import.meta.hot?.accept(() => location.reload());
