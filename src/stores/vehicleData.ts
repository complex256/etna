// Vehicle data per catalog, with a version counter so pages re-apply it when it changes.
import { defineStore } from "pinia";
import { ref } from "vue";
import { PR } from "../lib/tables";
import {
  getVehicleData,
  setVehicleData,
  vehicleDataCount,
  type FilterContext,
  type VehicleData,
} from "../lib/vehicleFilter";

export const useVehicleData = defineStore("vehicleData", () => {
  const version = ref(0);
  /** Catalog whose vehicle-data dialog is open. */
  const dialogFor = ref<{ market: string; kat: string } | null>(null);

  function get(market: string, kat: string | number): VehicleData {
    void version.value; // reactive dependency
    return getVehicleData(market, kat);
  }
  function set(market: string, kat: string | number, f: VehicleData) {
    setVehicleData(market, kat, f);
    version.value++;
  }
  function count(market: string, kat: string | number) {
    return vehicleDataCount(get(market, kat));
  }
  /** Vehicle data plus the PR texts that applying it needs. */
  async function context(market: string, kat: string | number): Promise<FilterContext> {
    const f = get(market, kat);
    const active = vehicleDataCount(f) > 0;
    return { f, prInfo: active ? await PR.load() : null, active };
  }
  function openDialog(market: string, kat: string) {
    dialogFor.value = { market, kat };
  }
  function closeDialog() {
    dialogFor.value = null;
  }
  return { version, dialogFor, get, set, count, context, openDialog, closeDialog };
});
