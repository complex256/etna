<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import MarketPicker from "../components/MarketPicker.vue";
import { pref } from "../lib/storage";
import { appState, go } from "../router";
import { useSession } from "../stores/session";

const session = useSession();
const d = session.dump!;
const filter = ref(pref.get("filter", ""));
const listEl = ref<HTMLUListElement>();

const models = computed(() => d.models.filter((m) => m.market === appState.value.market));
const shown = computed(() => {
  const ql = filter.value.trim().toLowerCase();
  return models.value.filter(
    (m) => !ql || m.name.toLowerCase().includes(ql) || m.code.toLowerCase().includes(ql),
  );
});
const model = computed(() => d.model(appState.value.market, appState.value.model));
const catalogs = computed(() =>
  model.value ? [...model.value.catalogs].sort((a, b) => b.year - a.year || a.kat - b.kat) : [],
);

watch(filter, (v) => pref.set("filter", v));
onMounted(async () => {
  await nextTick();
  listEl.value?.querySelector("[aria-current]")?.scrollIntoView({ block: "center" });
});
</script>

<template>
  <div class="vehicles" style="display: flex; flex: 1; min-width: 0; min-height: 0">
    <aside class="side">
      <h2>Market</h2>
      <div class="markets"><MarketPicker wide /></div>
      <input
        v-model="filter"
        class="filter"
        type="search"
        placeholder="Filter models"
        aria-label="Filter models"
      />
      <ul ref="listEl" class="list" aria-label="Models">
        <li v-for="m in shown" :key="m.code">
          <button
            :aria-current="m.code === appState.model ? 'true' : undefined"
            @click="go({ model: m.code })"
          >
            <span>{{ m.name || m.code }}</span>
            <span class="sub">{{ m.from || "" }}–{{ m.to || "" }}</span>
          </button>
        </li>
      </ul>
      <div class="side-foot">
        <button class="linkish" @click="go({ codes: 'engine', code: null })">
          Engine and gearbox codes
        </button>
      </div>
    </aside>
    <section class="pane">
      <div v-if="!model" class="empty">
        Choose a model from the {{ models.length }} listed for {{ appState.market }}.
      </div>
      <template v-else>
        <div class="pane-head">
          <h1>{{ model.name }}</h1>
          <div class="meta">
            {{
              [model.code, `${model.from || ""}–${model.to || ""}`, model.country]
                .filter(Boolean)
                .join("   ")
            }}
          </div>
        </div>
        <div class="scroll" style="flex: 1">
          <table class="grid">
            <thead>
              <tr>
                <th>Model year</th>
                <th>Catalog</th>
                <th>Vehicle types</th>
                <th>Kind</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="c in catalogs"
                :key="`${c.year}-${c.kat}`"
                class="link"
                tabindex="0"
                @click="go({ kat: String(c.kat), year: String(c.year), hg: null, plate: null })"
                @keydown.enter="
                  go({ kat: String(c.kat), year: String(c.year), hg: null, plate: null })
                "
              >
                <td class="num">{{ c.year }}</td>
                <td class="num">{{ c.kat }}</td>
                <td>{{ c.types.join(", ") }}</td>
                <td class="dim">{{ c.accessory ? "Accessories" : "Vehicle" }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </section>
  </div>
</template>
