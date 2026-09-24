// The opened dump: vehicle index (OVERVIEW), text dictionary, languages and catalogs.
import { markRaw } from "vue";
import { bytes, type Dir } from "./fs";
import {
  decodeAll,
  decodeRecord,
  numIndex,
  parseFdt,
  parsePnt,
  setCodepage,
  type Fdt,
  type NumIndex,
  type Pnt,
  type Rec,
} from "./format/records";

export interface Language {
  /** Dictionary suffix: 06_<code>.BIN */
  code: string;
  iso: string;
  label: string;
  /** Letter used by per-language tables (PRSTAM<letter>, notes). */
  letter: string;
  cp: string;
}
export interface CatalogEntry {
  year: number;
  kat: number;
  types: string[];
  hgs: string;
  accessory: boolean;
  katMarket: string;
  plants: string[];
}
export interface Model {
  market: string;
  code: string;
  name: string;
  from: number;
  to: number | null;
  country: string;
  plants: string[];
  catalogs: CatalogEntry[];
}
export interface Plate {
  /** Illustration key: main group, subgroup and number, space-padded (e.g. "85771 "). */
  key: string;
  hg: string;
  hgug: string;
  no: string;
  graphic: string;
  graphicOld: string;
  /** Graphic navigation category text ids. */
  nav: number[];
  rows: Rec[];
}
export interface Catalog {
  market: string;
  kat: string | number;
  plates: Plate[];
  /** PR codes defined in the catalog header ("P " rows). */
  pr: Map<string, Rec>;
  /** code -> part rows mentioning it (built on demand by the Equipment page). */
  prIndex?: Map<string, { plate: Plate; row: Rec }[]>;
}
export interface Brand {
  name: string;
  brandDir: Dir | null;
  data: Dir;
}

const CODEPAGES: Record<number, string> = {
  932: "shift_jis",
  936: "gbk",
  949: "euc-kr",
  950: "big5",
  874: "windows-874",
};
const cpLabel = (cp: number) =>
  CODEPAGES[cp] || (cp >= 1250 && cp <= 1258 ? `windows-${cp}` : "windows-1252");
const MARKET_ORDER = ["RDW", "USA", "CA", "MEX", "ZA", "RA", "BR"];

interface Texts {
  bin: Uint8Array;
  idx: NumIndex;
  fdt: Fdt;
  cache: Map<number, string>;
}

export class Dump {
  languages: Language[] = [];
  lang!: Language;
  models: Model[] = [];
  markets: string[] = [];
  hgNames: Record<string, string> = {};
  texts!: Texts;
  private fdts = new Map<string, Fdt>();
  private catalogs = new Map<string, Promise<Catalog>>();
  private pntCache = new Map<string, Pnt>();

  readonly brand: string;
  /** Brand folder (Bilder, minis, …); null when the data folder was opened directly. */
  readonly brandDir: Dir | null;
  readonly data: Dir;

  constructor(brand: string, brandDir: Dir | null, data: Dir) {
    this.brand = brand;
    this.brandDir = brandDir;
    this.data = data;
    // Never reactive: tables and records are large and immutable.
    markRaw(this);
  }

  async fdt(dir: Dir, name: string): Promise<Fdt> {
    const key = (dir === this.data ? "" : dir.name + "/") + name.toLowerCase();
    let f = this.fdts.get(key);
    if (!f) {
      const b = await bytes(dir, name);
      if (!b) throw new Error(`Missing table definition ${name}`);
      f = parseFdt(b);
      this.fdts.set(key, f);
    }
    return f;
  }

  async init() {
    await this.loadLanguages();
    await this.loadOverview();
  }

  private async loadLanguages() {
    const names = new Set((await this.data.fileNames()).map((n) => n.toUpperCase()));
    this.languages = [];
    const b = await bytes(this.data, "18.bin");
    if (b) {
      for (const r of decodeAll(b, await this.fdt(this.data, "18.fdt"))) {
        const iso: string = r.CA || "";
        const code = (iso.includes("_") ? iso.split("_")[1] : iso).toUpperCase();
        if (!names.has(`06_${code}.BIN`)) continue;
        let label = iso;
        try {
          const raw = Uint8Array.from(atob(r.DA || ""), (c) => c.charCodeAt(0));
          label = new TextDecoder(cpLabel(r.DG)).decode(raw) || iso;
        } catch {
          /* keep iso */
        }
        this.languages.push({
          code,
          iso,
          label,
          letter: (r.CB || "e").toUpperCase(),
          cp: cpLabel(r.DG),
        });
      }
    }
    if (!this.languages.length) {
      for (const n of names) {
        const m = /^06_([A-Z]{2})\.BIN$/.exec(n);
        if (m)
          this.languages.push({
            code: m[1],
            iso: m[1].toLowerCase(),
            label: m[1],
            letter: "E",
            cp: "windows-1252",
          });
      }
    }
  }

  async setLanguage(code: string) {
    const lang =
      this.languages.find((l) => l.code === code) ||
      this.languages.find((l) => l.code === "EN") ||
      this.languages[0];
    if (!lang) throw new Error("No text dictionaries (06_XX.BIN) found in the data folder.");
    this.lang = lang;
    setCodepage(lang.cp);
    const [bin, pnt, fdt] = await Promise.all([
      bytes(this.data, `06_${lang.code}.BIN`),
      bytes(this.data, `06_${lang.code}.pnt`),
      this.fdt(this.data, "06.fdt"),
    ]);
    if (!bin || !pnt) throw new Error(`The text dictionary 06_${lang.code} is incomplete.`);
    this.texts = { bin, idx: numIndex(pnt), fdt, cache: new Map() };
    this.hgNames = await this.loadHgNames(lang.letter);
  }

  /** Text by dictionary id; multi-line texts are joined with "\n". */
  text(id: number | null | undefined): string {
    if (!id) return "";
    const t = this.texts;
    let s = t.cache.get(id);
    if (s === undefined) {
      const off = t.idx.find(id);
      if (off < 0) s = `[${id}]`;
      else {
        const r = decodeRecord(t.bin, off, t.fdt).rec;
        s = ((r.AD || [r.AC || r.AB || ""]) as string[])
          .map((x) => x.trim())
          .filter(Boolean)
          .join("\n");
      }
      t.cache.set(id, s);
    }
    return s;
  }

  private async loadHgNames(letter: string) {
    const b = (await bytes(this.data, `HGTEXT.${letter}`)) || (await bytes(this.data, "HGTEXT.E"));
    const out: Record<string, string> = {};
    if (!b) return out;
    let txt: string;
    try {
      txt = new TextDecoder("utf-8", { fatal: true }).decode(b);
    } catch {
      txt = new TextDecoder(this.lang.cp).decode(b);
    }
    for (const line of txt.split(/\r?\n/)) {
      const m = /^\s*\S.*?\s([0-9A-Z])\s+(\S.*?)\s*$/.exec(line);
      if (m && !(m[1] in out)) out[m[1]] = m[2];
    }
    return out;
  }

  private async loadOverview() {
    const b = await bytes(this.data, "OVERVIEW.BIN");
    if (!b) throw new Error("OVERVIEW.BIN not found in the data folder.");
    const recs = decodeAll(b, await this.fdt(this.data, "overview.fdt"));
    const models: Model[] = [];
    let cur: Model | null = null;
    for (const r of recs) {
      if (r.AA !== undefined) {
        cur = {
          market: r.AA.trim(),
          code: (r.BA || "").trim(),
          name: (r.EA || "").trim(),
          from: r.CA,
          to: r.DA || null,
          country: (r.EB || "").trim(),
          plants: (r.KA || []).map((x: string) => x.trim()),
          catalogs: [],
        };
        models.push(cur);
      } else if (cur && r.FA) {
        cur.catalogs.push({
          year: r.CA,
          kat: r.FA,
          types: (r.JA || []).map((s: string) => s.trim()).filter(Boolean),
          hgs: (r.IA || []).join(""),
          accessory: r.GA === 1,
          katMarket: (r.LA || "").trim(),
          plants: (r.KA || []).map((x: string) => x.trim()),
        });
      }
    }
    this.models = models;
    this.markets = [...new Set(models.map((m) => m.market))].sort(
      (a, b) =>
        (MARKET_ORDER.indexOf(a) + 1 || 99) - (MARKET_ORDER.indexOf(b) + 1 || 99) ||
        a.localeCompare(b),
    );
  }

  model(market: string | null, code: string | null) {
    if (!market || !code) return undefined;
    return this.models.find((m) => m.market === market && m.code === code);
  }

  /** Market folder: U for the USA, R for the rest (each falls back to the other). */
  async catalogDir(market: string | null) {
    const order = market === "USA" ? ["U", "R"] : ["R", "U"];
    for (const p of order) {
      const d = await this.data.dir(p);
      if (d) return d;
    }
    return null;
  }

  catalog(market: string, kat: string | number): Promise<Catalog> {
    const key = market + ":" + kat;
    let c = this.catalogs.get(key);
    if (!c) {
      c = this.loadCatalog(market, kat);
      this.catalogs.set(key, c);
      c.catch(() => this.catalogs.delete(key));
    }
    return c;
  }

  /** Rows of one illustration without decoding the whole catalog (verifies where-used hits). */
  async plateRows(market: string, kat: number, plateKey: string): Promise<Rec[]> {
    const name = String(kat).padStart(3, "0");
    for (const d of [
      await this.catalogDir(market),
      await this.data.dir("R"),
      await this.data.dir("U"),
    ]) {
      if (!d) continue;
      const [pnt, bin] = await Promise.all([d.file(`KAT${name}.pnt`), d.file(`KAT${name}.BIN`)]);
      if (!pnt || !bin) continue;
      const ck = d.name + name;
      let idx = this.pntCache.get(ck);
      if (!idx) {
        idx = parsePnt(new Uint8Array(await pnt.arrayBuffer()), 6);
        this.pntCache.set(ck, idx);
      }
      const i = idx.keys.findIndex((k) => String(k).trimEnd() === plateKey.trimEnd());
      if (i < 0) return [];
      const end = i + 1 < idx.keys.length ? idx.offs[i + 1] : bin.size;
      const b = new Uint8Array(await bin.slice(idx.offs[i], end).arrayBuffer());
      return decodeAll(b, await this.fdt(d, "Kataloge.fdt")).filter((r) => r.AA === undefined);
    }
    return [];
  }

  private async loadCatalog(market: string, kat: string | number): Promise<Catalog> {
    const dir = await this.catalogDir(market);
    if (!dir) throw new Error("No catalog folders (R or U) inside the data folder.");
    const name = `KAT${String(kat).padStart(3, "0")}.BIN`;
    let b = await bytes(dir, name);
    let useDir = dir;
    if (!b) {
      for (const alt of ["R", "U"]) {
        const d = await this.data.dir(alt);
        if (d && (b = await bytes(d, name))) {
          useDir = d;
          break;
        }
      }
    }
    if (!b) throw new Error(`Catalog file ${name} is missing from this dump.`);
    const fdt = await this.fdt(useDir, "Kataloge.fdt");
    const plates: Plate[] = [],
      pr = new Map<string, Rec>();
    let plate: Plate | null = null;
    for (let p = 0; p < b.length;) {
      const { rec, next } = decodeRecord(b, p, fdt);
      if (next <= p) break;
      p = next;
      // A record with AA starts an illustration. (AD "X" marks newer illustrations; they are
      // ordinary pages and make up most of recent catalogs.)
      if (rec.AA !== undefined) {
        const key: string = rec.AA;
        if (key.trim() === "P") {
          plate = null;
          continue;
        }
        plate = {
          key,
          hg: key[0],
          hgug: rec.CA || key.slice(0, 3),
          no: key.slice(3).trim(),
          graphic: (rec.OA || rec.CB || "").trim(),
          graphicOld: (rec.CB || "").trim(),
          nav: rec.OB || [],
          rows: [],
        };
        plates.push(plate);
      } else if (!plate && rec.AE && rec.AE.startsWith("P ")) {
        pr.set(rec.AE.slice(2).trim(), rec);
      } else if (plate) {
        plate.rows.push(rec);
      }
    }
    return markRaw({ market, kat, plates, pr });
  }
}

/** Finds the newest data folder (Data1/Data2 with OVERVIEW.BIN) of a brand folder. */
async function findDataDir(brandDir: Dir) {
  const cands: { d: Dir; upd: number; mt: number }[] = [];
  for (const d of await brandDir.dirs()) {
    if (!/^data\d*$/i.test(d.name)) continue;
    const names = await d.fileNames();
    if (!names.some((n) => n.toUpperCase() === "OVERVIEW.BIN")) continue;
    const upd = Math.max(0, ...names.map((n) => +(/^upd(\d+)/i.exec(n) || [0, 0])[1]));
    const ov = await d.file("OVERVIEW.BIN");
    cands.push({ d, upd, mt: ov ? ov.lastModified : 0 });
  }
  cands.sort((a, b) => b.upd - a.upd || b.mt - a.mt);
  return cands[0] ? cands[0].d : null;
}

/** Brands in a picked folder: the brand folder itself, its data folder, or the folder above. */
export async function findBrands(root: Dir): Promise<Brand[]> {
  if (await root.file("OVERVIEW.BIN")) return [{ name: root.name, brandDir: null, data: root }];
  const data = await findDataDir(root);
  if (data) return [{ name: root.name, brandDir: root, data }];
  const found: Brand[] = [];
  for (const d of await root.dirs()) {
    const dd = await findDataDir(d);
    if (dd) found.push({ name: d.name, brandDir: d, data: dd });
  }
  return found;
}

// The open dump. Data-layer helpers read it from here; the session store swaps it.
let current: Dump | null = null;
export function dump(): Dump {
  if (!current) throw new Error("No dump is open.");
  return current;
}
export function setDump(d: Dump | null) {
  current = d;
}

/** Memoizes a value per open dump (caches are dropped when another dump is opened). */
export function perDump<T>(init: (d: Dump) => T): () => T {
  const m = new WeakMap<Dump, T>();
  return () => {
    const d = dump();
    if (!m.has(d)) m.set(d, init(d));
    return m.get(d)!;
  };
}

// Holds app-wide state: a hot update would create a second copy of it, so reload instead.
import.meta.hot?.accept(() => location.reload());
