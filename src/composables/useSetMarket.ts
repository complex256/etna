import { pref } from "../lib/storage";
import { appState, go } from "../router";
import { useSession } from "../stores/session";

/**
 * Switching market keeps search-type pages; otherwise it returns to the vehicle list, keeping the
 * model when the new market has one with the same code (catalog numbers can differ by market).
 */
export function useSetMarket() {
  const session = useSession();
  return (m: string) => {
    const s = appState.value;
    if (!m || m === s.market) return;
    pref.set("market", m);
    if (s.q || s.list || s.ts || s.codes) return go({ market: m, part: null });
    const keepModel = s.model && session.dump?.model(m, s.model) ? s.model : null;
    return go({
      market: m,
      model: keepModel,
      year: null,
      kat: null,
      hg: null,
      plate: null,
      nav: null,
      navref: null,
      paint: null,
      equip: null,
      part: null,
    });
  };
}
