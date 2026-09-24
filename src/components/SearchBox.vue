<script setup lang="ts">
// Search box with recent searches: an ARIA combobox that opens on focus/click and filters as you
// type. ↑/↓ move, Enter runs the highlighted entry, Esc closes, Shift+Delete removes an entry.
import { nextTick, ref, watch } from "vue";
import { historyKind, SearchHistory } from "../lib/searchHistory";
import { appState, go } from "../router";

const input = ref<HTMLInputElement>();
const list = ref<HTMLUListElement>();
const value = ref(appState.value.q || "");
const open = ref(false);
const shown = ref<string[]>([]);
const active = ref(-1);

// The box shows the current search.
watch(
  () => appState.value.q,
  (q) => (value.value = q || ""),
);

function refresh() {
  const typed = value.value.trim().toLowerCase();
  const all = SearchHistory.items();
  // While the box still shows the current search, list everything; otherwise filter by what is typed.
  shown.value =
    typed && typed !== (appState.value.q || "").toLowerCase()
      ? all.filter((x) => x.toLowerCase().includes(typed))
      : all;
  open.value = shown.value.length > 0;
  active.value = -1;
}
function close() {
  open.value = false;
  active.value = -1;
}
function run(q: string) {
  value.value = q;
  close();
  input.value?.blur();
  SearchHistory.add(q);
  go({ q, list: null, garage: null, ts: null, codes: null, code: null });
}
function submit() {
  const q = value.value.trim();
  if (q) SearchHistory.add(q);
  input.value?.blur();
  close();
  go({ q: q || null });
}
function remove(q: string) {
  SearchHistory.remove(q);
  refresh();
  input.value?.focus();
}
function highlight(i: number) {
  active.value = i;
  nextTick(() => list.value?.children[i]?.scrollIntoView({ block: "nearest" }));
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (!open.value) {
      refresh();
      if (!open.value) return;
    }
    const n = shown.value.length,
      d = e.key === "ArrowDown" ? 1 : -1;
    highlight(active.value < 0 ? (d > 0 ? 0 : n - 1) : (active.value + d + n) % n);
  } else if (e.key === "Enter" && open.value && active.value >= 0) {
    e.preventDefault();
    run(shown.value[active.value]);
  } else if (e.key === "Escape" && open.value) {
    e.preventDefault();
    e.stopPropagation();
    close();
  } else if (e.key === "Delete" && open.value && active.value >= 0 && e.shiftKey) {
    e.preventDefault();
    SearchHistory.remove(shown.value[active.value]);
    refresh();
  }
}
</script>

<template>
  <form class="search-form" role="search" @submit.prevent="submit">
    <input
      ref="input"
      v-model="value"
      type="search"
      placeholder="Part number, text or VIN"
      aria-label="Search parts or VIN"
      autocomplete="off"
      role="combobox"
      aria-autocomplete="list"
      aria-controls="qHistory"
      :aria-expanded="open"
      :aria-activedescendant="active >= 0 ? `qh-${active}` : undefined"
      @focus="refresh"
      @click="!open && refresh()"
      @input="refresh"
      @blur="close"
      @keydown="onKeydown"
    />
    <!-- mousedown keeps focus in the input so the click lands before blur closes the list. -->
    <ul
      v-show="open"
      id="qHistory"
      ref="list"
      class="history"
      role="listbox"
      aria-label="Recent searches"
      @mousedown.prevent
    >
      <li
        v-for="(q, i) in shown"
        :id="`qh-${i}`"
        :key="q"
        role="option"
        :aria-selected="i === active"
        @click="run(q)"
      >
        <span class="history-q">{{ q }}</span>
        <span v-if="historyKind(q)" class="history-kind">{{ historyKind(q) }}</span>
        <button
          type="button"
          class="history-del"
          tabindex="-1"
          :aria-label="`Remove ${q} from history`"
          title="Remove"
          @click.stop="remove(q)"
        >
          ✕
        </button>
      </li>
    </ul>
  </form>
</template>
