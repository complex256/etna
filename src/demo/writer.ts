// Encoders for the dump formats, the inverse of src/lib/format: table definitions (.fdt), records
// (.BIN, with or without a presence bitmap), key indexes (.pnt), plain TIFFs with hotspots, PNGs
// and navigation pictures (.zgd). Used to build the demo catalog in the browser and in tests.

const T_FIXSTR = 0x12,
  T_INT = 0x16,
  T_VARSTR = 0x22;

export interface FieldSpec {
  name: string;
  /** "fix": fixed-width string of `size`; "str": short string; "int": 32-bit integer. */
  type: "fix" | "str" | "int";
  size?: number;
  /** A counted list of this scalar. */
  list?: boolean;
  /** A counted list of groups with these member scalars. */
  group?: FieldSpec[];
}
export interface TableSpec {
  fields: FieldSpec[];
  /** Key field names (composite keys are concatenated in the .pnt). */
  keys?: string[];
  /** No presence bitmap: every field is written in every record. */
  flat?: boolean;
}

type Value = string | number;
export type Row = Record<string, Value | Value[] | Record<string, Value>[] | undefined>;

class Bytes {
  private buf = new Uint8Array(1024);
  length = 0;
  private grow(n: number) {
    if (this.length + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.length + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.length));
    this.buf = next;
  }
  u8(v: number) {
    this.grow(1);
    this.buf[this.length++] = v & 0xff;
  }
  u16(v: number) {
    this.u8(v);
    this.u8(v >> 8);
  }
  u32(v: number) {
    this.u16(v & 0xffff);
    this.u16((v >>> 16) & 0xffff);
  }
  bytes(b: Uint8Array) {
    this.grow(b.length);
    this.buf.set(b, this.length);
    this.length += b.length;
  }
  ascii(s: string, size = s.length, pad = " ") {
    const t = s.padEnd(size, pad).slice(0, size);
    for (let i = 0; i < size; i++) this.u8(t.charCodeAt(i));
  }
  done() {
    return this.buf.slice(0, this.length);
  }
}

const sizeOf = (f: FieldSpec) => (f.type === "int" ? 4 : f.type === "fix" ? f.size! : 255);
const typeOf = (f: FieldSpec) =>
  f.type === "int" ? T_INT : f.type === "fix" ? T_FIXSTR : T_VARSTR;

/** The .fdt for a table: 13-byte field entries after a 0x38-byte header. */
export function writeFdt(t: TableSpec, bin: string, pnt = ""): Uint8Array {
  const flat: { f: FieldSpec; level: number; members: number }[] = [];
  for (const f of t.fields) {
    if (f.group) {
      flat.push({ f, level: 1, members: f.group.length });
      for (const m of f.group) flat.push({ f: m, level: 0, members: 0 });
    } else flat.push({ f, level: f.list ? 2 : 0, members: 0 });
  }
  const b = new Bytes();
  b.u16(0x4644);
  b.u16(t.fields.length);
  b.u16(flat.length);
  b.u16(0);
  b.ascii(bin, 0x15 - 8, "\0");
  b.ascii(pnt, 0x22 - 0x15, "\0");
  while (b.length < 0x2c) b.u8(0);
  for (let i = 0; i < 4; i++) b.ascii(t.keys?.[i] ?? "", 3, "\0");
  for (const { f, level, members } of flat) {
    b.ascii(f.name, 2);
    b.u8(0);
    b.u16(f.group ? 0 : sizeOf(f));
    b.u16(1);
    b.u16(level);
    b.u16(members);
    b.u16(f.group ? 0 : typeOf(f));
  }
  return b.done();
}

function scalar(b: Bytes, f: FieldSpec, v: Value) {
  if (f.type === "int") b.u32(Number(v));
  else if (f.type === "fix") b.ascii(String(v), f.size);
  else {
    const s = String(v).slice(0, 255);
    b.u8(s.length);
    b.ascii(s);
  }
}
function entry(b: Bytes, f: FieldSpec, v: NonNullable<Row[string]>) {
  if (f.group) {
    const els = v as Record<string, Value>[];
    b.u8(els.length);
    for (const el of els)
      for (const m of f.group) scalar(b, m, el[m.name] ?? (m.type === "int" ? 0 : ""));
  } else if (f.list) {
    const vals = v as Value[];
    b.u8(vals.length);
    for (const x of vals) scalar(b, f, x);
  } else scalar(b, f, v as Value);
}

/** One record: u16 length, then a presence bitmap (unless flat) and the present fields. */
export function writeRecord(t: TableSpec, row: Row): Uint8Array {
  const body = new Bytes();
  if (!t.flat) {
    const nb = Math.ceil(t.fields.length / 8);
    const bits = new Uint8Array(nb);
    t.fields.forEach((f, i) => {
      if (row[f.name] !== undefined) bits[i >> 3] |= 0x80 >> (i & 7);
    });
    body.u8(nb);
    body.bytes(bits);
  }
  for (const f of t.fields) {
    const v = row[f.name];
    if (v !== undefined) entry(body, f, v);
    else if (t.flat) entry(body, f, f.group || f.list ? [] : f.type === "int" ? 0 : "");
  }
  const out = new Bytes();
  const inner = body.done();
  out.u16(inner.length);
  out.bytes(inner);
  return out.done();
}

export interface WrittenTable {
  fdt: Uint8Array;
  bin: Uint8Array;
  /** Byte offset of each row in `bin`. */
  offsets: number[];
}
export function writeTable(t: TableSpec, rows: Row[], binName: string, pntName = ""): WrittenTable {
  const b = new Bytes();
  const offsets: number[] = [];
  for (const r of rows) {
    offsets.push(b.length);
    b.bytes(writeRecord(t, r));
  }
  return { fdt: writeFdt(t, binName, pntName), bin: b.done(), offsets };
}

/** Sorted key index: fixed-width key bytes + u32 offset per entry. */
export function writePnt(entries: { key: string; offset: number }[], keyLen: number): Uint8Array {
  const b = new Bytes();
  for (const e of [...entries].sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0))) {
    b.ascii(e.key, keyLen);
    b.u32(e.offset);
  }
  return b.done();
}
/** Sorted numeric index (text id -> offset). */
export function writeNumIndex(entries: { key: number; offset: number }[]): Uint8Array {
  const b = new Bytes();
  for (const e of [...entries].sort((x, y) => x.key - y.key)) {
    b.u32(e.key);
    b.u32(e.offset);
  }
  return b.done();
}

/* ---------------- images ---------------- */

export interface HotspotBox {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

/**
 * Plain little-endian TIFF: 1 bit per pixel (1 = ink, WhiteIsZero), uncompressed, one strip,
 * with hotspot records in tag 65024.
 */
export function writeTiff(
  width: number,
  height: number,
  bits: Uint8Array,
  hotspots: HotspotBox[],
): Uint8Array {
  const hs = new Bytes();
  for (const h of hotspots) {
    hs.u16(11 + h.label.length + 1);
    hs.u16(h.x);
    hs.u16(h.y);
    hs.u16(h.w);
    hs.u16(h.h);
    hs.u8(h.label.length);
    hs.ascii(h.label);
    hs.u8(0);
  }
  hs.u16(0);
  const hotspotBytes = hs.done();
  const tags: [number, number, number, number][] = []; // tag, type, count, value (or offset)
  const nTags = 9;
  const ifdSize = 2 + nTags * 12 + 4;
  const dataStart = 8 + ifdSize;
  const resOffset = dataStart;
  const hsOffset = resOffset + 8;
  const stripOffset = hsOffset + hotspotBytes.length;
  tags.push(
    [256, 4, 1, width],
    [257, 4, 1, height],
    [258, 3, 1, 1],
    [259, 3, 1, 1],
    [262, 3, 1, 0],
  );
  tags.push([273, 4, 1, stripOffset], [278, 4, 1, height], [279, 4, 1, bits.length]);
  tags.push([65024, 7, hotspotBytes.length, hsOffset]);
  const b = new Bytes();
  b.ascii("II");
  b.u16(42);
  b.u32(8);
  b.u16(nTags);
  for (const [tag, type, count, value] of tags) {
    b.u16(tag);
    b.u16(type);
    b.u32(count);
    if (type === 3) {
      b.u16(value);
      b.u16(0);
    } else b.u32(value);
  }
  b.u32(0);
  b.u32(150);
  b.u32(1);
  b.bytes(hotspotBytes);
  b.bytes(bits);
  return b.done();
}

async function compress(data: Uint8Array, format: CompressionFormat): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new CompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(parts: Uint8Array[]) {
  let c = 0xffffffff;
  for (const p of parts) for (let i = 0; i < p.length; i++) c = CRC[(c ^ p[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** 8-bit grayscale PNG. */
export async function writePng(
  width: number,
  height: number,
  gray: Uint8Array,
): Promise<Uint8Array> {
  const raw = new Uint8Array((width + 1) * height);
  for (let y = 0; y < height; y++)
    raw.set(gray.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  const be32 = (v: number) =>
    new Uint8Array([v >>> 24, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff]);
  const b = new Bytes();
  const chunk = (type: string, data: Uint8Array) => {
    const t = new TextEncoder().encode(type);
    b.bytes(be32(data.length));
    b.bytes(t);
    b.bytes(data);
    b.bytes(be32(crc32([t, data])));
  };
  b.bytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  chunk("IHDR", new Uint8Array([...be32(width), ...be32(height), 8, 0, 0, 0, 0]));
  chunk("IDAT", await compress(raw, "deflate"));
  chunk("IEND", new Uint8Array(0));
  return b.done();
}

export interface NavLabelSpec {
  /** 5-digit category text id. */
  id: number;
  x: number;
  y: number;
}
/**
 * Navigation picture: gzip of a header (size at 0xb8), a tile offset table at 0x138, 128x128
 * zlib tiles of 3-bit shading (0 ink … 7 paper), then text elements carrying category ids.
 */
export async function writeZgd(
  width: number,
  height: number,
  shade: Uint8Array,
  labels: NavLabelSpec[],
) {
  const T = 128;
  const cols = Math.ceil(width / T),
    rows = Math.ceil(height / T);
  const tiles: Uint8Array[] = [];
  for (let ty = 0; ty < rows; ty++)
    for (let tx = 0; tx < cols; tx++) {
      const tw = Math.min(T, width - tx * T),
        th = Math.min(T, height - ty * T);
      const raw = new Uint8Array(tw * th);
      for (let y = 0; y < th; y++)
        raw.set(
          shade.subarray((ty * T + y) * width + tx * T, (ty * T + y) * width + tx * T + tw),
          y * tw,
        );
      tiles.push(await compress(raw, "deflate"));
    }
  const b = new Bytes();
  while (b.length < 0xb8) b.u8(0);
  b.u32(width);
  b.u32(height);
  while (b.length < 0x138) b.u8(0);
  let off = 0;
  for (const t of tiles) {
    b.u32(off);
    off += t.length;
  }
  for (const t of tiles) b.bytes(t);
  // Text elements: x and y (float32, y from the bottom) 0x24 bytes before the id; x again 8 before.
  const f32 = (v: number) => new Uint8Array(new Float32Array([v]).buffer);
  for (const l of labels) {
    const start = b.length;
    b.bytes(f32(l.x));
    b.bytes(f32(height - l.y));
    while (b.length < start + 0x1c) b.u8(0xff);
    b.bytes(f32(l.x));
    b.u32(0);
    b.ascii(String(l.id).padStart(5, "0"), 5);
    b.u8(0);
    b.u16(0);
  }
  b.u32(0);
  return compress(b.done(), "gzip");
}
