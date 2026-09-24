// Per-catalog data outside KATnnn: paint and trim, graphic navigation pictures, and helpers that
// relate catalogs to models.
import { dump, perDump, type Model } from "./dump";
import type { Rec } from "./format/records";
import { decodeZgd, type NavPicture } from "./format/zgd";
import { loadWhole } from "./tables";
import { stripQ } from "./text";

/* ---------------- paint and trim ---------------- */

export interface PaintData {
  /** Exterior paints per catalog. */
  vg: Rec[];
  /** Interior colours per catalog. */
  vf: Rec[];
  /** Paint products per paint number. */
  lacke: Rec[];
}
const paintByMarket = perDump(() => new Map<string, Promise<PaintData>>());
export function paintData(market: string): Promise<PaintData> {
  const cache = paintByMarket();
  let p = cache.get(market);
  if (!p) {
    p = (async () => {
      const dir = await dump().catalogDir(market);
      if (!dir) return { vg: [], vf: [], lacke: [] };
      const [vg, vf, lacke] = await Promise.all([
        loadWhole(dir, "vg.fdt", "VG.BIN"),
        loadWhole(dir, "vf.fdt", "VF.BIN"),
        loadWhole(dir, "Lacke.fdt", "LACKE.BIN"),
      ]);
      return { vg, vf, lacke };
    })();
    cache.set(market, p);
  }
  return p;
}

/* ---------------- graphic navigation ---------------- */

export interface NavRef {
  type: string;
  ref: string;
  pr: string[];
}
/** Several vehicle types often share one picture set (e.g. 8W5, 8WD, 8WH, 8WJ). */
export interface NavGroup {
  ref: string;
  pr: string[];
  types: string[];
}
export const navGroupKey = (g: NavGroup) => g.ref + (g.pr.length ? ":" + g.pr.join("+") : "");

const navRefTable = perDump((d) => loadWhole(d.data, "10.fdt", "10.BIN"));
export async function navRefs(kat: string | number): Promise<NavRef[]> {
  return (await navRefTable())
    .filter((r) => String(r.AA) === String(+kat) && r.AC)
    .map((r) => ({ type: (r.AB || "").trim(), ref: r.AC.trim(), pr: (r.AD || []).map(stripQ) }));
}
export function navGroups(refs: NavRef[]): NavGroup[] {
  const groups: NavGroup[] = [];
  for (const r of refs) {
    let g = groups.find((x) => x.ref === r.ref && x.pr.join() === r.pr.join());
    if (!g) {
      g = { ref: r.ref, pr: r.pr, types: [] };
      groups.push(g);
    }
    if (!g.types.includes(r.type)) g.types.push(r.type);
  }
  return groups;
}

const navPictures = perDump(() => new Map<string, Promise<NavPicture | null>>());
/** Navigation picture `view` (1-4) of a picture set; null when it is not in the dump. */
export function navPicture(ref: string, view: string): Promise<NavPicture | null> {
  const cache = navPictures();
  const key = ref + view;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      const brand = dump().brandDir;
      const dir = brand && (await brand.dir("Categories"));
      const f = dir && (await dir.file(`${ref}${view}.zgd`));
      return f ? decodeZgd(new Uint8Array(await f.arrayBuffer())) : null;
    })();
    cache.set(key, p);
    if (cache.size > 8) cache.delete(cache.keys().next().value!);
  }
  return p;
}

/* ---------------- catalogs and models ---------------- */

export interface ModelSpan {
  model: Model;
  from: number;
  to: number;
}
/**
 * Models that contain catalog `kat`, with the year range they cover. Prefers the given market;
 * catalogs shared across markets fall back to any market's model.
 */
export function modelsForCatalog(market: string, kat: number): ModelSpan[] {
  const collect = (pred: (m: Model) => boolean) => {
    const out: ModelSpan[] = [];
    for (const m of dump().models) {
      if (!pred(m)) continue;
      const years = m.catalogs.filter((c) => c.kat === kat).map((c) => c.year);
      if (years.length) out.push({ model: m, from: Math.min(...years), to: Math.max(...years) });
    }
    return out;
  };
  const here = collect((m) => m.market === market);
  return here.length ? here : collect(() => true);
}
