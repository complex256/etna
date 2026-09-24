// VIN -> candidate catalogs. Positions 7-8 are the vehicle type (matched against the catalog's type
// codes), position 10 the model year (MJ.TXT), position 11 the plant (OVERVIEW KA).
import { perDump, type CatalogEntry, type Model } from "./dump";
import { bytes } from "./fs";
import { loadWhole } from "./tables";

export const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/i;

const modelYears = perDump(async (d) => {
  const map = new Map<string, number[]>();
  const b = await bytes(d.data, "MJ.TXT");
  const txt = b ? new TextDecoder("latin1").decode(b) : "";
  for (const line of txt.split(/\r?\n/)) {
    const m = /^(\d{4})\s+(\S)/.exec(line);
    if (!m) continue;
    const y = +m[1],
      c = m[2].toUpperCase();
    if (!map.has(c)) map.set(c, []);
    map.get(c)!.push(y, y - 30, y + 30);
  }
  return map;
});

interface ChassisRange {
  kat: number;
  type: string;
  year: string;
  plant: string;
  serial: number;
  date: string;
  my: number | null;
  note: string;
}
// Chassis-number ranges per catalog (R/vh, U/vh): "F4-J-000001" = VIN type, model-year letter,
// plant ("-" = any) and first serial of a range that started production on AE (YYYYMMDD).
const chassisRanges = perDump(async (d) => {
  const list: ChassisRange[] = [];
  const seen = new Set<string>();
  for (const name of ["R", "U"]) {
    const dir = await d.data.dir(name);
    if (!dir) continue;
    for (const r of await loadWhole(dir, "vh.fdt", "VH.BIN")) {
      const m = /^([A-Z0-9]{2})-([A-Z0-9])([A-Z0-9-])(\d{6})$/.exec((r.AF || "").trim());
      if (!m) continue;
      const key = `${r.AA}|${r.AF}|${r.AE}|${r.AC || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({
        kat: r.AA,
        type: m[1],
        year: m[2],
        plant: m[3],
        serial: +m[4],
        date: r.AE || "",
        my: +r.AD || null,
        note: (r.AC || "").trim(),
      });
    }
  }
  return list;
});

export interface VinHit {
  model: Model;
  cat: CatalogEntry;
  range: ChassisRange | undefined;
  plantMatch: boolean;
}
export interface DecodedVin {
  vin: string;
  wmi: string;
  type: string;
  years: number[];
  plant: string;
  serial: string;
  /** Catalogs in the selected market. */
  hits: VinHit[];
  /** Other markets that also list this vehicle. */
  otherMarkets: string[];
  /** "MM/YYYY" production start of the matching chassis range. */
  built: string;
}

export async function decodeVin(
  vinIn: string,
  market: string,
  models: Model[],
): Promise<DecodedVin> {
  const vin = vinIn.toUpperCase();
  const type = vin.slice(6, 8),
    yc = vin[9],
    plant = vin[10],
    serial = +vin.slice(11) || 0;
  const years = ((await modelYears()).get(yc) || []).filter((y) => y > 1950 && y < 2100);
  // Catalogs whose chassis ranges cover this VIN, with the estimated production start of its range.
  const byKat = new Map<number, ChassisRange>();
  for (const c of await chassisRanges()) {
    if (
      c.type !== type ||
      c.year !== yc ||
      (c.plant !== "-" && c.plant !== plant) ||
      c.serial > serial
    )
      continue;
    const prev = byKat.get(c.kat);
    if (!prev || c.serial > prev.serial || (c.serial === prev.serial && c.date < prev.date))
      byKat.set(c.kat, c);
  }
  const modelYear = [...byKat.values()].map((c) => c.my).find(Boolean) || null;
  let hits: VinHit[] = [];
  for (const m of models) {
    for (const c of m.catalogs) {
      const range = byKat.get(c.kat);
      const yearOk = modelYear ? c.year === modelYear : years.includes(c.year);
      if (!yearOk) continue;
      if (!range && !(byKat.size === 0 && c.types.some((t) => t.startsWith(type)))) continue;
      const plants = c.plants && c.plants.length ? c.plants : m.plants;
      hits.push({ model: m, cat: c, range, plantMatch: !!(plants && plants.includes(plant)) });
    }
  }
  // Only the selected market is listed; other markets with matches are offered as a switch.
  const otherMarkets = [
    ...new Set(hits.filter((x) => x.model.market !== market).map((x) => x.model.market)),
  ];
  hits = hits
    .filter((x) => x.model.market === market)
    .sort((a, b) => a.cat.kat - b.cat.kat || a.model.name.localeCompare(b.model.name));
  const built =
    [...byKat.values()]
      .map((c) => c.date)
      .sort()
      .pop() || "";
  return {
    vin,
    wmi: vin.slice(0, 3),
    type,
    years: modelYear ? [modelYear] : years,
    plant,
    serial: vin.slice(11),
    hits,
    otherMarkets,
    built: built.replace(/^(\d{4})(\d\d)(\d\d)$/, "$2/$1"),
  };
}
