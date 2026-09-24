<script setup lang="ts">
// Illustrations of one graphic-navigation area, as a list or a thumbnail gallery (remembered);
// both zoom on hover.
import { computed, nextTick, ref } from "vue";
import { hidePreview, previewRowFocus, rowPrefetch } from "../composables/usePreview";
import type { Catalog, Plate } from "../lib/dump";
import { pref } from "../lib/storage";
import type { PrInfo } from "../lib/tables";
import { plateLabel, plateTitle } from "../lib/text";
import { go } from "../router";
import PrMarkup from "./PrMarkup.vue";
import ThumbBox from "./ThumbBox.vue";

const props = defineProps<{
  title: string;
  countText: string;
  plates: Plate[];
  fits: Set<Plate>;
  prInfo: PrInfo | null;
  cat: Catalog;
}>();

type Mode = "list" | "gallery";
const mode = ref<Mode>(pref.get("navView", "list") === "gallery" ? "gallery" : "list");
const toggle = ref<HTMLElement>();
const items = computed(() =>
  props.plates.map((p) => {
    const t = plateTitle(p);
    return {
      p,
      t,
      fits: props.fits.has(p),
      label: [plateLabel(p), t.title].filter(Boolean).join("  "),
    };
  }),
);
const modes: { v: Mode; name: string; icon: string }[] = [
  { v: "list", name: "List", icon: "M2 3h12M2 8h12M2 13h12" },
  { v: "gallery", name: "Gallery", icon: "M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z" },
];
async function setMode(v: Mode) {
  if (v === mode.value) return;
  mode.value = v;
  pref.set("navView", v);
  hidePreview();
  await nextTick();
  toggle.value?.querySelector<HTMLElement>(`[data-mode="${v}"]`)?.focus();
}
const open = (p: Plate) => go({ plate: p.key, hg: p.hg, nav: null, navref: null });
</script>

<template>
  <div class="nav-list-head split">
    <div>
      <b>{{ title }}</b
      ><span class="dim">{{ " " + countText }}</span>
    </div>
    <div
      v-if="plates.length"
      ref="toggle"
      class="view-toggle"
      role="group"
      aria-label="Show illustrations as"
    >
      <button
        v-for="m in modes"
        :key="m.v"
        type="button"
        class="nav-btn icon"
        :data-mode="m.v"
        :aria-pressed="m.v === mode"
        :title="`${m.name} view`"
        :aria-label="`${m.name} view`"
        @click="setMode(m.v)"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path :d="m.icon" />
        </svg>
      </button>
    </div>
  </div>
  <div v-if="!plates.length" class="empty">
    No illustrations in this catalog are tagged with this area.
  </div>
  <div v-else-if="mode === 'gallery'" class="gallery">
    <button
      v-for="(it, i) in items"
      :key="i"
      type="button"
      :class="['gallery-tile', { nomatch: !it.fits }]"
      :aria-label="it.label + (it.fits ? '' : ' (does not fit the vehicle data)')"
      @click="open(it.p)"
      @focusin="previewRowFocus"
      @focusout="hidePreview()"
    >
      <ThumbBox :plate="it.p" :label="it.label">
        <span class="gallery-no num">{{ plateLabel(it.p) }}</span>
      </ThumbBox>
    </button>
  </div>
  <table v-else class="grid plates">
    <tbody>
      <tr
        v-for="(it, i) in items"
        :key="i"
        :class="['link', { nomatch: !it.fits }]"
        tabindex="0"
        @click="open(it.p)"
        @keydown.enter="open(it.p)"
        @mouseenter="rowPrefetch.enter(it.p)"
        @mouseleave="rowPrefetch.leave()"
        @focusin="previewRowFocus"
        @focusout="hidePreview()"
      >
        <td class="thumb"><ThumbBox :plate="it.p" :label="it.label" /></td>
        <td class="plno num">{{ plateLabel(it.p) }}</td>
        <td>
          {{ it.t.title }}
          <div v-if="it.t.model" class="dim">
            <PrMarkup :text="it.t.model" :pr-info="prInfo" :cat="cat" />
          </div>
        </td>
      </tr>
    </tbody>
  </table>
</template>
