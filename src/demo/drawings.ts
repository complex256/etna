// Exploded-view drawings of the demo car's parts, and its navigation picture. Plain geometry:
// each function draws one part centred near (x, y).
import { ellipsePts, Raster, type Pt } from "./raster";

const INK = 1,
  PAPER = 0;
const S = 4, // outline
  D = 2; // detail

function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 48): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as Pt;
  });
}

export function bodyShell(r: Raster, x: number, y: number) {
  // Lower tub with a rounded nose, wheel arches and the door opening.
  const tub: Pt[] = [
    [x - 300, y + 90],
    ...arc(x - 300, y + 20, 40, 70, Math.PI / 2, Math.PI * 1.5),
    [x - 150, y - 50],
    [x - 120, y - 110],
    [x + 150, y - 110],
    [x + 190, y - 40],
    [x + 290, y - 30],
    ...arc(x + 290, y + 30, 45, 60, -Math.PI / 2, Math.PI / 2),
  ];
  r.shape(tub, S, INK);
  for (const ax of [x - 180, x + 200]) {
    r.fill(arc(ax, y + 90, 70, 62, Math.PI, Math.PI * 2), PAPER);
    r.polyline(arc(ax, y + 90, 70, 62, Math.PI, Math.PI * 2), S, INK);
  }
  r.roundRect(x - 90, y - 90, 170, 150, 50, D, INK);
  r.circle(x + 300, y - 5, 18, D, INK);
  r.line([x - 120, y - 110], [x - 60, y - 190], D, INK);
  r.line([x + 150, y - 110], [x + 120, y - 190], D, INK);
  r.circle(x + 235, y - 55, 14, D, INK);
}
export function bumper(r: Raster, x: number, y: number, w: number) {
  r.roundRect(x - w / 2, y - 22, w, 44, 22, S, INK);
  r.line([x - w / 2 + 30, y], [x + w / 2 - 30, y], D, INK);
  r.circle(x - w / 2 + 40, y, 7, D, INK);
  r.circle(x + w / 2 - 40, y, 7, D, INK);
}
export function headlight(r: Raster, x: number, y: number) {
  r.circle(x, y, 42, S, INK);
  r.circle(x, y, 28, D, INK);
  r.circle(x, y, 10, D, INK);
  r.line([x - 42, y + 8], [x - 70, y + 20], D, INK);
}
export function roof(r: Raster, x: number, y: number) {
  const dome = arc(x, y, 280, 90, Math.PI, Math.PI * 2);
  r.shape([...dome, [x + 280, y + 22], [x - 280, y + 22]], S, INK);
  r.polyline(arc(x, y, 250, 70, Math.PI * 1.05, Math.PI * 1.95), D, INK);
  for (const dx of [-200, 200]) r.circle(x + dx, y + 8, 7, D, INK);
}
export function pillar(r: Raster, x: number, y: number, h: number) {
  r.roundRect(x - 14, y - h / 2, 28, h, 12, S, INK);
  r.ellipse(x, y - h / 2 + 8, 14, 6, D, INK);
}
export function door(r: Raster, x: number, y: number, flip = false) {
  r.shape(
    [
      [x - 90, y + 80],
      [x - 90, y - 40],
      ...arc(x, y - 40, 90, 70, Math.PI, Math.PI * 2),
      [x + 90, y + 80],
    ],
    S,
    INK,
  );
  r.ellipse(x, y - 35, 55, 40, D, INK);
  r.roundRect(x + (flip ? -40 : 40) - 18, y + 20, 36, 14, 7, D, INK);
}
export function wheel(r: Raster, x: number, y: number, R: number) {
  r.ellipse(x + R * 0.18, y, R * 0.42, R, S, INK);
  r.ellipse(x, y, R * 0.42, R, S, INK, PAPER);
  r.ellipse(x, y, R * 0.26, R * 0.62, D, INK);
  r.ellipse(x, y, R * 0.08, R * 0.2, D, INK);
  r.line([x, y - R], [x + R * 0.18, y - R], S, INK);
  r.line([x, y + R], [x + R * 0.18, y + R], S, INK);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    r.line(
      [x + Math.cos(a) * R * 0.36, y + Math.sin(a) * R * 0.86],
      [x + Math.cos(a) * R * 0.42, y + Math.sin(a) * R],
      D,
      INK,
    );
  }
}
export function hubcap(r: Raster, x: number, y: number, R: number) {
  r.circle(x, y, R, S, INK);
  const star: Pt[] = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? R * 0.35 : R * 0.8;
    return [x + Math.cos(a) * rr, y + Math.sin(a) * rr];
  });
  r.shape(star, D, INK);
}
export function axle(r: Raster, x: number, y: number, w: number) {
  r.roundRect(x - w / 2, y - 10, w, 20, 8, S, INK);
  for (const dx of [-w / 2, w / 2]) r.ellipse(x + dx, y, 6, 14, D, INK);
}
export function caster(r: Raster, x: number, y: number) {
  r.polyline(
    [
      [x - 45, y + 40],
      [x - 45, y - 30],
      [x + 45, y - 30],
      [x + 45, y + 40],
    ],
    S,
    INK,
  );
  r.roundRect(x - 12, y - 90, 24, 60, 8, S, INK);
  r.ellipse(x, y + 55, 22, 50, S, INK, PAPER);
  r.ellipse(x, y + 55, 8, 18, D, INK);
}
export function screw(r: Raster, x: number, y: number) {
  r.ellipse(x, y, 18, 8, S, INK);
  r.line([x - 8, y], [x + 8, y], D, INK);
  r.roundRect(x - 7, y + 6, 14, 44, 3, D, INK);
  for (let k = 0; k < 5; k++) r.line([x - 7, y + 14 + k * 7], [x + 7, y + 18 + k * 7], D, INK);
}
export function pin(r: Raster, x: number, y: number) {
  r.roundRect(x - 9, y - 40, 18, 80, 6, S, INK);
  r.ellipse(x, y - 40, 14, 6, D, INK);
}
export function fuelCap(r: Raster, x: number, y: number) {
  r.ellipse(x, y, 46, 20, S, INK);
  r.ellipse(x, y - 12, 46, 20, S, INK, PAPER);
  r.line([x - 20, y - 12], [x + 20, y - 12], S, INK);
}
export function cupHolder(r: Raster, x: number, y: number) {
  r.shape(
    [
      [x - 50, y - 30],
      [x + 50, y - 30],
      [x + 36, y + 50],
      [x - 36, y + 50],
    ],
    S,
    INK,
  );
  r.ellipse(x, y - 30, 50, 14, D, INK, PAPER);
  r.ellipse(x, y - 30, 38, 9, D, INK);
}
export function latch(r: Raster, x: number, y: number) {
  r.roundRect(x - 40, y - 16, 60, 32, 8, S, INK);
  r.polyline(
    [
      [x + 20, y - 8],
      [x + 50, y - 8],
      [x + 50, y + 18],
      [x + 36, y + 18],
    ],
    S,
    INK,
  );
}
export function steeringWheel(r: Raster, x: number, y: number, R: number) {
  r.ellipse(x, y, R, R * 0.8, S + 2, INK);
  r.ellipse(x, y, R * 0.8, R * 0.62, D, INK);
  r.ellipse(x, y, R * 0.3, R * 0.24, S, INK);
  for (const a of [Math.PI / 2, Math.PI * 1.17, Math.PI * 1.83])
    r.line(
      [x + Math.cos(a) * R * 0.3, y + Math.sin(a) * R * 0.24],
      [x + Math.cos(a) * R * 0.8, y + Math.sin(a) * R * 0.62],
      S,
      INK,
    );
}
export function hornButton(r: Raster, x: number, y: number, squeaky: boolean) {
  r.ellipse(x, y, 40, 16, S, INK);
  r.polyline(arc(x, y, 40, 34, Math.PI, Math.PI * 2), S, INK);
  if (squeaky)
    for (const k of [1, 2])
      r.polyline(
        arc(x, y - 10, 40 + k * 18, 34 + k * 18, Math.PI * 1.3, Math.PI * 1.7, 16),
        D,
        INK,
      );
}
export function column(r: Raster, x: number, y: number, h: number) {
  r.shape(
    [
      [x - 12, y - h / 2],
      [x + 12, y - h / 2],
      [x + 12, y + h / 2 - 20],
      [x - 12, y + h / 2],
    ],
    S,
    INK,
  );
}
export function toyKey(r: Raster, x: number, y: number) {
  r.circle(x - 40, y, 26, S, INK);
  r.circle(x - 40, y, 8, D, INK);
  r.polyline(
    [
      [x - 14, y - 8],
      [x + 60, y - 8],
      [x + 60, y + 8],
      [x + 44, y + 8],
      [x + 44, y + 18],
      [x + 30, y + 18],
      [x + 30, y + 8],
      [x - 14, y + 8],
    ],
    S,
    INK,
  );
}
export function seat(r: Raster, x: number, y: number) {
  r.shape(
    [
      [x - 130, y + 40],
      [x + 110, y + 40],
      [x + 130, y],
      [x - 100, y],
    ],
    S,
    INK,
  );
  r.shape(
    [
      [x - 100, y],
      [x - 130, y - 170],
      [x - 70, y - 170],
      [x - 40, y],
    ],
    S,
    INK,
  );
  r.line([x - 90, y - 150], [x - 70, y - 20], D, INK);
}
export function floorboard(r: Raster, x: number, y: number) {
  r.shape(
    [
      [x - 200, y + 40],
      [x + 160, y + 40],
      [x + 200, y - 40],
      [x - 160, y - 40],
    ],
    S,
    INK,
  );
  for (let k = -150; k <= 150; k += 50) r.line([x + k - 20, y + 28], [x + k + 20, y - 28], D, INK);
}
export function plug(r: Raster, x: number, y: number) {
  r.ellipse(x, y, 20, 9, S, INK);
  r.roundRect(x - 12, y, 24, 26, 5, D, INK);
}
export function pushHandle(r: Raster, x: number, y: number) {
  const path: Pt[] = [
    [x - 200, y + 120],
    [x - 60, y - 40],
    [x - 40, y - 120],
    [x + 40, y - 120],
    [x + 60, y - 40],
    [x + 200, y + 120],
  ];
  r.polyline(path, 18, INK);
  r.polyline(path, 10, PAPER);
  r.roundRect(x - 60, y - 138, 120, 36, 16, S, INK, PAPER);
}
export function grip(r: Raster, x: number, y: number) {
  r.roundRect(x - 70, y - 20, 140, 40, 20, S, INK);
  for (let k = -50; k <= 50; k += 20) r.line([x + k, y - 16], [x + k, y + 16], D, INK);
}
export function bracket(r: Raster, x: number, y: number) {
  r.shape(
    [
      [x - 50, y - 50],
      [x - 20, y - 50],
      [x - 20, y + 20],
      [x + 50, y + 20],
      [x + 50, y + 50],
      [x - 50, y + 50],
    ],
    S,
    INK,
  );
  r.circle(x - 35, y - 25, 7, D, INK);
  r.circle(x + 30, y + 35, 7, D, INK);
}
export function phone(r: Raster, x: number, y: number) {
  r.roundRect(x - 50, y - 95, 100, 190, 18, S, INK);
  r.roundRect(x - 36, y - 78, 72, 60, 6, D, INK);
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < 3; col++) r.circle(x - 24 + col * 24, y + 5 + row * 20, 6, D, INK);
}
export function clip(r: Raster, x: number, y: number) {
  r.polyline(
    [
      [x - 40, y - 30],
      [x - 40, y + 30],
      [x + 40, y + 30],
      [x + 40, y - 30],
    ],
    S,
    INK,
  );
  r.line([x - 40, y], [x - 60, y], S, INK);
}
export function buttonCell(r: Raster, x: number, y: number) {
  r.ellipse(x, y, 30, 12, S, INK);
  r.ellipse(x, y - 12, 30, 12, S, INK, PAPER);
  r.line([x - 30, y - 12], [x - 30, y], S, INK);
  r.line([x + 30, y - 12], [x + 30, y], S, INK);
}
export function decalSheet(r: Raster, x: number, y: number, star: boolean) {
  r.roundRect(x - 150, y - 100, 300, 200, 8, S, INK);
  r.circle(x - 80, y - 30, 40, D, INK);
  r.text(x - 97, y - 44, star ? "0" : "7", 5, INK);
  r.roundRect(x - 10, y - 70, 130, 40, 12, D, INK);
  const pts: Pt[] = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? 16 : 38;
    return [x + 60 + Math.cos(a) * rr, y + 40 + Math.sin(a) * rr];
  });
  if (star) r.shape(pts, D, INK);
  else r.roundRect(x + 20, y + 10, 80, 50, 25, D, INK);
  r.circle(x - 80, y + 55, 20, D, INK);
}

/** Callout numbers with leader lines; collects the hotspots for the TIFF. */
export function callouts(r: Raster) {
  const hotspots: { x: number; y: number; w: number; h: number; label: string }[] = [];
  const add = (label: string, at: Pt, to: Pt) => {
    const scale = 4;
    const w = label.length * 6 * scale - scale,
      h = 7 * scale;
    const cx = at[0],
      cy = at[1];
    r.line([cx, cy], to, D, INK);
    r.fill(ellipsePts(cx, cy, w / 2 + 14, h / 2 + 12), PAPER);
    r.text(Math.round(cx - w / 2), Math.round(cy - h / 2), label, scale, INK);
    hotspots.push({
      x: Math.round(cx - w / 2 - 10),
      y: Math.round(cy - h / 2 - 10),
      w: w + 20,
      h: h + 20,
      label,
    });
  };
  return { add, hotspots };
}

/* ---------------- navigation picture (shades 0 ink … 7 paper) ---------------- */

export function navPicture(r: Raster) {
  const x = 760,
    y = 560;
  // Shadow, rear wheel behind the body.
  r.ellipse(x, y + 230, 520, 38, 1, 6, 6);
  r.ellipse(x + 250, y + 150, 58, 96, 4, 0, 2);
  // Lower tub.
  const tub: Pt[] = [
    [x - 420, y + 150],
    ...arc(x - 420, y + 50, 60, 100, Math.PI / 2, Math.PI * 1.5),
    [x - 210, y - 60],
    [x - 170, y - 150],
    [x + 210, y - 150],
    [x + 270, y - 50],
    [x + 400, y - 40],
    ...arc(x + 400, y + 45, 65, 85, -Math.PI / 2, Math.PI / 2),
  ];
  r.shape(tub, 5, 0, 5);
  // Door opening with the seat and the steering wheel inside.
  r.roundRect(x - 130, y - 130, 250, 220, 70, 5, 0, 7);
  r.shape(
    [
      [x - 60, y + 60],
      [x + 90, y + 60],
      [x + 100, y + 30],
      [x - 40, y + 30],
    ],
    3,
    0,
    3,
  );
  r.shape(
    [
      [x - 40, y + 30],
      [x - 70, y - 90],
      [x - 20, y - 90],
      [x + 5, y + 30],
    ],
    3,
    0,
    3,
  );
  r.ellipse(x + 150, y - 120, 60, 26, 7, 1, 6, -0.3);
  // Pillars and roof.
  r.shape(
    [
      [x - 170, y - 150],
      [x - 110, y - 330],
      [x - 80, y - 330],
      [x - 130, y - 150],
    ],
    4,
    0,
    4,
  );
  r.shape(
    [
      [x + 210, y - 150],
      [x + 170, y - 330],
      [x + 200, y - 330],
      [x + 240, y - 150],
    ],
    4,
    0,
    4,
  );
  r.shape(
    [
      ...arc(x + 40, y - 330, 340, 110, Math.PI, Math.PI * 2),
      [x + 380, y - 305],
      [x - 300, y - 305],
    ],
    5,
    0,
    6,
  );
  // Front and rear wheels (arches), headlight, fuel cap, door star, bumper, push handle, phone.
  for (const [ax, R] of [
    [x - 250, 105],
    [x + 250, 100],
  ] as [number, number][]) {
    r.fill(arc(ax, y + 150, R + 12, R + 6, Math.PI, Math.PI * 2), 7);
    r.circle(ax, y + 150, R, 6, 0, 2);
    r.circle(ax, y + 150, R * 0.55, 4, 0, 6);
    r.circle(ax, y + 150, R * 0.16, 3, 0, 1);
  }
  r.circle(x + 430, y + 10, 36, 5, 0, 7);
  r.circle(x + 430, y + 10, 20, 3, 0, 6);
  r.circle(x - 330, y + 10, 24, 4, 0, 6);
  r.roundRect(x - 520, y + 90, 90, 50, 20, 4, 0, 4);
  r.roundRect(x + 420, y + 110, 110, 46, 20, 4, 0, 4);
  r.polyline(
    [
      [x - 470, y - 40],
      [x - 560, y - 300],
      [x - 540, y - 380],
    ],
    16,
    0,
  );
  r.polyline(
    [
      [x - 470, y - 40],
      [x - 560, y - 300],
      [x - 540, y - 380],
    ],
    8,
    4,
  );
  r.roundRect(x - 600, y - 410, 110, 40, 18, 4, 0, 5);
  r.roundRect(x + 200, y - 100, 34, 60, 8, 3, 0, 1);
  const star: Pt[] = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? 14 : 34;
    return [x - 5 + Math.cos(a) * rr, y + 120 + Math.sin(a) * rr];
  });
  r.shape(star, 3, 0, 6);
}
