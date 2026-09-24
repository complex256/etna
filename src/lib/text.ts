// Formatting of part numbers, dates and the multi-line text fields of catalog rows.
import { dump, type Plate } from "./dump";
import type { Rec } from "./format/records";

export function fmtPart(s: string | null | undefined): string {
  if (!s) return "";
  const n = /^N\s+(\d{3})(\d{3})?(\d+)?\s*(.*)$/.exec(s);
  if (n) return ["N ", n[1], n[2], n[3], n[4]].filter(Boolean).join(" ");
  if (s.length < 9) return s.trim();
  return [s.slice(0, 3), s.slice(3, 6), s.slice(6, 9), s.slice(9).trim()].filter(Boolean).join(" ");
}
/** YYMM -> "MM/YY" style month shown on part rows. */
export const fmtMonth = (v: number | null | undefined) =>
  v ? `${String(Math.floor(v / 100)).padStart(2, "0")}/${String(v % 100).padStart(2, "0")}` : "";
/** "0702" (MMYY) -> "07/2002" */
export function fmtMMYY(s: string | null | undefined) {
  const m = /^(\d\d)(\d\d)$/.exec((s || "").trim());
  if (!m) return "";
  const yy = +m[2];
  return `${m[1]}/${yy > 50 ? 1900 + yy : 2000 + yy}`;
}
/** DDMMYYYY number -> "DD.MM.YYYY" */
export const fmtDmy = (v: number | string | null | undefined) =>
  v
    ? String(v)
        .padStart(8, "0")
        .replace(/^(\d\d)(\d\d)(\d{4})$/, "$1.$2.$3")
    : "";
export const normPos = (s: string | null | undefined) =>
  (s || "").replace(/[()\s]/g, "").toUpperCase();
export const stripQ = (s: string | null | undefined) => (s || "").trim();
/** Position column value, blank for "-". */
export const posLabel = (r: Rec) => (r.AE && r.AE !== "-" ? r.AE : "");
// PR texts are stored as fixed 40-column lines; collapse the padding.
export const tidy = (s: string | null | undefined) => (s || "").replace(/\s{2,}/g, " ").trim();

const money = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
export const fmtMoney = (v: number | null | undefined) => (v == null ? "" : money.format(v));

/** A text field as lines: dictionary ids (DA/DB/DC) combined with literal lines (DE/DF/DG). */
export function lines(ids: number[] | undefined, lits: string[] | undefined): string[] {
  const n = Math.max(ids ? ids.length : 0, lits ? lits.length : 0);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(
      [ids && ids[i] ? dump().text(ids[i]) : "", lits && lits[i] ? lits[i].trim() : ""]
        .filter(Boolean)
        .join(" "),
    );
  }
  return out;
}
/** A text field joined into one line. */
export const oneLine = (ids: number[] | undefined, lits: string[] | undefined) =>
  lines(ids, lits)
    .filter(Boolean)
    .join(" ")
    .replace(/\s*\n\s*/g, " ");

export interface PlateTitle {
  title: string;
  remark: string;
  model: string;
}
// Cached per plate and language.
const titles = new WeakMap<Plate, { lang: string; t: PlateTitle }>();
/** Title, remark and model data of an illustration, from its header row (AD "U"). */
export function plateTitle(plate: Plate): PlateTitle {
  const lang = dump().lang.code;
  const hit = titles.get(plate);
  if (hit && hit.lang === lang) return hit.t;
  const row = plate.rows.find((r) => r.AD === "U");
  const t = row
    ? {
        title: lines(row.DA, row.DE).filter(Boolean).join(" "),
        remark: lines(row.DB, row.DF).filter(Boolean).join(" "),
        model: lines(row.DC, row.DG).filter(Boolean).join(" "),
      }
    : { title: "", remark: "", model: "" };
  titles.set(plate, { lang, t });
  return t;
}
export const plateLabel = (p: Plate) => `${p.hgug}-${p.no}`;
/** "85771 " -> "857-71" */
export const plateKeyLabel = (key: string) => `${key.slice(0, 3)}-${key.slice(3).trim()}`;
export const isPartRow = (r: Rec) => !!r.AC && r.AD !== "U" && r.AD !== "O" && r.AD !== "l";
