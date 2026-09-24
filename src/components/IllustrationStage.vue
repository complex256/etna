<script setup lang="ts">
// A pannable, zoomable sheet showing a canvas. Overlays (hotspots, labels) go in the default slot,
// positioned in picture pixels; `--inv` on the sheet is 1/scale for counter-scaled overlays.
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps<{
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  label: string;
}>();
const emit = defineEmits<{ zoom: [scale: number] }>();
const stage = ref<HTMLElement>();
const sheet = ref<HTMLElement>();
const holder = ref<HTMLElement>();

let s = 1,
  tx = 0,
  ty = 0,
  minS = 0.05,
  lastScale = -1;
const scale = ref(1);

function apply() {
  const el = sheet.value;
  if (!el) return;
  el.style.transform = `translate(${tx}px,${ty}px) scale(${s})`;
  el.style.setProperty("--inv", String(1 / s));
  // Only zoom changes affect overlay layout; panning does not.
  if (s !== lastScale) {
    lastScale = s;
    scale.value = s;
    emit("zoom", s);
  }
}
function fit() {
  const r = stage.value!.getBoundingClientRect();
  s = Math.min((r.width - 20) / props.width, (r.height - 20) / props.height);
  minS = s * 0.5;
  tx = (r.width - props.width * s) / 2;
  ty = (r.height - props.height * s) / 2;
  apply();
}
function zoomAt(f: number, cx: number, cy: number) {
  const ns = Math.max(minS, Math.min(4, s * f));
  tx = cx - (cx - tx) * (ns / s);
  ty = cy - (cy - ty) * (ns / s);
  s = ns;
  apply();
}
const center = (): [number, number] => {
  const r = stage.value!.getBoundingClientRect();
  return [r.width / 2, r.height / 2];
};
function onWheel(e: WheelEvent) {
  e.preventDefault();
  const r = stage.value!.getBoundingClientRect();
  zoomAt(
    Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0015)),
    e.clientX - r.left,
    e.clientY - r.top,
  );
}
let drag: { x: number; y: number; tx: number; ty: number } | null = null;
function onPointerDown(e: PointerEvent) {
  // Clickable overlays mark themselves with data-interactive.
  if ((e.target as HTMLElement).closest("[data-interactive]")) return;
  drag = { x: e.clientX, y: e.clientY, tx, ty };
  stage.value!.setPointerCapture(e.pointerId);
  stage.value!.classList.add("dragging");
}
function onPointerMove(e: PointerEvent) {
  if (!drag) return;
  tx = drag.tx + e.clientX - drag.x;
  ty = drag.ty + e.clientY - drag.y;
  apply();
}
function onPointerEnd() {
  drag = null;
  stage.value?.classList.remove("dragging");
}
function onDblClick(e: MouseEvent) {
  const r = stage.value!.getBoundingClientRect();
  zoomAt(2, e.clientX - r.left, e.clientY - r.top);
}
function onKey(e: KeyboardEvent) {
  if (e.key === "+" || e.key === "=") zoomAt(1.25, ...center());
  else if (e.key === "-") zoomAt(0.8, ...center());
  else if (e.key === "0") fit();
}

/** Brings a point (picture pixels) into view if it is off screen. */
function reveal(x: number, y: number) {
  const r = stage.value!.getBoundingClientRect();
  const sx = x * s + tx,
    sy = y * s + ty;
  if (sx < 0 || sy < 0 || sx > r.width - 40 || sy > r.height - 40) {
    tx += r.width / 2 - sx;
    ty += r.height / 2 - sy;
    apply();
  }
}
defineExpose({ reveal, scale });

let ro: ResizeObserver | null = null;
function mountCanvas() {
  holder.value?.replaceChildren(props.canvas);
}
watch(() => props.canvas, mountCanvas);
onMounted(() => {
  mountCanvas();
  ro = new ResizeObserver(() => fit());
  ro.observe(stage.value!);
  fit();
});
onBeforeUnmount(() => ro?.disconnect());
</script>

<template>
  <div class="stage-wrap">
    <div
      ref="stage"
      class="stage"
      tabindex="0"
      :aria-label="label"
      @wheel="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerEnd"
      @pointercancel="onPointerEnd"
      @dblclick="onDblClick"
      @keydown="onKey"
    >
      <div ref="sheet" class="sheet" :style="{ width: `${width}px`, height: `${height}px` }">
        <div ref="holder" class="sheet-canvas" />
        <slot :scale="scale" />
      </div>
    </div>
    <div class="zoom">
      <button title="Zoom in (+)" aria-label="Zoom in" @click="zoomAt(1.25, ...center())">+</button>
      <button title="Zoom out (−)" aria-label="Zoom out" @click="zoomAt(0.8, ...center())">
        −
      </button>
      <button title="Fit to view (0)" aria-label="Fit to view" @click="fit">⤢</button>
    </div>
  </div>
</template>
