<script setup lang="ts">
// One illustration with its parts table. Hotspots and rows select each other by position.
import {
  computed,
  markRaw,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from "vue";
import AddToListButton from "../components/AddToListButton.vue";
import IllustrationStage from "../components/IllustrationStage.vue";
import VehicleDataButton from "../components/VehicleDataButton.vue";
import { navMemory } from "../composables/navMemory";
import { useLoad } from "../composables/useLoad";
import type { Illustration } from "../lib/format/tiff";
import type { Rec } from "../lib/format/records";
import { Illustrations, isError } from "../lib/illustrations";
import { Notes, PR } from "../lib/tables";
import { fmtMonth, fmtPart, lines, normPos, plateLabel, plateTitle, stripQ } from "../lib/text";
import { rowMatches } from "../lib/vehicleFilter";
import { appState, go, router } from "../router";
import { useSession } from "../stores/session";
import { useVehicleData } from "../stores/vehicleData";

const session = useSession();
const vehicleData = useVehicleData();
const d = session.dump!;
const stage = ref<InstanceType<typeof IllustrationStage>>();
const tbody = ref<HTMLElement>();
const selected = ref("");

const { data, error } = useLoad(
  () => [appState.value.market, appState.value.kat],
  async () => {
    const s = appState.value;
    const cat = await d.catalog(s.market!, s.kat!);
    const [fc, prInfo] = await Promise.all([
      vehicleData.context(s.market!, s.kat!),
      PR.load().catch(() => null),
    ]);
    return { cat, fc, prInfo };
  },
);

const index = computed(() => {
  const v = data.value;
  const key = appState.value.plate;
  return v && key ? v.cat.plates.findIndex((p) => p.key.trimEnd() === key) : -1;
});
const plate = computed(() =>
  data.value && index.value >= 0 ? data.value.cat.plates[index.value] : null,
);
const prev = computed(() => (index.value > 0 ? data.value!.cat.plates[index.value - 1] : null));
const next = computed(() =>
  data.value && index.value >= 0 ? data.value.cat.plates[index.value + 1] || null : null,
);
const title = computed(() => (plate.value ? plateTitle(plate.value) : null));

// An unknown illustration goes back to the list; the main group follows the illustration.
watch(
  [data, plate],
  ([v, p]) => {
    if (!v) return;
    if (!p) go({ plate: null }, true);
    else if (appState.value.hg !== p.hg) go({ hg: p.hg }, true);
  },
  { immediate: true },
);

/* ---------------- parts table ---------------- */

type Row =
  | { kind: "gap" }
  | { kind: "head" | "note"; title: string; sub: string }
  | {
      kind: "part";
      r: Rec;
      pos: string;
      fits: boolean;
      ben: string[];
      bem: string[];
      mod: string[];
      qty: string[];
      n: number;
      prTip: string;
      prLine: string;
      date: string;
      desc: string;
    };

const table = computed(() => {
  const v = data.value,
    p = plate.value;
  const out: Row[] = [];
  let hidden = 0;
  if (!v || !p) return { rows: out, hidden };
  const join = (a: string[]) =>
    a
      .filter(Boolean)
      .join(" ")
      .replace(/\s*\n\s*/g, " ");
  for (const r of p.rows) {
    if (r.AD === "l") {
      out.push({ kind: "gap" });
      continue;
    }
    if (r.AD === "U" || r.AD === "O" || (!r.AC && !r.AE)) {
      const t = join(lines(r.DA, r.DE)),
        sub = [join(lines(r.DB, r.DF)), join(lines(r.DC, r.DG))].filter(Boolean).join("   ");
      if (t || sub) out.push({ kind: r.AD === "U" ? "head" : "note", title: t, sub });
      continue;
    }
    const fits = !v.fc.active || rowMatches(r, v.fc.f, v.fc.prInfo);
    if (!fits && v.fc.f.hide) {
      hidden++;
      continue;
    }
    const ben = lines(r.DA, r.DE),
      bem = lines(r.DB, r.DF),
      mod = lines(r.DC, r.DG),
      qty = ((r.DD as string[]) || []).map(stripQ);
    let prTip = "",
      prLine = "";
    if (r.C0 && r.C0.length) {
      prTip = (r.C0 as string[])
        .map((c) => {
          const code = c.trim(),
            g = v.prInfo?.code.get(code),
            pr = v.cat.pr.get(code);
          const text = g?.text || (pr ? lines(pr.DA, pr.DF).filter(Boolean).join(" ") : "");
          return text ? `${code}: ${text}` : code;
        })
        .join("\n");
      // Model text usually already spells out the PR codes; only add them when it does not.
      if (!mod.some((s) => /PR[:-]/.test(s)))
        prLine = "PR-" + (r.C0 as string[]).map(stripQ).join("/");
    }
    out.push({
      kind: "part",
      r,
      pos: normPos(r.AE),
      fits,
      ben,
      bem,
      mod,
      qty,
      n: Math.max(ben.length, bem.length, mod.length, qty.length, 1),
      prTip,
      prLine,
      date: r.BA || r.BB ? `${fmtMonth(r.BA) || "…"} » ${fmtMonth(r.BB) || "…"}` : "",
      desc: ben.filter(Boolean).join(" ").replace(/\n/g, " "),
    });
  }
  return { rows: out, hidden };
});
const positions = computed(
  () =>
    new Set(
      table.value.rows.flatMap((r) => (r.kind === "part" && r.pos && r.pos !== "-" ? [r.pos] : [])),
    ),
);
const cell = (arr: string[], n: number) =>
  Array.from({ length: n }, (_, i) => (arr[i] || "").trim() || " ");

/* ---------------- illustration ---------------- */

const img = shallowRef<Illustration | null>(null);
const imgError = ref("");
const canvas = computed(() => (img.value ? markRaw(Illustrations.canvas(img.value)) : null));
let imgSeq = 0;
watch(
  plate,
  async (p) => {
    if (!p) return;
    const my = ++imgSeq;
    selected.value = "";
    const loaded = await Illustrations.get(p);
    if (my !== imgSeq) return;
    if (isError(loaded)) {
      img.value = null;
      imgError.value = loaded.error;
      return;
    }
    imgError.value = "";
    img.value = loaded;
    // Next is the likelier move, so warm it first.
    Illustrations.prefetch(next.value ?? undefined, { draw: true });
    Illustrations.prefetch(prev.value ?? undefined, { draw: true });
  },
  { immediate: true },
);

function select(pos: string, from: "row" | "hot") {
  selected.value = pos;
  if (!pos) return;
  nextTick(() => {
    if (from === "hot")
      tbody.value
        ?.querySelector("tr.hit")
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    if (from === "row" && img.value) {
      const hs = img.value.hotspots.find((h) => normPos(h.label) === pos);
      if (hs) stage.value?.reveal(hs.x, hs.y);
    }
  });
}
function openPart(r: Rec, pos: string) {
  select(pos, "row");
  go({ part: r.AC.trimEnd() });
}

/* ---------------- note, navigation ---------------- */

const note = ref<{ text: string; fallback: boolean } | null>(null);
watch(
  plate,
  async (p) => {
    note.value = null;
    if (!p) return;
    const s = appState.value;
    const n = await Notes.plate(s.kat!, p.key, s.market!).catch(() => null);
    if (plate.value === p) note.value = n;
  },
  { immediate: true },
);

// Back: to the list (on this illustration's main group) or wherever the illustration was opened from.
const back = computed(() => {
  const o = navMemory.origin;
  const s = appState.value;
  const os = o?.state;
  const sameKat = os && os.kat === s.kat && os.market === s.market;
  const toList = !os || (sameKat && !os.q && !os.nav && !os.ts && !os.list);
  const label = toList
    ? "Back to the list"
    : os!.nav
      ? "Back to graphic navigation"
      : os!.q
        ? "Back to search results"
        : "Back";
  return { toList, label, path: o?.path };
});
function goBack() {
  const p = plate.value;
  if (p) navMemory.setReturnTo(p.key);
  if (back.value.toList) go({ plate: null, part: null, hg: p?.hg ?? null });
  else router.push(back.value.path!);
}
const goPlate = (key: string | undefined) => key && go({ plate: key }, true);

function onKey(e: KeyboardEvent) {
  if ((e.target as Element).closest?.("input, select, textarea")) return;
  if (e.key === "ArrowLeft" && prev.value) goPlate(prev.value.key);
  else if (e.key === "ArrowRight" && next.value) goPlate(next.value.key);
  else if (
    e.key === "Backspace" &&
    !appState.value.part &&
    !document.querySelector("dialog[open]")
  ) {
    e.preventDefault();
    goBack();
  }
}
onMounted(() => document.addEventListener("keydown", onKey));
onBeforeUnmount(() => document.removeEventListener("keydown", onKey));
</script>

<template>
  <div v-if="error" class="welcome">
    <div class="msg">{{ error }}</div>
    <button class="btn" @click="go({ kat: null, plate: null, hg: null })">Back to vehicles</button>
  </div>
  <div v-else-if="!plate || !title" class="status">Loading illustration…</div>
  <div v-else class="pane">
    <div class="plate-head">
      <button class="nav-btn" :title="`${back.label} (Backspace)`" @click="goBack">← Back</button>
      <div class="t">
        <b>{{ plateLabel(plate) }}</b>
        <div>{{ [title.title, title.remark, title.model].filter(Boolean).join(" — ") }}</div>
      </div>
      <VehicleDataButton />
      <div class="prev-next">
        <button
          class="nav-btn"
          :disabled="!prev"
          title="Previous illustration (←)"
          @click="goPlate(prev?.key)"
        >
          ‹ Prev
        </button>
        <button
          class="nav-btn"
          :disabled="!next"
          title="Next illustration (→)"
          @click="goPlate(next?.key)"
        >
          Next ›
        </button>
      </div>
    </div>
    <div v-if="note" class="note-bar">
      <b>Note</b><span v-if="note.fallback" class="dim">{{ " (German)" }}</span
      >{{ " " + note.text }}
    </div>
    <div class="plate">
      <IllustrationStage
        v-if="img && canvas"
        ref="stage"
        :key="plate.key"
        :canvas="canvas"
        :width="img.width"
        :height="img.height"
        label="Illustration. Drag to pan, scroll or press + and − to zoom."
      >
        <div
          v-for="(hs, i) in img.hotspots"
          :key="i"
          :class="[
            'hot',
            {
              nomatch: !positions.has(normPos(hs.label)),
              on: selected && normPos(hs.label) === selected,
            },
          ]"
          :title="positions.has(normPos(hs.label)) ? `Position ${hs.label}` : undefined"
          :data-interactive="positions.has(normPos(hs.label)) ? '' : undefined"
          :style="{ left: `${hs.x}px`, top: `${hs.y}px`, width: `${hs.w}px`, height: `${hs.h}px` }"
          @click.stop="positions.has(normPos(hs.label)) && select(normPos(hs.label), 'hot')"
        />
      </IllustrationStage>
      <div v-else class="stage-wrap">
        <div class="stage">
          <div class="stage-note">{{ imgError || "Loading illustration…" }}</div>
        </div>
      </div>
      <div class="parts-wrap">
        <table class="grid parts">
          <thead>
            <tr>
              <th>Pos</th>
              <th>Part number</th>
              <th>Description</th>
              <th>Remark</th>
              <th>Qty</th>
              <th>Model data</th>
              <th><span class="sr">Add</span></th>
            </tr>
          </thead>
          <tbody ref="tbody">
            <template v-for="(row, i) in table.rows" :key="i">
              <tr v-if="row.kind === 'gap'" class="gap">
                <td colspan="7" />
              </tr>
              <tr v-else-if="row.kind !== 'part'" :class="row.kind">
                <td />
                <td colspan="6">
                  <div v-if="row.title">{{ row.title }}</div>
                  <div v-if="row.sub" class="sub">{{ row.sub }}</div>
                </td>
              </tr>
              <tr
                v-else
                :class="['part', { nomatch: !row.fits, hit: selected && row.pos === selected }]"
                tabindex="0"
                :data-pos="row.pos"
                @click="select(row.pos, 'row')"
                @keydown.enter="select(row.pos, 'row')"
              >
                <td class="pos">{{ row.r.AE && row.r.AE !== "-" ? row.r.AE : "" }}</td>
                <td>
                  <button
                    v-if="row.r.AC"
                    class="linkish pn"
                    title="Show part details"
                    @click.stop="openPart(row.r, row.pos)"
                  >
                    {{ fmtPart(row.r.AC) }}
                  </button>
                </td>
                <td>
                  <div v-for="(l, k) in cell(row.ben, row.n)" :key="k" class="l">{{ l }}</div>
                </td>
                <td class="dim">
                  <div v-for="(l, k) in cell(row.bem, row.n)" :key="k" class="l">{{ l }}</div>
                </td>
                <td class="qty num">
                  <div v-for="(l, k) in cell(row.qty, row.n)" :key="k" class="l">{{ l }}</div>
                </td>
                <td :title="row.prTip || undefined" :class="{ 'has-pr': row.prTip }">
                  <div v-for="(l, k) in cell(row.mod, row.n)" :key="k" class="l">{{ l }}</div>
                  <div v-if="row.prLine" class="l">
                    <span class="pr" :title="row.prTip">{{ row.prLine }}</span>
                  </div>
                  <div v-if="row.date" class="l date">{{ row.date }}</div>
                </td>
                <td class="add">
                  <AddToListButton v-if="row.r.AC" :pn="row.r.AC" :text="row.desc" />
                </td>
              </tr>
            </template>
          </tbody>
        </table>
        <div v-if="table.hidden" class="empty">
          {{ table.hidden }} parts hidden because they do not fit the vehicle data.
        </div>
      </div>
    </div>
  </div>
</template>
