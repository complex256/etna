<script setup lang="ts">
// One option: the parts a retrofit needs, the parts it replaces, and rows that also depend on other
// equipment. The baseline is the vehicle's code in the family, else its "Without …" option.
import { computed, ref } from "vue";
import { retrofit, type RowHit } from "../lib/equipment";
import type { PrInfo } from "../lib/tables";
import { rowMatches, vehicleDataCount, type VehicleData } from "../lib/vehicleFilter";
import RowGroup from "./RowGroup.vue";

const props = defineProps<{
  code: string;
  index: Map<string, RowHit[]>;
  f: VehicleData;
  prInfo: PrInfo;
}>();
/** undefined = default baseline, null = nothing in this family, or a code. */
const compareWith = ref<string | null | undefined>(undefined);
const r = computed(() =>
  retrofit(props.code, props.index, props.f, props.prInfo, compareWith.value),
);
const text = (c: string) => props.prInfo.code.get(c)?.text || "";
const hasData = computed(() => vehicleDataCount(props.f) > 0);
const onVehicle = computed(() =>
  r.value.all.filter((x) => rowMatches(x.row, props.f, props.prInfo)),
);
</script>

<template>
  <div>
    <div class="equip-head">
      <h2>
        <span class="equip-code big">{{ code }}</span> {{ text(code) || "Unknown code" }}
      </h2>
      <div class="dim">
        {{
          [
            r.famName && `Family: ${r.famName} (${r.fam})`,
            `${r.all.length} part rows mention this code`,
          ]
            .filter(Boolean)
            .join(". ")
        }}
      </div>
      <div v-if="r.known === code" class="equip-current">Your vehicle already has this option.</div>
      <div v-else-if="r.known" class="equip-current">
        Your vehicle has <span class="equip-code">{{ r.known }}</span> {{ text(r.known) }}.
      </div>
      <div v-else-if="r.fam !== '—'" class="equip-current">
        Your vehicle data has no code for this family{{
          r.base ? `, so it is compared with ${r.base} ${text(r.base)}` : ""
        }}. Change the comparison if your car has something else.
      </div>
      <label v-if="r.fam !== '—' && r.famCodes.length > 1" class="field inline equip-compare">
        <span>Compare with</span>
        <select @change="compareWith = ($event.target as HTMLSelectElement).value || null">
          <option value="" :selected="!r.base">nothing in this family</option>
          <option
            v-for="c in r.famCodes.filter((x) => x !== code)"
            :key="c"
            :value="c"
            :selected="c === r.base"
          >
            {{ c }} {{ text(c) }}{{ c === r.known ? "  (your vehicle)" : "" }}
          </option>
        </select>
      </label>
    </div>
    <p v-if="!hasData" class="dim">
      No vehicle data is entered for this catalog, so engine, gearbox and other equipment are not
      taken into account. Enter the data sticker under “Vehicle data” for an exact list.
    </p>
    <RowGroup
      v-if="r.known === code"
      title="Parts for this option on your vehicle"
      :hits="onVehicle"
    />
    <template v-else>
      <RowGroup
        :title="`Parts you would need for ${code}`"
        :hits="r.need"
        add-all
        empty-text="No parts differ. The option may be software or coding only, or it is not built for this vehicle."
      />
      <RowGroup
        :title="`Parts fitted with ${r.base || 'the current setup'} that ${code} replaces`"
        :hits="r.replaced"
        tone="removed"
      />
      <RowGroup
        v-if="r.depends.length"
        :title="`Also mention ${code} but depend on other equipment`"
        :hits="r.depends"
        tone="depends"
        collapsed
        note="These rows need further codes (or another engine or gearbox) besides this option. Check their model data: a retrofit may need those too."
      />
    </template>
  </div>
</template>
