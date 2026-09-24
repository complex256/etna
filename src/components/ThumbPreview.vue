<script setup lang="ts">
// The app's single hover pop-up (see composables/usePreview.ts), placed beside its thumbnail.
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { hidePreview, previewState } from "../composables/usePreview";
import { router } from "../router";

const el = ref<HTMLElement>();
const frame = ref<HTMLElement>();
const pos = ref({ left: 0, top: 0 });

// The canvas is a plain DOM element (drawn off-screen); mount it into the frame.
watch(
  () => [previewState.canvas, previewState.visible] as const,
  async () => {
    await nextTick();
    const f = frame.value;
    if (!f) return;
    const c = previewState.canvas;
    const has = f.querySelector("canvas");
    if (c && has !== c) {
      has?.remove();
      f.prepend(c);
    } else if (!c) has?.remove();
  },
);

// Beside the thumbnail, on the side with room; below it on narrow screens.
watch(
  () => previewState.version,
  async () => {
    await nextTick();
    const a = previewState.anchor,
      p = el.value;
    if (!a || !p) return;
    const r = a.getBoundingClientRect();
    const w = p.offsetWidth,
      h = p.offsetHeight,
      vw = window.innerWidth,
      vh = window.innerHeight;
    let left = r.right + 12,
      top = r.top + r.height / 2 - h / 2;
    if (left + w > vw - 8) left = Math.max(8, r.left - w - 12);
    if (left < 8 || left + w > vw - 8) {
      left = Math.max(8, Math.min(vw - w - 8, r.left));
      top = r.bottom + 8;
    }
    top = Math.max(56, Math.min(top, vh - h - 8));
    pos.value = { left: Math.round(left), top: Math.round(top) };
  },
  { flush: "post" },
);

// Hidden on scroll and whenever the page changes.
const onScroll = () => hidePreview();
watch(() => router.currentRoute.value.fullPath, hidePreview);
onMounted(() => window.addEventListener("scroll", onScroll, true));
onBeforeUnmount(() => window.removeEventListener("scroll", onScroll, true));
</script>

<template>
  <div
    v-show="previewState.visible"
    ref="el"
    class="thumb-preview"
    role="tooltip"
    :style="{ left: `${pos.left}px`, top: `${pos.top}px` }"
  >
    <div class="thumb-preview-head">{{ previewState.label }}</div>
    <div ref="frame" class="thumb-preview-img">
      <template v-if="!previewState.canvas">
        <img v-if="previewState.fallback" :src="previewState.fallback" alt="" class="blurry" />
        <div v-else-if="previewState.note" class="thumb-preview-note">{{ previewState.note }}</div>
      </template>
    </div>
  </div>
</template>
