<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import PrMarkup from "../components/PrMarkup.vue";
import ThumbBox from "../components/ThumbBox.vue";
import VehicleDataButton from "../components/VehicleDataButton.vue";
import { navMemory } from "../composables/navMemory";
import { previewRowFocus, hidePreview, rowPrefetch } from "../composables/usePreview";
import { useLoad } from "../composables/useLoad";
import { navRefs } from "../lib/catalogData";
import { PR } from "../lib/tables";
import { plateLabel, plateTitle } from "../lib/text";
import { plateFits } from "../lib/vehicleFilter";
import { appState, go } from "../router";
import { useSession } from "../stores/session";
import { useVehicleData } from "../stores/vehicleData";

const HG_ORDER = "1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const session = useSession();
const vehicleData = useVehicleData();
const d = session.dump!;
const tabsEl = ref<HTMLElement>();
const tableEl = ref<HTMLElement>();
const returned = ref<string | null>(null);

const { data, error } = useLoad(
  () => [appState.value.market, appState.value.kat],
  async () => {
    const s = appState.value;
    const cat = await d.catalog(s.market!, s.kat!);
    const [fc, refs, prInfo] = await Promise.all([
      vehicleData.context(s.market!, s.kat!),
      navRefs(s.kat!).catch(() => []),
      PR.load().catch(() => null),
    ]);
    const hgs = [...new Set(cat.plates.map((p) => p.hg))].sort(
      (a, b) => HG_ORDER.indexOf(a) - HG_ORDER.indexOf(b),
    );
    const fits = new Set(cat.plates.filter((p) => plateFits(p, fc)));
    return { cat, fc, hasNav: refs.length > 0, prInfo, hgs, fits };
  },
);

const model = computed(() => d.model(appState.value.market, appState.value.model));
// Without a main group in the URL, open the first one.
watch(
  () => [data.value, appState.value.hg] as const,
  ([v, hg]) => {
    if (v && (!hg || !v.hgs.includes(hg))) go({ hg: v.hgs[0] }, true);
  },
  { immediate: true },
);

const rows = computed(() => {
  const v = data.value;
  const hg = appState.value.hg;
  if (!v) return { shown: [], hidden: 0 };
  let hidden = 0;
  const shown = [];
  for (const p of v.cat.plates) {
    if (p.hg !== hg) continue;
    const fits = v.fits.has(p);
    if (!fits && v.fc.f.hide) {
      hidden++;
      continue;
    }
    const t = plateTitle(p);
    shown.push({ p, t, fits, label: [plateLabel(p), t.title].filter(Boolean).join("  ") });
  }
  return { shown, hidden };
});

// Another main group starts at the top of its list.
watch(
  () => appState.value.hg,
  () => {
    if (tableEl.value) tableEl.value.scrollTop = 0;
  },
);
// Coming back from an illustration: scroll to it and mark it.
watch(
  () => rows.value.shown.length,
  async (n) => {
    if (!n) return;
    const key = navMemory.takeReturnTo();
    await nextTick();
    if (key) {
      returned.value = key.trimEnd();
      tableEl.value
        ?.querySelector(`[data-key="${CSS.escape(returned.value)}"]`)
        ?.scrollIntoView({ block: "center" });
    }
    tabsEl.value
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ inline: "nearest", block: "nearest" });
  },
  { immediate: true },
);
</script>

<template>
  <div v-if="error" class="welcome">
    <div class="msg">{{ error }}</div>
    <button class="btn" @click="go({ kat: null, plate: null, hg: null, q: null, list: null })">
      Back to vehicles
    </button>
  </div>
  <div v-else-if="!data" class="status">Loading catalog {{ appState.kat }}…</div>
  <section v-else class="pane">
    <div class="pane-head split">
      <div>
        <h1>{{ model ? model.name : `Catalog ${appState.kat}` }}</h1>
        <div class="meta">
          {{
            [
              appState.year && `Model year ${appState.year}`,
              `Catalog ${appState.kat}`,
              `${data.cat.plates.length} illustrations`,
              rows.hidden ? `${rows.hidden} hidden by vehicle data` : "",
            ]
              .filter(Boolean)
              .join("   ")
          }}
        </div>
      </div>
      <button
        v-if="data.hasNav"
        class="nav-btn"
        title="Pick parts from a picture of the vehicle"
        @click="go({ nav: '2' })"
      >
        Graphic navigation
      </button>
      <button class="nav-btn" @click="go({ paint: '1' })">Paint &amp; trim</button>
      <button
        class="nav-btn"
        title="Equipment options and the parts each one uses"
        @click="go({ equip: '1' })"
      >
        Equipment
      </button>
      <VehicleDataButton />
    </div>
    <div ref="tabsEl" class="hgs" role="tablist" aria-label="Main groups">
      <button
        v-for="g in data.hgs"
        :key="g"
        class="hg"
        role="tab"
        :aria-selected="g === appState.hg"
        :title="d.hgNames[g] || ''"
        @click="go({ hg: g }, true)"
      >
        <b>{{ g }}</b
        ><span>{{ d.hgNames[g] || "" }}</span>
      </button>
    </div>
    <div ref="tableEl" class="scroll plates" style="flex: 1">
      <table class="grid plates">
        <thead>
          <tr>
            <th><span class="sr">Thumbnail</span></th>
            <th>Illustration</th>
            <th>Description</th>
            <th>Remark</th>
            <th>Model data</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(r, i) in rows.shown"
            :key="i"
            :class="['link', { nomatch: !r.fits, returned: returned === r.p.key.trimEnd() }]"
            :data-key="r.p.key.trimEnd()"
            tabindex="0"
            @click="go({ plate: r.p.key })"
            @keydown.enter="go({ plate: r.p.key })"
            @mouseenter="rowPrefetch.enter(r.p)"
            @mouseleave="rowPrefetch.leave()"
            @focusin="previewRowFocus"
            @focusout="hidePreview()"
          >
            <td class="thumb"><ThumbBox :plate="r.p" :label="r.label" /></td>
            <td class="plno num">{{ plateLabel(r.p) }}</td>
            <td>{{ r.t.title }}</td>
            <td class="dim">{{ r.t.remark }}</td>
            <td class="dim">
              <PrMarkup :text="r.t.model" :pr-info="data.prInfo" :cat="data.cat" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
