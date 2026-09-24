<script setup lang="ts">
import { computed } from "vue";
import { useSetMarket } from "../composables/useSetMarket";
import { marketName } from "../lib/markets";
import type { DecodedVin } from "../lib/vin";
import { appState, go } from "../router";
import FlagIcon from "./FlagIcon.vue";

const props = defineProps<{ v: DecodedVin }>();
const setMarket = useSetMarket();
const year = computed(
  () =>
    props.v.years.filter((y) => props.v.hits.some((x) => x.cat.year === y))[0] || props.v.years[0],
);
const market = computed(() => marketName(appState.value.market || ""));
function open(x: DecodedVin["hits"][number]) {
  go({
    market: x.model.market,
    model: x.model.code,
    year: String(x.cat.year),
    kat: String(x.cat.kat),
    hg: null,
    plate: null,
    q: null,
  });
}
</script>

<template>
  <h2>Vehicle {{ v.vin }}</h2>
  <div class="master">
    <dl>
      <dt>Manufacturer code</dt>
      <dd>{{ v.wmi }}</dd>
      <dt>Vehicle type</dt>
      <dd>{{ v.type }}</dd>
      <dt>Model year</dt>
      <dd>{{ year ? String(year) : `unknown (${v.vin[9]})` }}</dd>
      <dt>Plant</dt>
      <dd>{{ v.plant }}</dd>
      <template v-if="v.built">
        <dt>Built</dt>
        <dd>{{ v.built }} or later</dd>
      </template>
      <dt>Serial number</dt>
      <dd>{{ v.serial }}</dd>
    </dl>
  </div>
  <h2>
    {{
      v.hits.length
        ? `Matching catalogs in ${market} (${v.hits.length})`
        : `No matching catalog in ${market}`
    }}
  </h2>
  <table v-if="v.hits.length" class="grid">
    <thead>
      <tr>
        <th>Model</th>
        <th>Model year</th>
        <th>Catalog</th>
        <th>Vehicle types</th>
        <th>Matched by</th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="(x, i) in v.hits"
        :key="i"
        class="link"
        tabindex="0"
        @click="open(x)"
        @keydown.enter="open(x)"
      >
        <td>{{ x.model.name }}</td>
        <td class="num">{{ x.cat.year }}</td>
        <td class="num">{{ x.cat.kat }}</td>
        <td>{{ x.cat.types.join(", ") }}</td>
        <td class="dim">
          {{
            x.range
              ? `chassis range ${x.range.type}-${x.range.year}${x.range.plant}${String(x.range.serial).padStart(6, "0")}`
              : "type code only"
          }}
        </td>
      </tr>
    </tbody>
  </table>
  <div v-else-if="!v.otherMarkets.length" class="empty">
    No catalog lists vehicle type {{ v.type }} for model year {{ year || v.vin[9] }}. Check the VIN,
    or browse by model.
  </div>
  <div v-if="v.otherMarkets.length" class="other-markets">
    {{ v.hits.length ? "Also listed in: " : "This vehicle is listed in: " }}
    <button
      v-for="m in v.otherMarkets"
      :key="m"
      class="chip market-chip"
      :title="`Switch to ${marketName(m)}`"
      @click="setMarket(m)"
    >
      <FlagIcon :code="m" /> {{ m }}
    </button>
  </div>
</template>
