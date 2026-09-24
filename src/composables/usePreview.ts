// Hover preview for illustration thumbnails: one pop-up for the whole app. It shows at once: the
// sharp render when it was pre-rendered (thumbnails in view are warmed in idle time), else the
// thumbnail enlarged until the illustration is decoded.
import { markRaw, reactive } from "vue";
import type { Plate } from "../lib/dump";
import {
  cachedPreview,
  Illustrations,
  isError,
  PREVIEW_WIDTH,
  renderPreview,
  storePreview,
  thumbnailUrl,
} from "../lib/illustrations";

export const previewState = reactive({
  visible: false,
  label: "",
  canvas: null as HTMLCanvasElement | null,
  /** Enlarged thumbnail shown until the sharp render is ready. */
  fallback: "",
  note: "",
  anchor: null as HTMLElement | null,
  /** Bumped on every change, so the pop-up re-measures its position. */
  version: 0,
});

let current: string | null = null;
let seq = 0;

export async function showPreview(anchor: HTMLElement, plate: Plate, label: string) {
  if (current === plate.graphic && previewState.visible) return;
  const my = ++seq;
  current = plate.graphic;
  const cached = cachedPreview(plate);
  Object.assign(previewState, {
    visible: true,
    label,
    anchor: markRaw(anchor),
    canvas: cached ? markRaw(cached) : null,
    fallback: "",
    note: "",
  });
  previewState.version++;
  if (cached) return;
  const url = await thumbnailUrl(plate.graphic);
  if (my !== seq) return;
  if (url) previewState.fallback = url;
  else previewState.note = "Loading…";
  const img = await Illustrations.get(plate);
  if (my !== seq) return;
  if (isError(img)) {
    if (!previewState.fallback) previewState.note = img.error;
    return;
  }
  const canvas = renderPreview(img, PREVIEW_WIDTH);
  storePreview(plate, canvas);
  previewState.canvas = markRaw(canvas);
  previewState.version++;
}

export function hidePreview() {
  seq++;
  current = null;
  previewState.visible = false;
}

/* Rows with a thumbnail: focusing the row shows its preview too. */
const thumbs = new WeakMap<Element, { plate: Plate; label: string }>();
export function registerThumb(el: Element, plate: Plate, label: string) {
  thumbs.set(el, { plate, label });
}
export function previewRowFocus(e: FocusEvent) {
  const row = e.currentTarget as HTMLElement;
  const box = row.querySelector<HTMLElement>(".thumb-box");
  const t = box && thumbs.get(box);
  if (box && t) void showPreview(box, t.plate, t.label);
}

/** Hovering a row for a moment decodes its illustration (and its preview) ahead of a click. */
let prefetchTimer = 0;
export const rowPrefetch = {
  enter(plate: Plate) {
    clearTimeout(prefetchTimer);
    prefetchTimer = window.setTimeout(() => Illustrations.prefetch(plate, { preview: true }), 90);
  },
  leave() {
    clearTimeout(prefetchTimer);
  },
};

// Holds app-wide state: a hot update would create a second copy of it, so reload instead.
import.meta.hot?.accept(() => location.reload());
