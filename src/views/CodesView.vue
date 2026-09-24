<script setup lang="ts">
// Engine and gearbox code registers of the market.
import { computed, onMounted, ref, watch } from "vue";
import CodeTable from "../components/CodeTable.vue";
import { useLoad } from "../composables/useLoad";
import { Codes } from "../lib/tables";
import { appState, go } from "../router";

const filterEl = ref<HTMLInputElement>();
const filter = ref(appState.value.code || "");
// Switching between engine and gearbox codes starts with the filter from the URL (empty on a tab switch).
watch(
  () => appState.value.codes,
  () => (filter.value = appState.value.code || ""),
);
const kind = computed(() => (appState.value.codes === "gearbox" ? "gearbox" : "engine"));
const { data } = useLoad(
  () => appState.value.market,
  () => Codes.load(appState.value.market!),
);
const result = computed(() => {
  const reg = data.value;
  if (!reg) return null;
  const rows = kind.value === "engine" ? reg.engines : reg.gearboxes;
  const ql = filter.value.trim().toUpperCase();
  const hits = rows.filter(
    (r) => !ql || r.code.startsWith(ql) || r.models.some((m) => m.toUpperCase().includes(ql)),
  );
  const shown = hits.slice(0, 400);
  return {
    shown,
    kats: kind.value === "engine" ? reg.engineKats : reg.gearKats,
    count: `${hits.length} ${kind.value} codes${hits.length > shown.length ? `, showing the first ${shown.length}; type to narrow` : ""}`,
  };
});
onMounted(() => filterEl.value?.focus());
</script>

<template>
  <section class="pane">
    <div class="pane-head split">
      <div>
        <h1>{{ kind === "engine" ? "Engine codes" : "Gearbox codes" }}</h1>
        <div class="meta">{{ result?.count ?? "Loading code register…" }}</div>
      </div>
      <div class="view-tabs">
        <button
          v-for="[k, label] in [
            ['engine', 'Engine codes'],
            ['gearbox', 'Gearbox codes'],
          ]"
          :key="k"
          :class="['nav-btn', { active: k === kind }]"
          @click="go({ codes: k, code: null }, true)"
        >
          {{ label }}
        </button>
      </div>
    </div>
    <div class="codes-filter">
      <input
        ref="filterEl"
        v-model="filter"
        class="filter"
        type="search"
        :placeholder="
          kind === 'engine' ? 'Engine code or model, e.g. BFB' : 'Gearbox code or model'
        "
        aria-label="Filter codes"
      />
    </div>
    <div class="scroll" style="flex: 1">
      <CodeTable v-if="result" :key="kind" :kind="kind" :rows="result.shown" :kats="result.kats" />
    </div>
  </section>
</template>
