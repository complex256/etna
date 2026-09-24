// Catalog illustrations: obfuscated TIFFs with CCITT Group 4 (T.6) strips and hotspots in tag 65024.
import { cstr, u16, u32 } from "./records";

export interface Hotspot {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}
export interface Illustration {
  width: number;
  height: number;
  /** 1 bit per pixel, MSB first, 1 = ink. */
  bits: Uint8Array;
  hotspots: Hotspot[];
  dpi: number;
}

const WHITE_TERM =
  "00110101 000111 0111 1000 1011 1100 1110 1111 10011 10100 00111 01000 001000 000011 110100 110101 101010 101011 0100111 0001100 0001000 0010111 0000011 0000100 0101000 0101011 0010011 0100100 0011000 00000010 00000011 00011010 00011011 00010010 00010011 00010100 00010101 00010110 00010111 00101000 00101001 00101010 00101011 00101100 00101101 00000100 00000101 00001010 00001011 01010010 01010011 01010100 01010101 00100100 00100101 01011000 01011001 01011010 01011011 01001010 01001011 00110010 00110011 00110100";
const WHITE_MAKEUP =
  "11011 10010 010111 0110111 00110110 00110111 01100100 01100101 01101000 01100111 011001100 011001101 011010010 011010011 011010100 011010101 011010110 011010111 011011000 011011001 011011010 011011011 010011000 010011001 010011010 011000 010011011";
const BLACK_TERM =
  "0000110111 010 11 10 011 0011 0010 00011 000101 000100 0000100 0000101 0000111 00000100 00000111 000011000 0000010111 0000011000 0000001000 00001100111 00001101000 00001101100 00000110111 00000101000 00000010111 00000011000 000011001010 000011001011 000011001100 000011001101 000001101000 000001101001 000001101010 000001101011 000011010010 000011010011 000011010100 000011010101 000011010110 000011010111 000001101100 000001101101 000011011010 000011011011 000001010100 000001010101 000001010110 000001010111 000001100100 000001100101 000001010010 000001010011 000000100100 000000110111 000000111000 000000100111 000000101000 000001011000 000001011001 000000101011 000000101100 000001011010 000001100110 000001100111";
const BLACK_MAKEUP =
  "0000001111 000011001000 000011001001 000001011011 000000110011 000000110100 000000110101 0000001101100 0000001101101 0000001001010 0000001001011 0000001001100 0000001001101 0000001110010 0000001110011 0000001110100 0000001110101 0000001110110 0000001110111 0000001010010 0000001010011 0000001010100 0000001010101 0000001011010 0000001011011 0000001100100 0000001100101";
const EXT_MAKEUP =
  "00000001000 00000001100 00000001101 000000010010 000000010011 000000010100 000000010101 000000010110 000000010111 000000011100 000000011101 000000011110 000000011111";

// Lookup keyed by (len << 16 | code).
function runTable(term: string, makeup: string) {
  const m = new Map<number, number>();
  const add = (s: string, v: number) => m.set((s.length << 16) | parseInt(s, 2), v);
  term.split(" ").forEach((s, i) => add(s, i));
  makeup.split(" ").forEach((s, i) => add(s, 64 * (i + 1)));
  EXT_MAKEUP.split(" ").forEach((s, i) => add(s, 1792 + 64 * i));
  return m;
}
const WHITE = runTable(WHITE_TERM, WHITE_MAKEUP),
  BLACK = runTable(BLACK_TERM, BLACK_MAKEUP);

const M_PASS = "P",
  M_HORIZ = "H",
  M_EXT = "X",
  M_EOL = "E";
type Mode = number | typeof M_PASS | typeof M_HORIZ | typeof M_EXT | typeof M_EOL;
// 2D mode codes -> vertical offset or mode tag
const MODES = new Map<number, Mode>(
  (
    [
      ["1", 0],
      ["011", 1],
      ["000011", 2],
      ["0000011", 3],
      ["010", -1],
      ["000010", -2],
      ["0000010", -3],
      ["0001", M_PASS],
      ["001", M_HORIZ],
      ["0000001", M_EXT],
      ["000000000001", M_EOL],
    ] as [string, Mode][]
  ).map(([s, v]) => [(s.length << 16) | parseInt(s, 2), v]),
);

function fill(out: Uint8Array, rowOff: number, x0: number, x1: number) {
  for (let x = x0; x < x1; x++) out[rowOff + (x >> 3)] |= 0x80 >> (x & 7);
}

export function decodeG4(
  data: Uint8Array,
  width: number,
  height: number,
  lsbFirst: boolean,
): Uint8Array {
  const bytesPerRow = (width + 7) >> 3;
  const out = new Uint8Array(bytesPerRow * height); // 1 = black, MSB-first
  let pos = 0,
    bit = 0;
  const byteAt = (i: number) => {
    if (i >= data.length) return 0;
    const v = data[i];
    if (!lsbFirst) return v;
    let r = 0;
    for (let k = 0; k < 8; k++) r |= ((v >> k) & 1) << (7 - k);
    return r;
  };
  const readBit = () => {
    const v = (byteAt(pos) >> (7 - bit)) & 1;
    if (++bit === 8) {
      bit = 0;
      pos++;
    }
    return v;
  };
  function readCode<T>(table: Map<number, T>, maxLen: number): T | null {
    let code = 0;
    for (let len = 1; len <= maxLen; len++) {
      code = (code << 1) | readBit();
      const v = table.get((len << 16) | code);
      if (v !== undefined) return v;
    }
    return null;
  }
  const readRun = (color: number) => {
    let total = 0;
    for (;;) {
      const v = readCode(color ? BLACK : WHITE, 13);
      if (v === null) throw new Error("bad run code");
      total += v;
      if (v < 64) return total;
    }
  };

  let ref = [width, width];
  for (let y = 0; y < height; y++) {
    const cur: number[] = [];
    let a0 = -1,
      color = 0,
      bi = 0;
    while (a0 < width) {
      const mode = readCode(MODES, 12);
      if (mode === null || mode === M_EOL || mode === M_EXT) {
        if (mode === M_EOL) {
          y = height;
          break;
        }
        throw new Error(`G4 decode error at row ${y}`);
      }
      // b1: first changing element on ref line right of a0 with color opposite to `color`.
      while (bi > 0 && ref[bi - 1] > a0) bi--;
      while (ref[bi] <= a0 || (bi & 1) !== color) {
        bi++;
        if (bi >= ref.length) {
          bi = ref.length - 1;
          break;
        }
      }
      const b1 = ref[bi],
        b2 = ref[Math.min(bi + 1, ref.length - 1)];
      if (mode === M_PASS) {
        if (color) fill(out, y * bytesPerRow, Math.max(a0, 0), b2);
        a0 = b2;
      } else if (mode === M_HORIZ) {
        const start = Math.max(a0, 0);
        const r1 = readRun(color),
          r2 = readRun(color ^ 1);
        const a1 = Math.min(start + r1, width),
          a2 = Math.min(a1 + r2, width);
        if (color) fill(out, y * bytesPerRow, start, a1);
        else fill(out, y * bytesPerRow, a1, a2);
        cur.push(a1, a2);
        a0 = a2;
      } else {
        const a1 = Math.min(Math.max(b1 + (mode as number), 0), width);
        if (color) fill(out, y * bytesPerRow, Math.max(a0, 0), a1);
        cur.push(a1);
        a0 = a1;
        color ^= 1;
      }
    }
    cur.push(width, width);
    ref = cur;
  }
  return out;
}

// Illustration .tif: whole file XOR 0x0b with a scrambled first byte. Plain TIFFs pass through.
function deobfuscateTiff(src: Uint8Array) {
  const b = new Uint8Array(src);
  const plain = (b[0] === 0x49 && b[1] === 0x49) || (b[0] === 0x4d && b[1] === 0x4d);
  if (!plain) {
    for (let i = 0; i < b.length; i++) b[i] ^= 0x0b;
    b[0] = b[1];
  }
  return b;
}

interface Tag {
  type: number;
  cnt: number;
  vp: number;
  vals: number[];
}

export function parseTiff(src: Uint8Array): Illustration {
  const b = deobfuscateTiff(src);
  const le = b[0] === 0x49;
  const r16 = (p: number) => (le ? u16(b, p) : (b[p] << 8) | b[p + 1]);
  const r32 = (p: number) =>
    le ? u32(b, p) : ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0;
  const ifd = r32(4),
    n = r16(ifd);
  const tags: Record<number, Tag> = {};
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + 12 * i,
      tag = r16(e),
      type = r16(e + 2),
      cnt = r32(e + 4);
    const size = ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1 } as Record<number, number>)[type] || 1;
    const vp = size * cnt <= 4 ? e + 8 : r32(e + 8);
    const vals: number[] = [];
    if (type === 3) for (let k = 0; k < Math.min(cnt, 4096); k++) vals.push(r16(vp + 2 * k));
    else if (type === 4) for (let k = 0; k < Math.min(cnt, 4096); k++) vals.push(r32(vp + 4 * k));
    tags[tag] = { type, cnt, vp, vals };
  }
  const val = (t: number, d?: number) => (tags[t] ? tags[t].vals[0] : d) as number;
  const width = val(256),
    height = val(257),
    compression = val(259, 1);
  const photometric = val(262, 0),
    fillOrder = val(266, 1);
  const offs = tags[273].vals,
    counts = tags[279].vals;
  const rowsPerStrip = val(278, height);
  const bytesPerRow = (width + 7) >> 3;
  const bits = new Uint8Array(bytesPerRow * height);
  for (let s = 0; s < offs.length; s++) {
    const rows = Math.min(rowsPerStrip, height - s * rowsPerStrip);
    const data = b.subarray(offs[s], offs[s] + counts[s]);
    let strip: Uint8Array;
    if (compression === 4) strip = decodeG4(data, width, rows, fillOrder === 2);
    else if (compression === 1) strip = data;
    else throw new Error(`unsupported TIFF compression ${compression}`);
    bits.set(strip.subarray(0, bytesPerRow * rows), s * rowsPerStrip * bytesPerRow);
  }
  // min-is-black stores black as 0; normalize so 1 = ink.
  if (photometric === 1) for (let i = 0; i < bits.length; i++) bits[i] ^= 0xff;
  const hotspots: Hotspot[] = [];
  if (tags[65024]) {
    let p = tags[65024].vp;
    for (let k = 0; k < tags[65024].cnt && p + 12 <= b.length; k++) {
      const len = u16(b, p);
      if (len < 12) break;
      const nl = b[p + 10];
      hotspots.push({
        x: u16(b, p + 2),
        y: u16(b, p + 4),
        w: u16(b, p + 6),
        h: u16(b, p + 8),
        label: cstr(b, p + 11, p + 11 + nl),
      });
      p += len;
    }
  }
  const dpi = tags[282] ? r32(tags[282].vp) / (r32(tags[282].vp + 4) || 1) : 300;
  return { width, height, bits, hotspots, dpi };
}

/** Thumbnails (minis/*.png) and part photos: same XOR 0x0b obfuscation; plain PNG/JPEG pass through. */
export function deobfuscateImage(src: Uint8Array): { bytes: Uint8Array; type: string } {
  const b = new Uint8Array(src);
  const plain = (b[0] === 0x89 && b[1] === 0x50) || (b[0] === 0xff && b[1] === 0xd8);
  if (!plain) for (let i = 0; i < b.length; i++) b[i] ^= 0x0b;
  return { bytes: b, type: b[0] === 0xff ? "image/jpeg" : "image/png" };
}
