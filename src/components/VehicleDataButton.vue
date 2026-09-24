<script setup lang="ts">
import { computed } from "vue";
import { appState } from "../router";
import { useVehicleData } from "../stores/vehicleData";

const vehicleData = useVehicleData();
const n = computed(() =>
  appState.value.market && appState.value.kat
    ? vehicleData.count(appState.value.market, appState.value.kat)
    : 0,
);
function open() {
  const s = appState.value;
  if (s.market && s.kat) vehicleData.openDialog(s.market, s.kat);
}
</script>

<template>
  <button
    :class="['nav-btn', { active: n }]"
    title="Enter engine, gearbox and equipment codes to rule out parts that do not fit"
    @click="open"
  >
    {{ n ? `Vehicle data (${n})` : "Vehicle data" }}
  </button>
</template>
