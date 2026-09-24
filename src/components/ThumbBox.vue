<script setup lang="ts">
// An illustration thumbnail, loaded when scrolled near the view. Hovering shows the large preview;
// thumbnails in view pre-render that preview in idle time so it opens at once.
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { onVisible, stopVisible } from "../composables/onVisible";
import { hidePreview, registerThumb, showPreview } from "../composables/usePreview";
import type { Plate } from "../lib/dump";
import { Illustrations, thumbnailUrl } from "../lib/illustrations";

const props = defineProps<{ plate: Plate; label: string }>();
const el = ref<HTMLElement>();
const src = ref("");

// Loads when near the view; follows the plate if the component is reused for another one.
function load() {
  const box = el.value!;
  const plate = props.plate;
  src.value = "";
  registerThumb(box, plate, props.label);
  stopVisible(box);
  onVisible(box, async () => {
    const url = await thumbnailUrl(plate.graphic);
    if (props.plate !== plate) return;
    if (url) src.value = url;
    // Pre-render the hover preview for thumbnails in view, so pointing at one shows it at once.
    Illustrations.prefetch(plate, { preview: true });
  });
}
onMounted(load);
watch(() => [props.plate, props.label], load);
onBeforeUnmount(() => {
  if (el.value) stopVisible(el.value);
});
</script>

<template>
  <div
    ref="el"
    class="thumb-box"
    @mouseenter="showPreview(el!, plate, label)"
    @mouseleave="hidePreview()"
  >
    <img v-if="src" :src="src" alt="" />
    <slot />
  </div>
</template>
