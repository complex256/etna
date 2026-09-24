// Graphic navigation pictures (Categories/<ref><view>.zgd): a gzip container with 128x128 zlib
// tiles of 3-bit shading and a vector section whose text elements are category text ids.
import { u32 } from "./records";

export interface NavLabel {
  /** Category text id (5 digits). */
  id: number;
  x: number;
  y: number;
}
export interface NavPicture {
  width: number;
  height: number;
  /** One byte per pixel, shading 0 (ink) … 7 (paper). */
  gray: Uint8Array;
  labels: NavLabel[];
}

async function inflateStream(bytesIn: Uint8Array, format: CompressionFormat, expected?: number) {
  const stream = new Blob([bytesIn as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new DecompressionStream(format));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let n = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      n += value.length;
      if (expected && n >= expected) break;
    }
  } catch (e) {
    // Trailing bytes after a zlib tile raise an error once the data is complete; keep what we have.
    if (!n) throw e;
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

// Header at 0x90 (width/height @0xb8), tile offset table @0x138 (relative to a base that makes the
// first entry land on the first zlib stream), 128x128 8-bit tiles (palette 0-7), then a vector
// section whose text elements carry 5-digit category ids at (x, height - y).
export async function decodeZgd(src: Uint8Array): Promise<NavPicture> {
  const b = await inflateStream(src, "gzip");
  const at = (p: number) => u32(b, p);
  const W = at(0xb8),
    H = at(0xbc),
    T = 128;
  const cols = Math.ceil(W / T),
    rows = Math.ceil(H / T),
    n = cols * rows;
  let first = -1;
  for (let i = 0x138 + 4 * n; i < b.length - 1; i++)
    if (b[i] === 0x78 && (b[i + 1] === 0x9c || b[i + 1] === 0xda || b[i + 1] === 0x01)) {
      first = i;
      break;
    }
  if (first < 0) throw new Error("No image data in navigation picture");
  const base = first - at(0x138);
  const offs = Array.from({ length: n }, (_, t) => at(0x138 + 4 * t) + base);
  const sorted = [...offs].sort((a, c) => a - c);
  const px = new Uint8Array(W * H).fill(7);
  await Promise.all(
    offs.map(async (off, t) => {
      const next = sorted.find((o) => o > off) || b.length;
      const tx = t % cols,
        ty = Math.floor(t / cols),
        tw = Math.min(T, W - tx * T),
        th = Math.min(T, H - ty * T);
      const d = await inflateStream(b.subarray(off, next), "deflate", tw * th);
      for (let y = 0; y < th; y++)
        px.set(d.subarray(y * tw, (y + 1) * tw), (ty * T + y) * W + tx * T);
    }),
  );
  const labels: NavLabel[] = [];
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  for (let s = 0x28; s < b.length - 6; s++) {
    if (b[s + 5] !== 0) continue;
    let digits = true;
    for (let k = 0; k < 5; k++)
      if (b[s + k] < 0x30 || b[s + k] > 0x39) {
        digits = false;
        break;
      }
    if (!digits) continue;
    // Text element: anchor (x, y) at s-0x24, repeated at s-8.
    if (s < 0x24 || at(s - 8) !== at(s - 0x24)) continue;
    const x = dv.getFloat32(s - 0x24, true),
      y = dv.getFloat32(s - 0x20, true);
    if (!(x >= 0 && x <= W && y >= 0 && y <= H)) continue;
    labels.push({ id: +String.fromCharCode(...b.subarray(s, s + 5)), x, y: H - y });
  }
  return { width: W, height: H, gray: px, labels };
}

export interface PinBox {
  /** Anchor in picture pixels. */
  x: number;
  y: number;
  /** Label size in screen pixels. */
  w: number;
  h: number;
}
export interface PinPlacement {
  /** Label offset from its anchor, in screen pixels (top-left corner). */
  left: number;
  top: number;
  /** Leader line from the anchor to the label centre. */
  len: number;
  angle: number;
}

// Greedy label placement: top to bottom, each label takes the nearest candidate position (centred,
// then stepping up/down/sideways/diagonally) that does not overlap a label already placed.
export function layoutPins(pins: PinBox[], scale: number): PinPlacement[] {
  const GAP = 3;
  const placed: { x: number; y: number; w: number; h: number }[] = [];
  const hits = (b: { x: number; y: number; w: number; h: number }) =>
    placed.some(
      (o) =>
        b.x < o.x + o.w + GAP &&
        o.x < b.x + b.w + GAP &&
        b.y < o.y + o.h + GAP &&
        o.y < b.y + b.h + GAP,
    );
  const out: PinPlacement[] = [];
  const order = pins.map((p, i) => ({ p, i })).sort((a, b) => a.p.y - b.p.y || a.p.x - b.p.x);
  for (const { p, i } of order) {
    const ax = p.x * scale,
      ay = p.y * scale;
    const stepY = p.h + GAP,
      stepX = p.w / 2 + 8;
    const cands: [number, number][] = [[0, 0]];
    for (let r = 1; r <= 10; r++) {
      cands.push(
        [0, -r * stepY],
        [0, r * stepY],
        [r * stepX, 0],
        [-r * stepX, 0],
        [r * stepX, -r * stepY],
        [-r * stepX, -r * stepY],
        [r * stepX, r * stepY],
        [-r * stepX, r * stepY],
      );
    }
    cands.sort((a, b) => Math.hypot(a[0], a[1] * 1.6) - Math.hypot(b[0], b[1] * 1.6));
    let best = cands[0];
    for (const c of cands) {
      const box = { x: ax + c[0] - p.w / 2, y: ay + c[1] - p.h / 2, w: p.w, h: p.h };
      if (!hits(box)) {
        best = c;
        break;
      }
    }
    placed.push({ x: ax + best[0] - p.w / 2, y: ay + best[1] - p.h / 2, w: p.w, h: p.h });
    out[i] = {
      left: best[0] - p.w / 2,
      top: best[1] - p.h / 2,
      len: Math.hypot(best[0], best[1]),
      angle: Math.atan2(best[1], best[0]),
    };
  }
  return out;
}
