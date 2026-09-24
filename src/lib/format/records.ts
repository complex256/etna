// Catalog tables: definitions (.fdt), records (.BIN) and indexes (.pnt). No DOM access.

/** A decoded record. Field names are the two-letter .fdt names (AA, DA, C0, …). */
export type Rec = Record<string, any>;

export interface Field {
  name: string;
  size: number;
  rep: number;
  level: number;
  members: number;
  type: number;
}
export interface Entry extends Field {
  group?: Field[];
}
export interface Fdt {
  bin: string;
  pnt: string;
  /** First key field name. */
  keys: string;
  /** Up to four key field names; composite keys are concatenated in the index. */
  keyNames: string[];
  fields: Field[];
  /** Top-level entries: scalars, lists and groups (with their member fields). */
  entries: Entry[];
}

const T_FIXSTR = 0x12,
  T_INT = 0x14,
  T_INT32 = 0x16,
  T_BYTE = 0x18,
  T_VARSTR = 0x22,
  T_VARINT = 0x26;
const LEVEL_GROUP = 1,
  LEVEL_LIST = 2;

export const u16 = (b: Uint8Array, p: number) => b[p] | (b[p + 1] << 8);
export const u32 = (b: Uint8Array, p: number) =>
  (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0;
export const cstr = (b: Uint8Array, s: number, e: number) => {
  let r = "";
  for (let i = s; i < e && b[i]; i++) r += String.fromCharCode(b[i]);
  return r;
};

// .fdt: u16 magic, u16 nTop, u16 nFields, u16 ?, bin name @8, pnt name @0x15,
// key names @0x2c, then nFields x 13-byte field entries @0x38.
export function parseFdt(b: Uint8Array): Fdt {
  const nFields = u16(b, 4);
  const fields: Field[] = [];
  for (let i = 0, off = 0x38; i < nFields; i++, off += 13) {
    fields.push({
      name: cstr(b, off, off + 2),
      size: u16(b, off + 3),
      rep: u16(b, off + 5),
      level: u16(b, off + 7),
      members: u16(b, off + 9),
      type: u16(b, off + 11),
    });
  }
  const entries: Entry[] = [];
  for (let i = 0; i < fields.length;) {
    const f = fields[i];
    if (f.level === LEVEL_GROUP) {
      entries.push({ ...f, group: fields.slice(i + 1, i + 1 + f.members) });
      i += 1 + f.members;
    } else {
      entries.push(f);
      i++;
    }
  }
  // Up to four key field names in 3-byte slots ("A0\0A1\0").
  const keyNames: string[] = [];
  for (let o = 0x2c; o < 0x38; o += 3) {
    const k = cstr(b, o, o + 2);
    if (k) keyNames.push(k);
  }
  return {
    bin: cstr(b, 8, 0x15),
    pnt: cstr(b, 0x15, 0x22),
    keys: keyNames[0] || "",
    keyNames,
    fields,
    entries,
  };
}

function makeTextDecoder(label: string) {
  try {
    return new TextDecoder(label);
  } catch {
    return new TextDecoder("windows-1252");
  }
}
let dec = makeTextDecoder("windows-1252");
const utf8 = new TextDecoder("utf-8", { fatal: true });
/** Codepage for strings that are not UTF-8 (the current language's ANSI codepage). */
export function setCodepage(label: string) {
  dec = makeTextDecoder(label);
}
const str = (b: Uint8Array, s: number, e: number) => {
  let allAscii = true;
  for (let i = s; i < e; i++)
    if (b[i] > 0x7f) {
      allAscii = false;
      break;
    }
  if (allAscii) {
    let r = "";
    for (let i = s; i < e; i++) r += String.fromCharCode(b[i]);
    return r;
  }
  // Newer dictionaries are UTF-8; older tables use the language's ANSI codepage.
  try {
    return utf8.decode(b.subarray(s, e));
  } catch {
    return dec.decode(b.subarray(s, e));
  }
};

interface Cursor {
  p: number;
}
function scalar(b: Uint8Array, st: Cursor, f: Field): string | number {
  const s = f.size;
  switch (f.type) {
    case T_FIXSTR:
      st.p += s;
      return str(b, st.p - s, st.p);
    case T_INT:
    case T_INT32:
    case T_BYTE: {
      let v = 0;
      for (let i = s - 1; i >= 0; i--) v = v * 256 + b[st.p + i];
      st.p += s;
      return v;
    }
    case T_VARSTR: {
      const n = b[st.p];
      st.p += 1 + n;
      return str(b, st.p - n, st.p);
    }
    case T_VARINT: {
      const n = b[st.p];
      let v = 0;
      for (let i = n; i >= 1; i--) v = v * 256 + b[st.p + i];
      st.p += 1 + n;
      return v;
    }
    default:
      throw new Error(`unknown field type 0x${f.type.toString(16)} (${f.name})`);
  }
}

function entryValue(b: Uint8Array, st: Cursor, f: Entry) {
  if (f.group) {
    const cnt = b[st.p++];
    const els: Rec[] = [];
    for (let k = 0; k < cnt; k++) {
      const el: Rec = {};
      for (const m of f.group) el[m.name] = scalar(b, st, m);
      els.push(el);
    }
    return els;
  }
  if (f.level === LEVEL_LIST) {
    const cnt = b[st.p++];
    const vals: (string | number)[] = [];
    for (let k = 0; k < cnt; k++) vals.push(scalar(b, st, f));
    return vals;
  }
  return scalar(b, st, f);
}

export interface Decoded {
  rec: Rec;
  next: number;
}

// Record: u16 length, u8 bitmap byte count, bitmap (MSB-first over top-level entries),
// then each present entry: scalar | list (u8 count + scalars) | group (u8 count + member scalars).
export function decodeRecord(b: Uint8Array, p: number, fdt: Fdt): Decoded {
  const len = u16(b, p),
    end = p + 2 + len;
  const nb = b[p + 2],
    bm = p + 3;
  const st = { p: bm + nb };
  const rec: Rec = {};
  const E = fdt.entries;
  for (let i = 0; i < E.length; i++) {
    const byte = i >> 3;
    if (byte >= nb || !(b[bm + byte] & (0x80 >> (i & 7)))) continue;
    rec[E[i].name] = entryValue(b, st, E[i]);
  }
  return { rec, next: end };
}

// Some tables (rnr, notiz, tsxref) have no presence bitmap: every top-level entry is present.
export function decodeFlat(b: Uint8Array, p: number, fdt: Fdt): Decoded {
  const len = u16(b, p),
    end = p + 2 + len;
  const st = { p: p + 2 };
  const rec: Rec = {};
  for (const f of fdt.entries) rec[f.name] = entryValue(b, st, f);
  return { rec, next: end };
}

export function decodeAll(
  b: Uint8Array,
  fdt: Fdt,
  start = 0,
  stop = b.length,
  flat = false,
): Rec[] {
  const out: Rec[] = [];
  for (let p = start; p < stop;) {
    const { rec, next } = (flat ? decodeFlat : decodeRecord)(b, p, fdt);
    if (next <= p) break;
    out.push(rec);
    p = next;
  }
  return out;
}

export interface Pnt {
  keys: (string | number)[];
  offs: Uint32Array;
}
// .pnt: fixed entries of key bytes + u32 offset. keyLen = size of the first key field.
export function parsePnt(b: Uint8Array, keyLen: number, numericKey = false): Pnt {
  const w = keyLen + 4,
    n = Math.floor(b.length / w);
  const keys: (string | number)[] = [],
    offs = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * w;
    keys[i] = numericKey ? u32(b, p) : cstr(b, p, p + keyLen);
    offs[i] = u32(b, p + keyLen);
  }
  return { keys, offs };
}

export interface NumIndex {
  find(k: number): number;
}
// Sorted numeric index (e.g. text-id -> offset) with binary search.
export function numIndex(b: Uint8Array): NumIndex {
  const n = b.length >> 3,
    keys = new Uint32Array(n),
    offs = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    keys[i] = u32(b, i * 8);
    offs[i] = u32(b, i * 8 + 4);
  }
  return {
    find(k) {
      let lo = 0,
        hi = n - 1;
      while (lo <= hi) {
        const m = (lo + hi) >> 1;
        if (keys[m] === k) return offs[m];
        if (keys[m] < k) lo = m + 1;
        else hi = m - 1;
      }
      return -1;
    },
  };
}
