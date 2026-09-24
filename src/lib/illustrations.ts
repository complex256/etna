// Illustrations: decoded TIFFs shared by the full view, hover previews and prefetching, plus the
// thumbnail and photo images. Canvases are plain DOM elements (never reactive).
import { dump, type Plate } from "./dump";
import { deobfuscateImage, parseTiff, type Illustration } from "./format/tiff";
import type { NavPicture } from "./format/zgd";
import type { FileLike } from "./fs";

export type Loaded = Illustration | { error: string };
export const isError = (x: Loaded): x is { error: string } => "error" in x;

/** Image folder of a graphic name: the first three characters. */
const imageDirFor = (name: string) => (name ? name.slice(0, 3) : "");

export const idle = (fn: () => void) =>
  "requestIdleCallback" in window ? requestIdleCallback(fn, { timeout: 500 }) : setTimeout(fn, 30);

async function loadFromDisk(plate: Plate): Promise<Loaded> {
  const brand = dump().brandDir;
  if (!brand)
    return {
      error:
        "Illustrations are unavailable because the data folder was opened directly. Open the brand folder instead.",
    };
  const bilder = await brand.dir("Bilder");
  if (!bilder) return { error: "The Bilder folder is missing, so illustrations cannot be shown." };
  for (const g of [plate.graphic, plate.graphicOld]) {
    if (!g) continue;
    const d = await bilder.dir(imageDirFor(g));
    const f = d && (await d.file(`${g}.tif`));
    if (f) return parseTiff(new Uint8Array(await f.arrayBuffer()));
  }
  return { error: `Illustration ${plate.graphic || "(none)"} is not in this dump.` };
}

// Small LRU over a Map (insertion order = recency).
function touch<K, V>(m: Map<K, V>, k: K, v: V, max: number) {
  m.delete(k);
  m.set(k, v);
  while (m.size > max) m.delete(m.keys().next().value!);
}

const decoded = new Map<string, Promise<Loaded>>(); // ≈ 24 decoded 1-bit images
const canvases = new Map<Illustration, HTMLCanvasElement>(); // full-size canvases are ≈ 4 bytes/pixel, so few
const previews = new Map<string, HTMLCanvasElement>();
const plateKey = (plate: Plate) => plate.graphic || plate.graphicOld || plate.key;

export const Illustrations = {
  get(plate: Plate): Promise<Loaded> {
    const k = plateKey(plate);
    let p = decoded.get(k);
    if (!p) p = loadFromDisk(plate).catch((e: Error) => ({ error: e.message }));
    touch(decoded, k, p, 24);
    return p;
  },
  /** The shared full-size canvas of an illustration (reused by the viewer and previews). */
  canvas(img: Illustration): HTMLCanvasElement {
    const c = canvases.get(img) ?? drawIllustration(img);
    touch(canvases, img, c, 4);
    return c;
  },
  /** Decode (and optionally draw) in idle time so a later open is instant. */
  prefetch(plate: Plate | undefined, opts: { draw?: boolean; preview?: boolean } = {}) {
    if (!plate) return;
    idle(async () => {
      const img = await this.get(plate);
      if (isError(img)) return;
      if (opts.draw) idle(() => this.canvas(img));
      if (opts.preview) idle(() => warmPreview(plate, img));
    });
  },
  /** Drop everything (another dump was opened). */
  clear() {
    decoded.clear();
    canvases.clear();
    previews.clear();
  },
};

const INK = 0xff211d1a,
  PAPER = 0xfff8fbfb; // ABGR little-endian: #1A1D21 / #FBFBF8

/** Full-size 1-bit illustration drawn onto a canvas. */
export function drawIllustration(img: Illustration): HTMLCanvasElement {
  const { width: W, height: H, bits } = img;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  canvas.setAttribute("aria-hidden", "true");
  const ctx = canvas.getContext("2d")!;
  const data = ctx.createImageData(W, H);
  const px = new Uint32Array(data.data.buffer);
  const bpr = (W + 7) >> 3;
  for (let y = 0; y < H; y++) {
    const ro = y * bpr,
      po = y * W;
    for (let x = 0; x < W; x++) px[po + x] = bits[ro + (x >> 3)] & (0x80 >> (x & 7)) ? INK : PAPER;
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

/** Navigation picture: 3-bit shading, 0 = ink … 7 = paper. */
export function drawNavPicture(img: NavPicture): HTMLCanvasElement {
  const { width: W, height: H } = img;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  canvas.setAttribute("aria-hidden", "true");
  const ctx = canvas.getContext("2d")!;
  const data = ctx.createImageData(W, H);
  const px = new Uint32Array(data.data.buffer);
  const ramp = Array.from({ length: 8 }, (_, v) => {
    const c = (a: number, b: number) => Math.round(a + (b - a) * (v / 7));
    return ((0xff << 24) | (c(0x1a, 0xfb) << 16) | (c(0x1d, 0xfb) << 8) | c(0x21, 0xf8)) >>> 0;
  });
  for (let i = 0; i < img.gray.length; i++) px[i] = ramp[img.gray[i] & 7];
  ctx.putImageData(data, 0, 0);
  return canvas;
}

/* ---------------- hover previews ---------------- */

export const PREVIEW_WIDTH = 520;

/**
 * Downscales a 1-bit illustration in halving steps so thin lines stay visible. Renders at the
 * screen's pixel density (2x on Retina) and displays at CSS size, so it stays sharp.
 * `shared`: start from the shared full-size canvas, which opening the illustration then reuses.
 */
export function renderPreview(
  img: Illustration,
  targetW = PREVIEW_WIDTH,
  shared = true,
): HTMLCanvasElement {
  const { width: W, height: H } = img;
  let src: HTMLCanvasElement = shared ? Illustrations.canvas(img) : drawIllustration(img);
  const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);
  const maxH = Math.round(window.innerHeight * 0.72);
  const cssScale = Math.min(targetW / W, maxH / H, 1);
  const scale = Math.min(cssScale * dpr, 1);
  let w = W,
    hh = H;
  while (w * 0.5 >= W * scale) {
    const step = document.createElement("canvas");
    step.width = Math.round(w / 2);
    step.height = Math.round(hh / 2);
    const c = step.getContext("2d")!;
    c.imageSmoothingQuality = "high";
    c.drawImage(src, 0, 0, step.width, step.height);
    src = step;
    w = step.width;
    hh = step.height;
  }
  const out = document.createElement("canvas");
  out.width = Math.round(W * scale);
  out.height = Math.round(H * scale);
  out.style.width = `${Math.round(W * cssScale)}px`;
  out.style.height = `${Math.round(H * cssScale)}px`;
  const c = out.getContext("2d")!;
  c.imageSmoothingQuality = "high";
  // Downscaled 1-bit line art goes gray; a little contrast keeps thin lines dark.
  c.filter = "contrast(1.35)";
  c.drawImage(src, 0, 0, out.width, out.height);
  return out;
}

export const cachedPreview = (plate: Plate) => previews.get(plate.graphic);
export function storePreview(plate: Plate, canvas: HTMLCanvasElement) {
  touch(previews, plate.graphic, canvas, 40);
}
/**
 * Pre-render the preview of a plate whose illustration is decoded. Background warm-up draws into a
 * throwaway full-size canvas so the shared cache (current/prev/next illustration) is not churned.
 */
export function warmPreview(plate: Plate, img: Illustration) {
  if (previews.has(plate.graphic)) return;
  storePreview(plate, renderPreview(img, PREVIEW_WIDTH, false));
}

/* ---------------- thumbnails and photos ---------------- */

export async function imageUrl(file: FileLike): Promise<string> {
  const { bytes, type } = deobfuscateImage(new Uint8Array(await file.arrayBuffer()));
  return URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type }));
}

// Object URLs of thumbnails by graphic name; kept across views, oldest revoked past the limit.
const thumbs = new Map<string, Promise<string | null>>();
export function thumbnailUrl(graphic: string): Promise<string | null> {
  let p = thumbs.get(graphic);
  if (!p) {
    p = (async () => {
      const brand = dump().brandDir;
      if (!graphic || !brand) return null;
      const minis = await brand.dir("minis");
      const d = minis && (await minis.dir(imageDirFor(graphic)));
      const f = d && ((await d.file(`${graphic}.png`)) || (await d.file(`${graphic}.zgd.png`)));
      return f ? imageUrl(f) : null;
    })().catch(() => null);
    thumbs.set(graphic, p);
    while (thumbs.size > 800) {
      const [k, old] = thumbs.entries().next().value!;
      thumbs.delete(k);
      void old.then((u) => u && URL.revokeObjectURL(u));
    }
  }
  return p;
}
export function clearThumbnails() {
  for (const p of thumbs.values()) void p.then((u) => u && URL.revokeObjectURL(u));
  thumbs.clear();
}

// Holds app-wide state: a hot update would create a second copy of it, so reload instead.
import.meta.hot?.accept(() => location.reload());
