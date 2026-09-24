// Lookup tables beyond the catalogs: part master, prices, PR texts, notes, where-used, codes.
import { dump, perDump, type Dump } from "./dump";
import { bytes, type Dir, type FileLike } from "./fs";
import {
  decodeAll,
  decodeFlat,
  decodeRecord,
  parseFdt,
  u32,
  type Fdt,
  type Rec,
} from "./format/records";
import { stripQ, tidy } from "./text";

/**
 * A table whose .pnt index is sorted by a fixed-width string key. Lookups binary-search the index
 * through File.slice, so multi-hundred-MB tables (STAMM, FPreis) never load whole.
 */
export class KeyedTable {
  private ready: Promise<boolean> | null = null;
  private fdt!: Fdt;
  private keyLen = 0;
  private w = 0;
  private n = 0;
  private keyName = "";
  private pnt!: FileLike;
  private bin!: FileLike;
  private cache = new Map<number, { k: string; off: number }>();

  private readonly dir: Dir;
  private readonly fdtName: string;
  private readonly binName: string;
  private readonly pntName: string;
  private readonly flat: boolean;

  constructor(dir: Dir, fdtName: string, binName: string, pntName: string, flat = false) {
    this.dir = dir;
    this.fdtName = fdtName;
    this.binName = binName;
    this.pntName = pntName;
    this.flat = flat;
  }

  private init() {
    this.ready ??= (async () => {
      const [fdtB, pnt, bin] = await Promise.all([
        bytes(this.dir, this.fdtName),
        this.dir.file(this.pntName),
        this.dir.file(this.binName),
      ]);
      if (!fdtB || !pnt || !bin) return false;
      this.fdt = parseFdt(fdtB);
      const keyField = this.fdt.fields.find((f) => f.name === this.fdt.keys) || this.fdt.fields[0];
      // Composite keys (e.g. notiz: part number + language letter) are concatenated in the index.
      this.keyLen =
        this.fdt.keyNames.reduce(
          (a, k) => a + (this.fdt.fields.find((f) => f.name === k)?.size || 0),
          0,
        ) || keyField.size;
      this.w = this.keyLen + 4;
      this.pnt = pnt;
      this.bin = bin;
      this.n = Math.floor(pnt.size / this.w);
      this.keyName = keyField.name;
      return true;
    })();
    return this.ready;
  }

  private async entry(i: number) {
    let e = this.cache.get(i);
    if (!e) {
      const b = new Uint8Array(await this.pnt.slice(i * this.w, (i + 1) * this.w).arrayBuffer());
      let k = "";
      for (let j = 0; j < this.keyLen; j++) k += String.fromCharCode(b[j]);
      e = { k, off: u32(b, this.keyLen) };
      if (this.cache.size > 4096) this.cache.clear();
      this.cache.set(i, e);
    }
    return e;
  }

  private async lowerBound(prefix: string) {
    let lo = 0,
      hi = this.n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((await this.entry(mid)).k < prefix) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** Decode the record at `off`, plus following child records (no key field) when `children`. */
  private async recordsAt(off: number, children: boolean): Promise<Rec[]> {
    let size = 8192;
    for (;;) {
      const buf = new Uint8Array(await this.bin.slice(off, off + size).arrayBuffer());
      const out: Rec[] = [];
      let p = 0,
        truncated = false;
      while (p + 2 <= buf.length) {
        const len = buf[p] | (buf[p + 1] << 8);
        if (p + 2 + len > buf.length) {
          truncated = buf.length === size;
          break;
        }
        const { rec, next } = (this.flat ? decodeFlat : decodeRecord)(buf, p, this.fdt);
        if (out.length && (!children || rec[this.keyName] !== undefined)) return out;
        out.push(rec);
        p = next;
        if (!children) return out;
      }
      if (!truncated || size >= 1 << 22) return out;
      size *= 4;
    }
  }

  /** All records whose key (trailing spaces ignored) equals `key`. */
  async get(key: string, children = false): Promise<Rec[][]> {
    if (!(await this.init())) return [];
    const want = key.padEnd(this.keyLen).slice(0, this.keyLen);
    const out: Rec[][] = [];
    for (let i = await this.lowerBound(want); i < this.n && out.length < 20; i++) {
      const e = await this.entry(i);
      if (e.k !== want) break;
      out.push(await this.recordsAt(e.off, children));
    }
    return out;
  }

  /** Keys starting with `prefix` whose space-stripped form starts with `compact`. */
  async search(prefix: string, compact: string, limit = 40): Promise<Rec[]> {
    if (!(await this.init())) return [];
    const out: Rec[] = [];
    for (let i = await this.lowerBound(prefix); i < this.n && out.length < limit; i++) {
      const e = await this.entry(i);
      if (!e.k.startsWith(prefix)) break;
      if (e.k.replace(/\s+/g, "").startsWith(compact))
        out.push((await this.recordsAt(e.off, false))[0]);
    }
    return out;
  }
}

/** Small tables that are cheap to load whole and index in memory. */
export async function loadWhole(
  dir: Dir,
  fdtName: string,
  binName: string,
  flat = false,
): Promise<Rec[]> {
  const [f, b] = await Promise.all([bytes(dir, fdtName), bytes(dir, binName)]);
  if (!f || !b) return [];
  return decodeAll(b, parseFdt(f), 0, b.length, flat);
}

/** Memoizes an async value per open dump and key. */
function perDumpKeyed<T>(load: (d: Dump, key: string) => Promise<T>) {
  const caches = perDump(() => new Map<string, Promise<T>>());
  return (key: string) => {
    const c = caches();
    let v = c.get(key);
    if (!v) {
      v = load(dump(), key);
      c.set(key, v);
    }
    return v;
  };
}

/* ---------------- part master, prices, pictures ---------------- */

const partTables = perDump((d) => {
  const t = d.data;
  const r = d.catalogDir("RDW");
  return {
    stamm: new KeyedTable(t, "stamm.fdt", "STAMM.BIN", "stamm.pnt"),
    price: new KeyedTable(t, "FPreis.fdt", "FPreis.bin", "FPreis.pnt"),
    priceAcc: new KeyedTable(t, "Z_FPreis.fdt", "Z_FPreis.bin", "Z_FPreis.pnt"),
    photos: new KeyedTable(t, "BildRef.fdt", "BILDREF.BIN", "BildRef.pnt"),
    exchange: new KeyedTable(t, "at_list.fdt", "AT_LIST.BIN", "at_list.pnt"),
    norm: new KeyedTable(t, "norm.fdt", "NORM.BIN", "norm.pnt"),
    contents: r.then((dir) =>
      dir ? new KeyedTable(dir, "zsbinfo.fdt", "ZSBINFO.BIN", "zsbinfo.pnt") : null,
    ),
  };
});

export interface Price {
  amount: number;
  date: string;
  group: string;
}

export const Parts = {
  async price(pn: string): Promise<Price | null> {
    const t = partTables();
    const hit = (await t.price.get(pn))[0] || (await t.priceAcc.get(pn))[0];
    const r = hit && hit[0];
    if (!r || r.A2 == null) return null;
    return {
      amount: r.A2 / 100,
      date: r.A1 ? String(r.A1).replace(/^(\d{4})(\d\d)(\d\d)$/, "$3.$2.$1") : "",
      group: (r.A3 || "").trim(),
    };
  },
  async master(pn: string): Promise<Rec | null> {
    const hit = (await partTables().stamm.get(pn))[0];
    return hit ? hit[0] : null;
  },
  /** Part-master records whose part number starts with `q` (spaces ignored). */
  async searchMaster(q: string): Promise<Rec[]> {
    const key = q.replace(/\s+/g, "").toUpperCase();
    if (key.length < 5) return [];
    return partTables().stamm.search(key.slice(0, 9), key);
  },
  async photos(pn: string): Promise<string[]> {
    return (await partTables().photos.get(pn)).flatMap((recs) => recs[0].A2 || []);
  },
  async exchange(pn: string): Promise<string[]> {
    const hit = (await partTables().exchange.get(pn))[0];
    return hit
      ? (hit[0].B0 || [])
          .map((b: Rec) => b.B2)
          .filter((x: string) => x && x.trimEnd() !== pn.trimEnd())
      : [];
  },
  async norm(pn: string): Promise<Rec | null> {
    const hit = (await partTables().norm.get(pn))[0];
    return hit ? hit[0] : null;
  },
  async contents(pn: string): Promise<Rec[]> {
    const t = await partTables().contents;
    if (!t) return [];
    const hit = (await t.get(pn, true))[0];
    return hit ? hit.slice(1) : [];
  },
};

/* ---------------- PR (equipment) codes ---------------- */

export interface PrInfo {
  code: Map<string, { family: string; text: string }>;
  family: Map<string, string>;
}

// Language-dependent PR-number and PR-family texts (PRSTAM<letter>, PRFAM<letter>).
const prByLetter = perDumpKeyed<PrInfo>(async (d, letter) => {
  const pick = async (base: string) => {
    for (const l of [letter, "E", "D"]) {
      const recs = await loadWhole(d.data, `${base}${l}.fdt`, `${base}${l}.BIN`);
      if (recs.length) return recs;
    }
    return [];
  };
  const [codes, fams] = await Promise.all([pick("PRSTAM"), pick("PRFAM")]);
  const code = new Map<string, { family: string; text: string }>(),
    family = new Map<string, string>();
  for (const r of codes)
    if (r.A0) code.set(r.A0.trim(), { family: (r.A1 || "").trim(), text: tidy(r.A2) });
  for (const r of fams) if (r.A1) family.set(r.A1.trim(), tidy(r.A2));
  return { code, family };
});
export const PR = { load: () => prByLetter(dump().lang.letter) };

/* ---------------- vehicle codes per catalog ---------------- */

export interface CatalogVehicleCodes {
  engines: Map<string, string>;
  gearboxes: Map<string, string>;
}
// Engine (vb) and gearbox (vc) codes per catalog ("Typ"), from the market folder.
const vehicleCodes = perDumpKeyed<CatalogVehicleCodes>(async (d, key) => {
  const [market, kat] = key.split(":");
  const dir = await d.catalogDir(market);
  if (!dir) return { engines: new Map(), gearboxes: new Map() };
  const [vb, vc] = await Promise.all([
    loadWhole(dir, "vb.fdt", "VB.BIN"),
    loadWhole(dir, "vc.fdt", "VC.BIN"),
  ]);
  const engines = new Map<string, string>(),
    gearboxes = new Map<string, string>();
  for (const r of vb)
    if (String(r.AA) === String(+kat) && r.AB) {
      const kw = r.AG ? `${r.AG} kW` : "",
        l = r.AF ? `${(r.AF / 100).toFixed(1)} l` : "";
      engines.set(r.AB.trim(), [l, kw, r.AI ? `${r.AI} cyl.` : ""].filter(Boolean).join(", "));
    }
  for (const r of vc)
    if (String(r.AA) === String(+kat) && r.AB) gearboxes.set(r.AB.trim(), (r.AF || "").trim());
  return { engines, gearboxes };
});
export const VehicleCodes = {
  forCatalog: (market: string, kat: string | number) => vehicleCodes(`${market}:${kat}`),
};

export interface ModelCode {
  code: string;
  text: string;
  from: string;
  to: string;
}
// Model codes per catalog (R/va): "8WH5NY" = type 8WH + model version 5NY, with description and build dates.
const modelCodes = perDumpKeyed<ModelCode[]>(async (d, key) => {
  const [market, kat] = key.split(":");
  const dir = await d.catalogDir(market);
  if (!dir) return [];
  const fmt = (s: string) => (/^\d{6}$/.test(s || "") ? `${s.slice(4)}/${s.slice(0, 4)}` : "");
  return (await loadWhole(dir, "va.fdt", "VA.BIN"))
    .filter((r) => String(r.AA) === String(+kat) && r.AB)
    .map((r) => ({
      code: r.AB.trim(),
      text: typeof r.AC === "number" ? d.text(r.AC) : (r.AC || "").trim(),
      from: fmt(r.AD),
      to: fmt(r.AE),
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
});
export const ModelCodes = {
  forCatalog: (market: string, kat: string | number) => modelCodes(`${market}:${kat}`),
};

/* ---------------- service notes ---------------- */

export interface Note {
  text: string;
  lang: string;
  /** The note is in German because none exists in the current language. */
  fallback: boolean;
}
// Service notes (R/notiz): "T" + part number, or "B" + catalog + illustration key, per language letter.
const noteTables = perDumpKeyed<KeyedTable | null>(async (d, market) => {
  const dir = await d.catalogDir(market);
  return dir ? new KeyedTable(dir, "notiz.fdt", "NOTIZ.BIN", "notiz.pnt", true) : null;
});
async function lookupNote(key: string, market: string): Promise<Note | null> {
  const t = await noteTables(market || "RDW");
  if (!t) return null;
  const d = dump();
  // The dump only carries a few languages, so fall back to German.
  for (const l of new Set([d.lang.letter, "D"])) {
    const hit = (await t.get(key.padEnd(15).slice(0, 15) + l))[0];
    if (hit && hit[0].A2) {
      const text = (hit[0].A2 as string[])
        .map((x) => x.trim())
        .filter(Boolean)
        .join(" ");
      if (text) return { text, lang: l, fallback: l !== d.lang.letter };
    }
  }
  return null;
}
export const Notes = {
  part: (pn: string, market: string) => lookupNote("T" + pn.trimEnd().padEnd(14), market),
  plate: (kat: string | number, plateKey: string, market: string) =>
    lookupNote("B" + String(kat).padStart(3, "0") + plateKey.trimEnd(), market),
};

/* ---------------- where-used and description cross-reference ---------------- */

// Where-used index (R/rnr): key = catalog * 1000 + middle group (part number digits 4-6);
// values = end number (digits 7-9) * 100000 + main/subgroup * 100 + illustration number.
// Prefix and index letters are not in the index, so candidates are verified against the catalog.
const rnrIndex = perDumpKeyed<Map<number, number[]>>(async (d, market) => {
  const dir = await d.catalogDir(market);
  const m = new Map<number, number[]>();
  if (dir)
    for (const r of await loadWhole(dir, "rnr.fdt", "RNR.BIN", true)) if (r.A2) m.set(r.A0, r.A2);
  return m;
});
const plateKeyOf = (v: number) =>
  String(Math.floor(v / 100)).padStart(3, "0") + String(v % 100).padStart(2, "0");
export const WhereUsed = {
  /** Candidate illustrations per catalog: [{ kat, plates: ['03535', …] }]. */
  async candidates(pn: string, market: string): Promise<{ kat: number; plates: string[] }[]> {
    const m = /^[0-9A-Z]{3}(\d{3})(\d{3})/.exec((pn || "").replace(/\s+/g, ""));
    if (!m) return [];
    const mid = +m[1],
      end = +m[2];
    const out: { kat: number; plates: string[] }[] = [];
    for (const [key, vals] of await rnrIndex(market || "RDW")) {
      if (key % 1000 !== mid) continue;
      const plates: string[] = [];
      for (const v of vals) {
        if (Math.floor(v / 100000) !== end) continue;
        const hgug = Math.floor(v / 100) % 1000,
          bt = v % 100;
        plates.push(String(hgug).padStart(3, "0") + String(bt).padStart(2, "0"));
      }
      if (plates.length) out.push({ kat: Math.floor(key / 1000), plates: [...new Set(plates)] });
    }
    return out.sort((a, b) => a.kat - b.kat);
  },
};

export interface CrossRefUse {
  kat: number;
  plates: string[];
}
// Description cross-reference (R/tsxref, flat): text id -> [{ catalog, [subgroup*100 + illustration] }].
const tsxref = perDumpKeyed<Map<number, CrossRefUse[]>>(async (d, market) => {
  const dir = await d.catalogDir(market);
  const m = new Map<number, CrossRefUse[]>();
  if (dir)
    for (const r of await loadWhole(dir, "tsxref.fdt", "TSXREF.BIN", true)) {
      if (!r.AA || !r.CA) continue;
      if (!m.has(r.AA)) m.set(r.AA, []);
      m.get(r.AA)!.push({ kat: r.BA, plates: (r.CA as number[]).map(plateKeyOf) });
    }
  return m;
});
export const CrossRef = {
  index: (market: string) => tsxref(market || "RDW"),
  async uses(id: number, market: string) {
    return (await tsxref(market || "RDW")).get(id) || [];
  },
};

// Every description in the current language, for text search across all catalogs.
const textList = perDumpKeyed<{ id: number; text: string }[]>(async (d) =>
  decodeAll(d.texts.bin, d.texts.fdt)
    .filter((r) => r.AA && r.AD)
    .map((r) => ({
      id: r.AA as number,
      text: (r.AD as string[])
        .map((x) => x.trim())
        .filter(Boolean)
        .join(" "),
    }))
    .filter((x) => x.text.length > 1),
);
export const TextIndex = {
  async search(q: string, limit = 40) {
    const ql = q.toLowerCase();
    const hits = (await textList(dump().lang.code)).filter((x) =>
      x.text.toLowerCase().includes(ql),
    );
    // Exact and prefix matches first, then shorter texts.
    const rank = (x: { text: string }) => {
      const l = x.text.toLowerCase();
      return l === ql ? 0 : l.startsWith(ql) ? 1 : 2;
    };
    return hits.sort((a, b) => rank(a) - rank(b) || a.text.length - b.text.length).slice(0, limit);
  },
};

/* ---------------- engine and gearbox code registers ---------------- */

export interface EngineCode {
  code: string;
  kw: number;
  ps: number;
  litres: number | null;
  from: string;
  to: string;
  cyl: number;
  models: string[];
}
export interface GearboxCode {
  code: string;
  kind: string;
  from: string;
  to: string;
  models: string[];
}
export interface CodeRegister {
  engines: EngineCode[];
  gearboxes: GearboxCode[];
  engineKats: Map<string, Set<number>>;
  gearKats: Map<string, Set<number>>;
}
// Engine (mkb4/mkb) and gearbox (gkb) code registers, plus which catalogs list each code (vb/vc).
const codeRegister = perDumpKeyed<CodeRegister>(async (d, market) => {
  const dir = await d.catalogDir(market);
  if (!dir) return { engines: [], gearboxes: [], engineKats: new Map(), gearKats: new Map() };
  let engines = await loadWhole(dir, "mkb4.fdt", "MKB4.BIN", true);
  if (!engines.length) engines = await loadWhole(dir, "mkb.fdt", "MKB.BIN", true);
  const [gearboxes, vb, vc] = await Promise.all([
    loadWhole(dir, "gkb.fdt", "GKB.BIN", true),
    loadWhole(dir, "vb.fdt", "VB.BIN"),
    loadWhole(dir, "vc.fdt", "VC.BIN"),
  ]);
  const invert = (rows: Rec[]) => {
    const m = new Map<string, Set<number>>();
    for (const r of rows) {
      const c = (r.AB || "").trim();
      if (!c || !r.AA) continue;
      if (!m.has(c)) m.set(c, new Set());
      m.get(c)!.add(r.AA);
    }
    return m;
  };
  const models = (r: Rec) =>
    (r.B0 || [])
      .map((x: Rec) => [x.B1, x.B2].map(stripQ).filter(Boolean).join(" "))
      .filter(Boolean);
  return {
    engines: engines.map((r) => ({
      code: (r.A1 || "").trim(),
      kw: r.A2,
      ps: r.A3,
      litres: r.A4 ? r.A4 / 100 : null,
      from: r.A5 || "",
      to: r.A6 || "",
      cyl: r.B3,
      models: models(r),
    })),
    gearboxes: gearboxes.map((r) => ({
      code: (r.A1 || "").trim(),
      kind: (r.A2 || "").trim(),
      from: r.A5 || "",
      to: r.A6 || "",
      models: models(r),
    })),
    engineKats: invert(vb),
    gearKats: invert(vc),
  };
});
export const Codes = { load: (market: string) => codeRegister(market || "RDW") };
