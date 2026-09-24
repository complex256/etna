// Saved vehicles: their catalog and vehicle data, kept in this browser so they need entering once.
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { readJson, writeJson } from "../lib/storage";
import type { VehicleData } from "../lib/vehicleFilter";

export interface GarageVehicle {
  id: string;
  name: string;
  market: string;
  /** Model code and model year, for the page title and crumbs. */
  model: string | null;
  year: string | null;
  kat: string;
  data: VehicleData;
  savedAt: string;
}

const KEY = "etna.garage";
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const useGarage = defineStore("garage", () => {
  const vehicles = ref<GarageVehicle[]>(readJson<GarageVehicle[]>(KEY, []));
  const save = () => writeJson(KEY, vehicles.value);
  const count = computed(() => vehicles.value.length);
  const sorted = computed(() => [...vehicles.value].sort((a, b) => a.name.localeCompare(b.name)));

  /**
   * Saves a vehicle. It replaces the one with the same id, or else the one with the same VIN, or
   * else the one with the same name; otherwise it is added. Returns the saved vehicle.
   */
  function put(v: Omit<GarageVehicle, "id" | "savedAt"> & { id?: string }): GarageVehicle {
    const vin = v.data.sticker?.vin || "";
    const i = vehicles.value.findIndex(
      (x) =>
        (v.id && x.id === v.id) ||
        (vin && x.data.sticker?.vin === vin) ||
        x.name.toLowerCase() === v.name.toLowerCase(),
    );
    const saved: GarageVehicle = {
      ...v,
      id: i >= 0 ? vehicles.value[i].id : v.id || newId(),
      savedAt: new Date().toISOString(),
    };
    if (i >= 0) vehicles.value.splice(i, 1, saved);
    else vehicles.value.push(saved);
    save();
    return saved;
  }
  function rename(id: string, name: string) {
    const v = vehicles.value.find((x) => x.id === id);
    if (v && name.trim()) {
      v.name = name.trim();
      save();
    }
  }
  function remove(id: string) {
    vehicles.value = vehicles.value.filter((x) => x.id !== id);
    save();
  }
  const get = (id: string) => vehicles.value.find((x) => x.id === id);

  /** A backup file of the whole garage. */
  function exportJson() {
    return JSON.stringify(
      { app: "etna", kind: "garage", version: 1, vehicles: vehicles.value },
      null,
      2,
    );
  }
  /** Adds the vehicles of a backup file (same id or VIN: replaced). Returns how many were read. */
  function importJson(text: string): number {
    const parsed = JSON.parse(text);
    const list: unknown = Array.isArray(parsed) ? parsed : parsed?.vehicles;
    if (!Array.isArray(list)) throw new Error("This file is not a garage backup.");
    let n = 0;
    for (const raw of list as Partial<GarageVehicle>[]) {
      if (
        !raw ||
        typeof raw.name !== "string" ||
        typeof raw.market !== "string" ||
        !raw.kat ||
        !raw.data
      )
        continue;
      put({
        id: raw.id,
        name: raw.name,
        market: raw.market,
        model: raw.model ?? null,
        year: raw.year ?? null,
        kat: String(raw.kat),
        data: raw.data,
      });
      n++;
    }
    return n;
  }
  return { vehicles, sorted, count, put, rename, remove, get, exportJson, importJson };
});
