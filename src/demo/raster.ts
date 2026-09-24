// A tiny rasterizer for the demo drawings: one byte per pixel (the value is ink for line drawings,
// or a 0-7 shade for navigation pictures), thick strokes, fills and a 5x7 digit font.

export type Pt = [number, number];

export class Raster {
  readonly w: number;
  readonly h: number;
  readonly px: Uint8Array;
  constructor(w: number, h: number, background = 0) {
    this.w = w;
    this.h = h;
    this.px = new Uint8Array(w * h).fill(background);
  }

  set(x: number, y: number, v: number) {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = v;
  }
  /** A filled disc (the brush of thick strokes). */
  dot(cx: number, cy: number, r: number, v: number) {
    if (r <= 0.7) return this.set(cx, cy, v);
    const r2 = r * r;
    for (let y = Math.floor(-r); y <= Math.ceil(r); y++)
      for (let x = Math.floor(-r); x <= Math.ceil(r); x++)
        if (x * x + y * y <= r2) this.set(cx + x, cy + y, v);
  }
  line(a: Pt, b: Pt, width: number, v: number, dash = 0) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.max(1, Math.ceil(len));
    for (let i = 0; i <= steps; i++) {
      if (dash && Math.floor(i / dash) % 2) continue;
      const t = i / steps;
      this.dot(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, width / 2, v);
    }
  }
  polyline(pts: Pt[], width: number, v: number, closed = false) {
    for (let i = 0; i + 1 < pts.length; i++) this.line(pts[i], pts[i + 1], width, v);
    if (closed && pts.length > 2) this.line(pts[pts.length - 1], pts[0], width, v);
  }
  /** Even-odd scanline fill. */
  fill(pts: Pt[], v: number) {
    const ys = pts.map((p) => p[1]);
    const y0 = Math.max(0, Math.floor(Math.min(...ys))),
      y1 = Math.min(this.h - 1, Math.ceil(Math.max(...ys)));
    for (let y = y0; y <= y1; y++) {
      const yc = y + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i],
          [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= yc && by > yc) || (by <= yc && ay > yc))
          xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (
          let x = Math.max(0, Math.ceil(xs[k] - 0.5));
          x <= Math.min(this.w - 1, Math.floor(xs[k + 1] - 0.5));
          x++
        )
          this.px[y * this.w + x] = v;
    }
  }
  shape(pts: Pt[], stroke: number, v: number, fillV?: number) {
    if (fillV !== undefined) this.fill(pts, fillV);
    this.polyline(pts, stroke, v, true);
  }
  ellipse(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    stroke: number,
    v: number,
    fillV?: number,
    rot = 0,
  ) {
    this.shape(ellipsePts(cx, cy, rx, ry, rot), stroke, v, fillV);
  }
  circle(cx: number, cy: number, r: number, stroke: number, v: number, fillV?: number) {
    this.ellipse(cx, cy, r, r, stroke, v, fillV);
  }
  roundRect(
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    stroke: number,
    v: number,
    fillV?: number,
  ) {
    this.shape(roundRectPts(x, y, w, h, r), stroke, v, fillV);
  }
  /** Digits and a few letters in a 5x7 grid, `scale` pixels per cell; returns the width drawn. */
  text(x: number, y: number, s: string, scale: number, v: number) {
    let cx = x;
    for (const ch of s) {
      const g = FONT[ch];
      if (g)
        for (let r = 0; r < 7; r++)
          for (let c = 0; c < 5; c++)
            if (g[r] & (0x10 >> c)) this.block(cx + c * scale, y + r * scale, scale, v);
      cx += 6 * scale;
    }
    return cx - x - scale;
  }
  private block(x: number, y: number, s: number, v: number) {
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) this.set(x + i, y + j, v);
  }
}

export function ellipsePts(cx: number, cy: number, rx: number, ry: number, rot = 0, n = 96): Pt[] {
  const c = Math.cos(rot),
    s = Math.sin(rot);
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    const x = Math.cos(t) * rx,
      y = Math.sin(t) * ry;
    return [cx + x * c - y * s, cy + x * s + y * c];
  });
}
export function roundRectPts(x: number, y: number, w: number, h: number, r: number): Pt[] {
  r = Math.min(r, w / 2, h / 2);
  const pts: Pt[] = [];
  const arc = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i <= 8; i++) {
      const a = a0 + (i / 8) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  };
  arc(x + w - r, y + r, -Math.PI / 2);
  arc(x + w - r, y + h - r, 0);
  arc(x + r, y + h - r, Math.PI / 2);
  arc(x + r, y + r, Math.PI);
  return pts;
}

/** Packs ink pixels (non-zero) into 1-bit rows, MSB first. */
export function packBits(r: Raster): Uint8Array {
  const bpr = (r.w + 7) >> 3;
  const out = new Uint8Array(bpr * r.h);
  for (let y = 0; y < r.h; y++)
    for (let x = 0; x < r.w; x++) if (r.px[y * r.w + x]) out[y * bpr + (x >> 3)] |= 0x80 >> (x & 7);
  return out;
}
/** Area-averaged grayscale thumbnail of a line drawing (255 paper … 0 ink). */
export function thumbnail(
  r: Raster,
  maxW: number,
  maxH: number,
): { w: number; h: number; gray: Uint8Array } {
  const s = Math.max(r.w / maxW, r.h / maxH);
  const w = Math.round(r.w / s),
    h = Math.round(r.h / s);
  const gray = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let ink = 0,
        n = 0;
      for (let sy = Math.floor(y * s); sy < Math.floor((y + 1) * s); sy++)
        for (let sx = Math.floor(x * s); sx < Math.floor((x + 1) * s); sx++, n++)
          ink += r.px[sy * r.w + sx] ? 1 : 0;
      // Thin lines vanish when averaged; darken so the thumbnail stays readable.
      gray[y * w + x] = Math.round(255 * (1 - Math.min(1, (ink / Math.max(n, 1)) * 6)));
    }
  return { w, h, gray };
}

// 5x7 glyphs, one row per number, bit 4 = leftmost column.
const FONT: Record<string, number[]> = {
  "0": [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  "1": [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  "2": [0x0e, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1f],
  "3": [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  "4": [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  "5": [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  "6": [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  "7": [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  "8": [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  "9": [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  "-": [0x00, 0x00, 0x00, 0x1f, 0x00, 0x00, 0x00],
  "(": [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
  ")": [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
};
