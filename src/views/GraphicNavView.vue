<script setup lang="ts">
// Graphic navigation: a picture of the car (views 1-4) with labelled areas; illustrations are tagged
// with the same category text ids (catalog field OB).
import { computed, markRaw, nextTick, ref, watch } from "vue";
import IllustrationStage from "../components/IllustrationStage.vue";
import NavPlateList from "../components/NavPlateList.vue";
import VehicleDataButton from "../components/VehicleDataButton.vue";
import { useLoad } from "../composables/useLoad";
import { navGroupKey, navGroups, navPicture, navRefs, type NavGroup } from "../lib/catalogData";
import type { Plate } from "../lib/dump";
import { layoutPins, type PinPlacement } from "../lib/format/zgd";
import { drawNavPicture } from "../lib/illustrations";
import { ModelCodes, PR } from "../lib/tables";
import { plateFits } from "../lib/vehicleFilter";
import { appState, go } from "../router";
import { useSession } from "../stores/session";
import { useVehicleData } from "../stores/vehicleData";

const session = useSession();
const vehicleData = useVehicleData();
const d = session.dump!;
const viewNo = computed(() =>
  appState.value.nav && /^[1-4]$/.test(appState.value.nav) ? appState.value.nav : "2",
);
const model = computed(() => d.model(appState.value.market, appState.value.model));
const shownId = ref<number | null>(null);

const { data, error } = useLoad(
  () => [appState.value.market, appState.value.kat],
  async () => {
    const s = appState.value;
    const [cat, refs, prInfo, models, fc] = await Promise.all([
      d.catalog(s.market!, s.kat!),
      navRefs(s.kat!),
      PR.load().catch(() => null),
      ModelCodes.forCatalog(s.market!, s.kat!).catch(() => []),
      vehicleData.context(s.market!, s.kat!),
    ]);
    const groups = navGroups(refs);
    // Pre-select from the vehicle data: the sticker's type, then its PR codes (e.g. 2- vs 4-door).
    const sticker = fc.f.sticker;
    const myType = (sticker?.type || "").replace(/\s+/g, "").slice(0, 3).toUpperCase();
    const myCodes = new Set(sticker?.codes || []);
    const score = (g: NavGroup) =>
      (myType && g.types.includes(myType) ? 2 : 0) +
      (g.pr.some((c) => myCodes.has(c)) ? 1 : 0) -
      (g.pr.length && myCodes.size && !g.pr.some((c) => myCodes.has(c)) ? 1 : 0);
    const best = groups.reduce((a, g) => (score(g) > score(a) ? g : a), groups[0]);
    const mine = best && score(best) > 0 ? best : null;
    // Name a group after its types' model descriptions, minus the engine size ("Estate 2.0" -> "Estate").
    const describe = (g: NavGroup) => {
      // Descriptions vary in case ("estate car" vs "Estate Car"); prefer properly cased, then shortest.
      const texts = g.types
        .map(
          (t) =>
            models
              .filter((m) => m.code.startsWith(t))
              .map((m) =>
                m.text
                  .replace(/\s+/g, " ")
                  .replace(/\s+\d[.,]\d.*$/, "")
                  .trim(),
              )
              .filter(Boolean)
              .sort(
                (a, b) =>
                  Number(/^[A-Z]/.test(b)) - Number(/^[A-Z]/.test(a)) || a.length - b.length,
              )[0],
        )
        .filter(Boolean)
        .map((x) => x.replace(/^[a-z]/, (c) => c.toUpperCase()));
      const pr = g.pr.map((c) => prInfo?.code.get(c)?.text || c).join(", ");
      const what = [[...new Set(texts)].join(" / "), pr && `(${pr})`].filter(Boolean).join(" ");
      return what ? `${g.types.join(", ")}: ${what}` : g.types.join(", ");
    };
    // Vehicle data applies here as in the illustration list: plates that do not fit are dimmed, or
    // left out when the filter is set to hide them.
    const fits = new Set(cat.plates.filter((p) => plateFits(p, fc)));
    const byCat = new Map<number, Plate[]>(),
      hiddenIn = new Map<number, number>();
    for (const p of cat.plates)
      for (const id of p.nav || []) {
        if (!fits.has(p) && fc.f.hide) {
          hiddenIn.set(id, (hiddenIn.get(id) || 0) + 1);
          continue;
        }
        if (!byCat.has(id)) byCat.set(id, []);
        byCat.get(id)!.push(p);
      }
    return { cat, prInfo, fc, groups, mine, describe, fits, byCat, hiddenIn };
  },
);

const chosen = computed(() => {
  const v = data.value;
  if (!v) return null;
  return (
    v.groups.find((g) => navGroupKey(g) === appState.value.navref) || v.mine || v.groups[0] || null
  );
});
// No picture sets for this catalog: back to the illustration list.
watch(data, (v) => v && !v.groups.length && go({ nav: null }, true));

const picture = useLoad(
  () => [chosen.value && navGroupKey(chosen.value), viewNo.value],
  async () => {
    const g = chosen.value;
    if (!g) return null;
    const img = await navPicture(g.ref, viewNo.value);
    return img ? { img, canvas: markRaw(drawNavPicture(img)) } : { img: null, canvas: null };
  },
);
const img = computed(() => picture.data.value?.img ?? null);
// Another view or picture set starts from its overview of areas.
watch(
  () => [viewNo.value, chosen.value && navGroupKey(chosen.value)],
  () => (shownId.value = null),
);

const fitCount = (id: number) =>
  (data.value!.byCat.get(id) || []).filter((p) => data.value!.fits.has(p)).length;
const countText = (id: number) => {
  const v = data.value!;
  const n = (v.byCat.get(id) || []).length,
    fit = fitCount(id),
    hid = v.hiddenIn.get(id) || 0;
  if (!v.fc.active) return `${n} illustrations`;
  return [
    v.fc.f.hide
      ? `${n} illustrations fit your vehicle`
      : `${fit} of ${n} illustrations fit your vehicle`,
    hid && `${hid} hidden`,
  ]
    .filter(Boolean)
    .join(", ");
};
const shownCount = (id: number) =>
  data.value!.fc.active ? fitCount(id) : (data.value!.byCat.get(id) || []).length;
const text = (id: number) => d.text(id).replace(/\n/g, " ");
const areas = computed(() =>
  img.value
    ? [...new Set(img.value.labels.map((l) => l.id))].sort((a, b) =>
        d.text(a).localeCompare(d.text(b)),
      )
    : [],
);

/* ---------------- labels on the picture ---------------- */

// Each label: a dot at its anchor, the label (moved off neighbours when needed) and a leader line.
// The anchor box is counter-scaled, so everything inside it is in screen pixels.
// Indexed like img.labels (function refs: v-for ref arrays are not kept in order).
const pinEls: (HTMLElement | null)[] = [];
const placements = ref<PinPlacement[]>([]);
let sizes: { w: number; h: number }[] = [];
let lastScale = 1;
function measure() {
  sizes = img.value
    ? img.value.labels.map((_, i) => ({
        w: pinEls[i]?.offsetWidth || 0,
        h: pinEls[i]?.offsetHeight || 0,
      }))
    : [];
}
function layout(scale: number) {
  lastScale = scale;
  const labels = img.value?.labels;
  if (!labels) return;
  if (sizes.length !== labels.length) measure();
  placements.value = layoutPins(
    labels.map((l, i) => ({ x: l.x, y: l.y, w: sizes[i].w, h: sizes[i].h })),
    scale,
  );
}
watch(img, async () => {
  sizes = [];
  placements.value = [];
  await nextTick();
  measure();
  layout(lastScale);
});
// Label widths change once the web font arrives: measure again then.
document.fonts?.ready.then(() => {
  measure();
  layout(lastScale);
});
const pinStyle = (i: number) => {
  const p = placements.value[i];
  return p ? { left: `${p.left}px`, top: `${p.top}px` } : { visibility: "hidden" as const };
};
const leaderStyle = (i: number) => {
  const p = placements.value[i];
  return p ? { width: `${p.len}px`, transform: `rotate(${p.angle}rad)` } : {};
};
</script>

<template>
  <div v-if="error" class="welcome">
    <div class="msg">{{ error }}</div>
  </div>
  <div v-else-if="!data" class="status">Loading graphic navigation…</div>
  <section v-else class="pane">
    <div class="pane-head split">
      <div>
        <h1>{{ model ? model.name : `Catalog ${appState.kat}` }}</h1>
        <div class="meta">Graphic navigation, catalog {{ appState.kat }}</div>
      </div>
      <label v-if="data.groups.length > 1" class="field inline">
        <span>Variant</span>
        <select @change="go({ navref: ($event.target as HTMLSelectElement).value }, true)">
          <option
            v-for="g in data.groups"
            :key="navGroupKey(g)"
            :value="navGroupKey(g)"
            :selected="g === chosen"
          >
            {{ data.describe(g) }}{{ g === data.mine ? "  (your vehicle)" : "" }}
          </option>
        </select>
      </label>
      <div class="view-tabs" role="tablist" aria-label="Views">
        <button
          v-for="v in ['1', '2', '3', '4']"
          :key="v"
          :class="['nav-btn', { active: v === viewNo }]"
          role="tab"
          :aria-selected="v === viewNo"
          @click="go({ nav: v }, true)"
        >
          View {{ v }}
        </button>
      </div>
      <VehicleDataButton />
      <button class="nav-btn" @click="go({ nav: null, navref: null })">Main groups</button>
    </div>
    <div class="plate nav-layout">
      <IllustrationStage
        v-if="img && picture.data.value?.canvas"
        :key="`${chosen && navGroupKey(chosen)}-${viewNo}`"
        :canvas="picture.data.value.canvas"
        :width="img.width"
        :height="img.height"
        label="Vehicle picture. Choose a labelled area to list its illustrations."
        @zoom="layout"
      >
        <!-- Two layers at the same anchor: dots and leader lines below, labels above, so a line never
             crosses another label's text. -->
        <span
          v-for="(l, i) in img.labels"
          :key="`line-${i}`"
          :class="['pin-anchor', 'lines', { moved: (placements[i]?.len ?? 0) > 1 }]"
          :style="{ left: `${l.x}px`, top: `${l.y}px` }"
          aria-hidden="true"
        >
          <span class="pin-leader" :style="leaderStyle(i)" />
          <span class="pin-dot" />
        </span>
        <span
          v-for="(l, i) in img.labels"
          :key="`pin-${i}`"
          class="pin-anchor"
          :data-id="l.id"
          :style="{ left: `${l.x}px`, top: `${l.y}px` }"
        >
          <button
            :ref="(el) => (pinEls[i] = el as HTMLElement | null)"
            :class="['pin', { empty: !shownCount(l.id), on: shownId === l.id }]"
            :data-id="l.id"
            data-interactive
            :title="`${text(l.id)} (${countText(l.id)})`"
            :style="pinStyle(i)"
            @click.stop="shownId = l.id"
          >
            {{ text(l.id) }}
          </button>
        </span>
      </IllustrationStage>
      <div v-else class="stage-wrap">
        <div class="stage">
          <div class="stage-note">
            {{
              picture.loading.value
                ? "Loading picture…"
                : `Navigation picture ${chosen?.ref}${viewNo}.zgd is not in this dump.`
            }}
          </div>
        </div>
      </div>
      <div class="nav-list">
        <NavPlateList
          v-if="shownId !== null"
          :key="shownId"
          :title="text(shownId)"
          :count-text="countText(shownId)"
          :plates="data.byCat.get(shownId) || []"
          :fits="data.fits"
          :pr-info="data.prInfo"
          :cat="data.cat"
        />
        <template v-else>
          <div class="nav-list-head"><b>Areas in this view</b></div>
          <ul v-if="areas.length" class="plain areas">
            <li v-for="id in areas" :key="id">
              <button class="linkish" @click="shownId = id">{{ text(id) }}</button>
              <span class="dim"> {{ shownCount(id) }}</span>
            </li>
          </ul>
          <div v-else-if="!picture.loading.value" class="empty">
            This view has no labelled areas. Try another view.
          </div>
        </template>
      </div>
    </div>
  </section>
</template>
