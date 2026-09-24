<script setup lang="ts">
// Equipment (PR code) explorer per catalog: every option and, for a chosen one, the parts a retrofit
// needs compared with the vehicle's current code in that family.
import { computed, nextTick, ref, watch } from "vue";
import EquipmentDetail from "../components/EquipmentDetail.vue";
import VehicleDataButton from "../components/VehicleDataButton.vue";
import { useLoad } from "../composables/useLoad";
import { equipmentFamilies, prIndex } from "../lib/equipment";
import { pref } from "../lib/storage";
import { PR } from "../lib/tables";
import { appState, go } from "../router";
import { useSession } from "../stores/session";
import { useVehicleData } from "../stores/vehicleData";

const session = useSession();
const vehicleData = useVehicleData();
const d = session.dump!;
const search = ref(pref.get("equipFilter", ""));
const listEl = ref<HTMLElement>();
const model = computed(() => d.model(appState.value.market, appState.value.model));
const selected = computed(() =>
  appState.value.equip && appState.value.equip !== "1" ? appState.value.equip : null,
);
const f = computed(() => vehicleData.get(appState.value.market!, appState.value.kat!));
const mine = computed(() => new Set(Object.values(f.value.pr)));

const { data, error } = useLoad(
  () => [appState.value.market, appState.value.kat],
  async () => {
    const [cat, prInfo] = await Promise.all([
      d.catalog(appState.value.market!, appState.value.kat!),
      PR.load(),
    ]);
    const index = prIndex(cat);
    return { cat, prInfo, index, families: equipmentFamilies(index, prInfo) };
  },
);

const shown = computed(() => {
  const v = data.value;
  if (!v) return [];
  const q = search.value.trim().toLowerCase();
  return v.families
    .map((g) => ({
      ...g,
      codes: g.codes.filter(
        (c) =>
          !q ||
          c.code.toLowerCase().includes(q) ||
          g.name.toLowerCase().includes(q) ||
          (v.prInfo.code.get(c.code)?.text || "").toLowerCase().includes(q),
      ),
    }))
    .filter((g) => g.codes.length);
});
watch(search, (v) => pref.set("equipFilter", v));
watch(
  data,
  async (v) => {
    if (!v) return;
    await nextTick();
    listEl.value?.querySelector(".equip-opt.on")?.scrollIntoView({ block: "center" });
  },
  { immediate: true },
);
</script>

<template>
  <div v-if="error" class="welcome">
    <div class="msg">{{ error }}</div>
  </div>
  <div v-else-if="!data" class="status">Loading equipment…</div>
  <section v-else class="pane">
    <div class="pane-head split">
      <div>
        <h1>{{ model ? model.name : `Catalog ${appState.kat}` }}</h1>
        <div class="meta">
          Equipment options, catalog {{ appState.kat }}: {{ data.index.size }} codes
        </div>
      </div>
      <VehicleDataButton />
      <button class="nav-btn" @click="go({ equip: null })">Main groups</button>
    </div>
    <div class="equip-layout">
      <aside class="equip-side">
        <input
          v-model="search"
          class="filter"
          type="search"
          placeholder="Find an option: code, name or family"
          aria-label="Find an option"
        />
        <div ref="listEl" class="equip-families">
          <section v-for="g in shown" :key="g.fam" class="equip-family">
            <h3>
              {{ g.name }}<span class="dim"> {{ g.fam === "—" ? "" : g.fam }}</span>
            </h3>
            <ul class="plain">
              <li v-for="c in g.codes" :key="c.code">
                <button
                  :class="['equip-opt', { on: c.code === selected, mine: mine.has(c.code) }]"
                  @click="go({ equip: c.code }, true)"
                >
                  <span class="equip-code">{{ c.code }}</span>
                  <span class="equip-text">{{ data.prInfo.code.get(c.code)?.text || "" }}</span>
                  <span v-if="mine.has(c.code)" class="equip-badge">yours</span>
                  <span class="dim num">{{ c.rows }}</span>
                </button>
              </li>
            </ul>
          </section>
          <div v-if="!shown.length" class="empty">No option matches that search.</div>
        </div>
      </aside>
      <div class="equip-detail scroll">
        <EquipmentDetail
          v-if="selected"
          :key="selected"
          :code="selected"
          :index="data.index"
          :f="f"
          :pr-info="data.prInfo"
        />
        <div v-else class="empty">
          <p>Choose an option to see the parts it uses.</p>
          <p v-if="mine.size">
            Options marked “yours” come from this catalog’s vehicle data ({{ mine.size }} families
            set). With them, each option shows exactly which parts a retrofit adds and which it
            replaces.
          </p>
          <p v-else>
            Enter the vehicle’s data sticker under “Vehicle data” first: then each option shows
            exactly which parts a retrofit adds and which it replaces.
          </p>
        </div>
      </div>
    </div>
  </section>
</template>
