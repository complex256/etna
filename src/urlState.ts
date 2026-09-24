// URLs <-> app state. The app thinks in one flat state (market, catalog, illustration, search, …)
// and navigates by patching it (`go({ plate: … })`); these functions map that state onto readable
// hash URLs such as #/USA/catalog/849/plate/85771?model=8W5&year=2018. No router instance here, so
// the mapping can be tested on its own.
import type {
  LocationQuery,
  LocationQueryRaw,
  RouteParamsGeneric,
  RouteRecordNameGeneric,
} from "vue-router";

export interface AppState {
  market: string | null;
  model: string | null;
  year: string | null;
  kat: string | null;
  /** Main group of the illustration list. */
  hg: string | null;
  /** Illustration key, without the trailing padding ("85771"). */
  plate: string | null;
  /** Graphic navigation view (1-4) and picture set. */
  nav: string | null;
  navref: string | null;
  paint: string | null;
  /** Equipment page: "1", or the selected option code. */
  equip: string | null;
  /** Description cross-reference: text id. */
  ts: string | null;
  /** Code register: "engine" or "gearbox", with a filter. */
  codes: string | null;
  code: string | null;
  q: string | null;
  list: string | null;
  /** Saved vehicles page. */
  garage: string | null;
  /** Part number shown in the side drawer. */
  part: string | null;
}
export type StatePatch = Partial<AppState>;

export const STATE_KEYS: (keyof AppState)[] = [
  "market",
  "model",
  "year",
  "kat",
  "hg",
  "plate",
  "nav",
  "navref",
  "paint",
  "equip",
  "ts",
  "codes",
  "code",
  "q",
  "list",
  "garage",
  "part",
];
const empty = (): AppState =>
  Object.fromEntries(STATE_KEYS.map((k) => [k, null])) as unknown as AppState;
const enc = encodeURIComponent;

type PathKeys = [string, (keyof AppState)[]];
/** The path of a state and the state keys it carries (same precedence as the pages). */
function pathOf(s: AppState): PathKeys {
  if (!s.market) return ["/", []];
  const m = `/${enc(s.market)}`;
  if (s.list) return [`${m}/parts-list`, ["list"]];
  if (s.garage) return [`${m}/garage`, ["garage"]];
  if (s.ts) return [`${m}/description/${enc(s.ts)}`, ["ts"]];
  if (s.codes) return [`${m}/codes/${enc(s.codes)}`, ["codes"]];
  if (s.q) return [`${m}/search`, []];
  if (!s.kat) return [m, []];
  const cat = `${m}/catalog/${enc(s.kat)}`;
  if (s.plate) return [`${cat}/plate/${enc(s.plate.trimEnd())}`, ["kat", "plate"]];
  if (s.nav) return [`${cat}/graphic/${enc(s.nav)}`, ["kat", "nav"]];
  if (s.paint) return [`${cat}/paint`, ["kat", "paint"]];
  if (s.equip)
    return [`${cat}/equipment${s.equip !== "1" ? `/${enc(s.equip)}` : ""}`, ["kat", "equip"]];
  return [cat, ["kat"]];
}

/** The URL for a state. Keys that are not part of the path go into the query. */
export function stateToLocation(s: AppState): { path: string; query: LocationQueryRaw } {
  const [path, keys] = pathOf(s);
  const used = new Set<keyof AppState>(["market", ...keys]);
  const query: LocationQueryRaw = {};
  for (const k of STATE_KEYS) if (!used.has(k) && s[k] != null && s[k] !== "") query[k] = s[k];
  return { path, query };
}

/** The state of a URL (the inverse of stateToLocation). */
/** The parts of a resolved route that carry state. */
export interface RouteLike {
  name?: RouteRecordNameGeneric | null;
  params: RouteParamsGeneric;
  query: LocationQuery;
}

export function locationToState(route: RouteLike): AppState {
  const s = empty();
  for (const k of STATE_KEYS) {
    const v = route.query[k];
    if (typeof v === "string" && v !== "") s[k] = v;
  }
  const p = route.params as Record<string, string | undefined>;
  if (p.market) s.market = p.market;
  if (p.kat) s.kat = p.kat;
  switch (route.name) {
    case "partsList":
      s.list = "1";
      break;
    case "garage":
      s.garage = "1";
      break;
    case "description":
      s.ts = p.ts ?? null;
      break;
    case "codes":
      s.codes = p.codes ?? null;
      break;
    case "plate":
      s.plate = p.plate ?? null;
      break;
    case "graphic":
      s.nav = p.nav ?? null;
      break;
    case "paint":
      s.paint = "1";
      break;
    case "equipment":
      s.equip = p.equip || "1";
      break;
  }
  if (s.plate) s.plate = s.plate.trimEnd();
  return s;
}
