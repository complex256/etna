<script setup lang="ts">
// Engine or gearbox codes with the catalogs that list them. A catalog chip opens that catalog with
// the code already entered as vehicle data.
import { modelsForCatalog } from "../lib/catalogData";
import type { EngineCode, GearboxCode } from "../lib/tables";
import { fmtMMYY } from "../lib/text";
import { appState, go } from "../router";
import { useVehicleData } from "../stores/vehicleData";

const props = defineProps<{
  kind: "engine" | "gearbox";
  rows: (EngineCode | GearboxCode)[];
  kats: Map<string, Set<number>>;
}>();
const vehicleData = useVehicleData();
const heads =
  props.kind === "engine"
    ? ["Code", "Power", "Displacement", "Cylinders", "Built", "Models", "Catalogs"]
    : ["Code", "Type", "Built", "Models", "Catalogs"];

const cats = (code: string) => [...(props.kats.get(code) || [])].sort((a, b) => a - b);
const built = (r: EngineCode | GearboxCode) => {
  const b = [fmtMMYY(r.from), fmtMMYY(r.to)];
  return b[0] || b[1] ? `${b[0] || "…"} – ${b[1] || ""}` : "";
};
const modelNames = (k: number) =>
  modelsForCatalog(appState.value.market!, k)
    .map((x) => x.model.name)
    .join(", ");
const engine = (r: EngineCode | GearboxCode) => r as EngineCode;
const gearbox = (r: EngineCode | GearboxCode) => r as GearboxCode;

function openCatalog(k: number, code: string) {
  const m = modelsForCatalog(appState.value.market!, k)[0];
  const market = m ? m.model.market : appState.value.market!;
  const f = vehicleData.get(market, String(k));
  vehicleData.set(market, String(k), { ...f, [props.kind === "engine" ? "mkb" : "gkb"]: code });
  go({
    market,
    model: m ? m.model.code : null,
    year: m ? String(m.from) : null,
    kat: String(k),
    hg: null,
    plate: null,
    codes: null,
    code: null,
    q: null,
  });
}
</script>

<template>
  <table class="grid">
    <thead>
      <tr>
        <th v-for="h in heads" :key="h">{{ h }}</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(r, i) in rows" :key="`${r.code}-${i}`">
        <td class="pn">{{ r.code }}</td>
        <template v-if="kind === 'engine'">
          <td class="num">{{ engine(r).kw ? `${engine(r).kw} kW / ${engine(r).ps} PS` : "" }}</td>
          <td class="num">{{ engine(r).litres ? `${engine(r).litres!.toFixed(1)} l` : "" }}</td>
          <td class="num">{{ engine(r).cyl || "" }}</td>
        </template>
        <td v-else>{{ gearbox(r).kind }}</td>
        <td class="num dim">{{ built(r) }}</td>
        <td>{{ r.models.join(", ") }}</td>
        <td class="plate-links">
          <button
            v-for="k in cats(r.code).slice(0, 12)"
            :key="k"
            class="chip"
            :title="modelNames(k)"
            @click="openCatalog(k, r.code)"
          >
            {{ k }}
          </button>
          <span v-if="cats(r.code).length > 12" class="dim">{{
            ` +${cats(r.code).length - 12}`
          }}</span>
        </td>
      </tr>
    </tbody>
  </table>
</template>
