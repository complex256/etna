import { appState } from "../router";
import type { PartSource } from "../stores/partsList";

/** The catalog page on screen, recorded with parts added to the list. */
export function currentSource(plate?: string | null): PartSource | null {
  const s = appState.value;
  if (!s.kat) return null;
  return { market: s.market, model: s.model, year: s.year, kat: s.kat, plate: plate ?? s.plate };
}
