// Vehicle data (engine, gearbox, PR equipment codes) per catalog. Rows whose model data rules out
// the entered vehicle are dimmed or hidden, like the dealer catalog's vehicle data entry.
import type { Catalog, Plate } from "./dump";
import type { Rec } from "./format/records";
import { readJson, writeJson } from "./storage";
import type { PrInfo } from "./tables";
import { isPartRow, lines } from "./text";

export interface Sticker {
  vin: string;
  type: string;
  paint: string;
  trim: string;
  /** Equipment codes in entry order. */
  codes: string[];
}
export interface VehicleData {
  /** Engine code. */
  mkb: string;
  /** Gearbox codes, space separated (the sticker can list two). */
  gkb: string;
  /** PR family -> the vehicle's code in it. */
  pr: Record<string, string>;
  /** Hide rows that do not fit instead of dimming them. */
  hide: boolean;
  sticker: Sticker | null;
}
/** Vehicle data plus what applying it needs. */
export interface FilterContext {
  f: VehicleData;
  prInfo: PrInfo | null;
  active: boolean;
}

const key = (market: string, kat: string | number) => `etna.filter.${market}:${kat}`;
export const emptyVehicleData = (): VehicleData => ({
  mkb: "",
  gkb: "",
  pr: {},
  hide: false,
  sticker: null,
});

export function getVehicleData(market: string, kat: string | number): VehicleData {
  const v = readJson<Partial<VehicleData> | null>(key(market, kat), null);
  if (!v) return emptyVehicleData();
  return {
    mkb: v.mkb || "",
    gkb: v.gkb || "",
    pr: v.pr || {},
    hide: !!v.hide,
    sticker: v.sticker || null,
  };
}
export function setVehicleData(market: string, kat: string | number, f: VehicleData) {
  writeJson(key(market, kat), f);
}
export const vehicleDataCount = (f: VehicleData) =>
  (f.mkb ? 1 : 0) + (f.gkb ? 1 : 0) + Object.keys(f.pr).length;

/** False when the row's model data excludes this vehicle. */
export function rowMatches(r: Rec, f: VehicleData, prInfo: PrInfo | null): boolean {
  if (f.mkb && r.HG && r.HG.length && !r.HG.some((c: string) => c.trim() === f.mkb)) return false;
  // The sticker can list more than one gearbox-related code (e.g. "SNK SUZ"); any match counts.
  if (f.gkb && r.C3 && r.C3.length) {
    const want = f.gkb.split(/[\s,/]+/).filter(Boolean);
    if (!r.C3.some((c: string) => want.includes(c.trim()))) return false;
  }
  if (r.C0 && r.C0.length && prInfo) {
    const byFam = new Map<string, string[]>();
    for (const c of r.C0 as string[]) {
      const code = c.trim(),
        info = prInfo.code.get(code);
      if (!info || !info.family) continue;
      if (!byFam.has(info.family)) byFam.set(info.family, []);
      byFam.get(info.family)!.push(code);
    }
    for (const [fam, codes] of byFam) if (f.pr[fam] && !codes.includes(f.pr[fam])) return false;
  }
  return true;
}

/**
 * An illustration's own condition, from its header row's model data, e.g. "PR:GP1+ER1,ER2+QV3"
 * (',' = or, binding tighter than '+' = and) or engine codes such as "CVLA,DRXA". Lines ending in
 * ',' or '+' continue on the next line. Only terms decided by the vehicle data can rule a plate out.
 */
export function headerMatches(modelData: string[], f: VehicleData, prInfo: PrInfo | null): boolean {
  const md = modelData.map((l) => l.trim()).filter(Boolean);
  // "Diesel eng.+" also ends in '+', but only a code list carries on to the next line.
  const codeList = /^(PR:)?[0-9A-Z]{3,4}([+,][0-9A-Z]{3,4})*[+,]$/;
  const items: string[] = [];
  for (const l of md) {
    if (items.length && codeList.test(items[items.length - 1])) items[items.length - 1] += l;
    else items.push(l);
  }
  for (const item of items) {
    if (item.startsWith("PR:") && prInfo) {
      for (const group of item.slice(3).replace(/[+,]$/, "").split("+")) {
        const codes = group
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean);
        if (!codes.length) continue;
        const fams = codes.map((c) => prInfo.code.get(c)?.family);
        if (codes.some((c, i) => fams[i] && f.pr[fams[i]!] === c)) continue; // the vehicle has one of them
        if (fams.every((fam) => fam && f.pr[fam])) return false; // every family decided, none match
      }
    } else if (
      f.mkb &&
      /^[0-9A-Z]{4}(,[0-9A-Z]{4})*$/.test(item) &&
      !item.split(",").includes(f.mkb)
    )
      return false;
  }
  return true;
}

/**
 * An illustration fits the vehicle when its own condition does and at least one of its parts does
 * (or it lists none).
 */
export function plateFits(p: Plate, fc: FilterContext): boolean {
  if (!fc.active) return true;
  const head = p.rows.find((r) => r.AD === "U");
  if (head && !headerMatches(lines(head.DC, head.DG), fc.f, fc.prInfo)) return false;
  const parts = p.rows.filter(isPartRow);
  return !parts.length || parts.some((r) => rowMatches(r, fc.f, fc.prInfo));
}

export interface CodeSets {
  mkb: string[];
  gkb: string[];
  pr: string[];
}
const codeSets = new WeakMap<Catalog, CodeSets>();
/** Engine, gearbox and PR codes that occur in a catalog, for the entry form. */
export function codesIn(cat: Catalog): CodeSets {
  let s = codeSets.get(cat);
  if (!s) {
    const mkb = new Set<string>(),
      gkb = new Set<string>(),
      pr = new Set<string>();
    for (const p of cat.plates)
      for (const r of p.rows) {
        for (const c of r.HG || []) if (c.trim()) mkb.add(c.trim());
        for (const c of r.C3 || []) if (c.trim()) gkb.add(c.trim());
        for (const c of r.C0 || []) if (c.trim()) pr.add(c.trim());
      }
    s = { mkb: [...mkb].sort(), gkb: [...gkb].sort(), pr: [...pr].sort() };
    codeSets.set(cat, s);
  }
  return s;
}
