// Equipment (PR code) analysis for retrofits: for an option, compare the vehicle's current code in
// that family with the option. Uses the same fit rule as the vehicle-data filter.
import type { Catalog, Plate } from "./dump";
import type { Rec } from "./format/records";
import type { PrInfo } from "./tables";
import { rowMatches, type VehicleData } from "./vehicleFilter";

export interface RowHit {
  plate: Plate;
  row: Rec;
}

/** code -> every part row whose PR list mentions the code (cached per catalog). */
export function prIndex(cat: Catalog): Map<string, RowHit[]> {
  if (!cat.prIndex) {
    const m = new Map<string, RowHit[]>();
    for (const p of cat.plates)
      for (const r of p.rows) {
        if (!r.AC || !r.C0) continue;
        for (const c of r.C0 as string[]) {
          const code = c.trim();
          if (!code) continue;
          if (!m.has(code)) m.set(code, []);
          m.get(code)!.push({ plate: p, row: r });
        }
      }
    cat.prIndex = m;
  }
  return cat.prIndex;
}

/** Family id of a code; "—" for codes without a family. */
export const familyOf = (prInfo: PrInfo, c: string) => prInfo.code.get(c)?.family || "—";

export interface EquipmentFamily {
  fam: string;
  name: string;
  codes: { code: string; rows: number }[];
}
/** The catalog's option codes grouped by family, families by name ("Other codes" last). */
export function equipmentFamilies(index: Map<string, RowHit[]>, prInfo: PrInfo): EquipmentFamily[] {
  const families = new Map<string, { code: string; rows: number }[]>();
  for (const [code, rows] of index) {
    const fam = familyOf(prInfo, code);
    if (!families.has(fam)) families.set(fam, []);
    families.get(fam)!.push({ code, rows: rows.length });
  }
  return [...families]
    .map(([fam, codes]) => ({
      fam,
      name: fam === "—" ? "Other codes" : prInfo.family.get(fam) || fam,
      codes: codes.sort((a, b) => a.code.localeCompare(b.code)),
    }))
    .sort((a, b) => Number(a.fam === "—") - Number(b.fam === "—") || a.name.localeCompare(b.name));
}

export interface Retrofit {
  code: string;
  fam: string;
  famName: string;
  /** Codes of the family that occur in the catalog. */
  famCodes: string[];
  /** The vehicle's code in this family, if entered. */
  known: string | null;
  /** What the option is compared with: the vehicle's code, else the family's "without …" option. */
  base: string | null;
  /** Rows mentioning the option. */
  all: RowHit[];
  /** Rows that fit with the option but not with the baseline. */
  need: RowHit[];
  /** Rows that fit with the baseline but not with the option. */
  replaced: RowHit[];
  /** Rows mentioning the option that still do not fit: they need other equipment too. */
  depends: RowHit[];
}

/** `compareWith`: undefined = default baseline, null = nothing in this family, or a code. */
export function retrofit(
  code: string,
  index: Map<string, RowHit[]>,
  f: VehicleData,
  prInfo: PrInfo,
  compareWith?: string | null,
): Retrofit {
  const fam = familyOf(prInfo, code);
  const famName = fam === "—" ? "" : prInfo.family.get(fam) || fam;
  const famCodes =
    fam === "—" ? [code] : [...index.keys()].filter((c) => familyOf(prInfo, c) === fam).sort();
  const known = fam !== "—" ? f.pr[fam] || null : null;
  const without = famCodes.find(
    (c) => c !== code && /^(without|no)\b/i.test(prInfo.code.get(c)?.text || ""),
  );
  const base = compareWith !== undefined ? compareWith : known || without || null;
  const now: VehicleData = { ...f, pr: { ...f.pr } };
  if (fam !== "—") {
    if (base) now.pr[fam] = base;
    else delete now.pr[fam];
  }
  const target: VehicleData = { ...f, pr: { ...f.pr } };
  if (fam !== "—") target.pr[fam] = code;

  // Rows that can change: every row that mentions a code of this family.
  const seen = new Set<Rec>();
  const need: RowHit[] = [],
    replaced: RowHit[] = [],
    depends: RowHit[] = [],
    all: RowHit[] = [];
  for (const c of famCodes) {
    for (const hit of index.get(c) || []) {
      if (seen.has(hit.row)) continue;
      seen.add(hit.row);
      const mentions = (hit.row.C0 as string[]).some((x) => x.trim() === code);
      const fitsNow = rowMatches(hit.row, now, prInfo),
        fitsThen = rowMatches(hit.row, target, prInfo);
      if (mentions) all.push(hit);
      if (fitsThen && !fitsNow) need.push(hit);
      else if (fitsNow && !fitsThen) replaced.push(hit);
      else if (mentions && !fitsThen) depends.push(hit);
    }
  }
  return { code, fam, famName, famCodes, known, base, all, need, replaced, depends };
}
