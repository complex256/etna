<script setup lang="ts">
// Market dropdown: flag + code; the list shows flag, code and region name. Keyboard: ↑/↓, Home/End,
// Enter, Esc.
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import { useSetMarket } from "../composables/useSetMarket";
import { marketName } from "../lib/markets";
import { appState } from "../router";
import { useSession } from "../stores/session";
import FlagIcon from "./FlagIcon.vue";

defineProps<{ wide?: boolean }>();
const session = useSession();
const setMarket = useSetMarket();
const wrap = ref<HTMLElement>();
const btn = ref<HTMLButtonElement>();
const options = ref<HTMLLIElement[]>([]);
const open = ref(false);
const market = computed(() => appState.value.market || "");
const markets = computed(() =>
  (session.dump?.markets ?? []).map((m) => ({
    m,
    count: session.dump!.models.filter((x) => x.market === m).length,
  })),
);

const onDoc = (e: MouseEvent) => {
  if (!wrap.value?.contains(e.target as Node)) close();
};
async function show() {
  open.value = true;
  document.addEventListener("mousedown", onDoc);
  await nextTick();
  (options.value.find((o) => o.dataset.market === market.value) || options.value[0])?.focus();
}
function close(refocus = false) {
  open.value = false;
  document.removeEventListener("mousedown", onDoc);
  if (refocus) btn.value?.focus();
}
function choose(m: string) {
  close();
  setMarket(m);
}
function onListKey(e: KeyboardEvent) {
  const opts = options.value;
  const i = opts.indexOf(document.activeElement as HTMLLIElement);
  const focus = (k: number) => opts[k]?.focus();
  const moves: Record<string, number> = {
    ArrowDown: (i + 1) % opts.length,
    ArrowUp: (i - 1 + opts.length) % opts.length,
    Home: 0,
    End: opts.length - 1,
  };
  if (e.key in moves) {
    e.preventDefault();
    focus(moves[e.key]);
  } else if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    if (i >= 0) choose(opts[i].dataset.market!);
  } else if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    close(true);
  } else if (e.key === "Tab") close();
}
onBeforeUnmount(() => document.removeEventListener("mousedown", onDoc));
</script>

<template>
  <div ref="wrap" :class="['market-picker', { wide }]">
    <button
      ref="btn"
      type="button"
      class="market-btn"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :title="`Market: ${marketName(market)}`"
      :aria-label="`Market: ${marketName(market)}. Change market`"
      @click="open ? close() : show()"
      @keydown.down.prevent="show"
      @keydown.up.prevent="show"
    >
      <FlagIcon :code="market" />
      <span class="market-code">{{ market }}</span>
      <span v-if="wide" class="market-name">{{ marketName(market) }}</span>
      <span class="caret" aria-hidden="true">▾</span>
    </button>
    <ul v-show="open" class="market-list" role="listbox" aria-label="Markets" @keydown="onListKey">
      <li
        v-for="{ m, count } in markets"
        :key="m"
        ref="options"
        role="option"
        tabindex="-1"
        :aria-selected="m === market"
        :data-market="m"
        @click="choose(m)"
      >
        <FlagIcon :code="m" />
        <span class="market-code">{{ m }}</span>
        <span class="market-name">{{ marketName(m) }}</span>
        <span class="dim num">{{ count }}</span>
      </li>
    </ul>
  </div>
</template>
