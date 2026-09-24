<script setup lang="ts">
// Part rows grouped by illustration, each part linked to its details and the parts list.
import { computed } from "vue";
import { currentSource } from "../composables/currentSource";
import { useFlash } from "../composables/useFlash";
import type { Plate } from "../lib/dump";
import type { RowHit } from "../lib/equipment";
import type { Rec } from "../lib/format/records";
import { fmtPart, oneLine, plateLabel, plateTitle, stripQ } from "../lib/text";
import { go } from "../router";
import { usePartsList } from "../stores/partsList";
import AddToListButton from "./AddToListButton.vue";

const props = defineProps<{
  title: string;
  hits: RowHit[];
  addAll?: boolean;
  emptyText?: string;
  tone?: string;
  collapsed?: boolean;
  note?: string;
}>();
const list = usePartsList();
const { label: addAllLabel, flash } = useFlash("Add all to parts list");

const byPlate = computed(() => {
  const m = new Map<Plate, Rec[]>();
  for (const h of props.hits) {
    if (!m.has(h.plate)) m.set(h.plate, []);
    m.get(h.plate)!.push(h.row);
  }
  return [...m];
});
const partNos = computed(() => [...new Set(props.hits.map((x) => x.row.AC.trimEnd()))]);
const heading = computed(
  () =>
    `${props.title} (${partNos.value.length} part numbers, ${byPlate.value.length} illustrations)`,
);
const desc = (r: Rec) => oneLine(r.DA, r.DE);
const qty = (r: Rec) => ((r.DD as string[]) || []).map(stripQ).filter(Boolean)[0] || "";

function addAll() {
  for (const h of props.hits) list.add(h.row.AC, desc(h.row), currentSource(h.plate.key));
  flash(`Added ${partNos.value.length}`);
}
</script>

<template>
  <component :is="collapsed ? 'details' : 'section'" :class="['equip-section', tone]">
    <component :is="collapsed ? 'summary' : 'div'">
      <div class="equip-section-head">
        <h3>{{ heading }}</h3>
        <button v-if="addAll && hits.length" class="btn" @click.stop.prevent="addAll">
          {{ addAllLabel }}
        </button>
      </div>
    </component>
    <p v-if="note" class="dim">{{ note }}</p>
    <div v-if="!hits.length" class="empty">{{ emptyText || "None." }}</div>
    <div v-for="([plate, rows], pi) in byPlate" :key="pi" class="equip-plate">
      <div class="equip-plate-head">
        <button class="linkish" @click="go({ plate: plate.key, hg: plate.hg, equip: null })">
          {{ plateLabel(plate) }}
        </button>
        <span class="dim">{{ " " + plateTitle(plate).title.replace(/\n/g, " ") }}</span>
      </div>
      <table class="grid mini">
        <tbody>
          <tr v-for="(r, i) in rows" :key="i" :class="tone">
            <td class="pos">{{ r.AE && r.AE !== "-" ? r.AE : "" }}</td>
            <td>
              <button class="linkish pn" @click="go({ part: r.AC.trimEnd() })">
                {{ fmtPart(r.AC) }}
              </button>
            </td>
            <td>{{ desc(r) }}</td>
            <td class="qty num">{{ qty(r) }}</td>
            <td class="dim">{{ oneLine(r.DC, r.DG) }}</td>
            <td class="add">
              <AddToListButton :pn="r.AC" :text="desc(r)" :source="currentSource(plate.key)" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </component>
</template>
