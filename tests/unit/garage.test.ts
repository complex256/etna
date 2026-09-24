// The garage store: saving, matching an existing vehicle, and backups.
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { emptyVehicleData, type VehicleData } from "../../src/lib/vehicleFilter";
import { useGarage } from "../../src/stores/garage";

const data = (vin: string, codes: string[]): VehicleData => ({
  ...emptyVehicleData(),
  pr: { HUD: "KS1" },
  sticker: { vin, type: "8WH 5NY", paint: "", trim: "", codes },
});
const car = (name: string, vin = "") => ({
  name,
  market: "USA",
  model: null,
  year: "2018",
  kat: "849",
  data: data(vin, ["KS1"]),
});

describe("garage", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("adds vehicles and updates the one with the same VIN or name", () => {
    const g = useGarage();
    const a = g.put(car("Daily", "ZZZZZZF41JA000500"));
    g.put(car("Weekend"));
    expect(g.count).toBe(2);
    const renamed = g.put(car("Daily driver", "ZZZZZZF41JA000500"));
    expect(renamed.id).toBe(a.id);
    expect(g.count).toBe(2);
    g.put(car("weekend"));
    expect(g.count).toBe(2);
    expect(g.sorted.map((v) => v.name)).toEqual(["Daily driver", "weekend"]);
  });

  it("renames and deletes", () => {
    const g = useGarage();
    const a = g.put(car("Daily"));
    g.rename(a.id, "  Commuter ");
    expect(g.get(a.id)?.name).toBe("Commuter");
    g.rename(a.id, " ");
    expect(g.get(a.id)?.name).toBe("Commuter");
    g.remove(a.id);
    expect(g.count).toBe(0);
  });

  it("round-trips a backup and rejects other files", () => {
    const g = useGarage();
    g.put(car("Daily", "ZZZZZZF41JA000500"));
    g.put(car("Weekend"));
    const backup = g.exportJson();
    setActivePinia(createPinia());
    const fresh = useGarage();
    expect(fresh.importJson(backup)).toBe(2);
    expect(fresh.sorted.map((v) => [v.name, v.kat, v.data.sticker?.codes])).toEqual([
      ["Daily", "849", ["KS1"]],
      ["Weekend", "849", ["KS1"]],
    ]);
    expect(() => fresh.importJson('{"hello": 1}')).toThrow("not a garage backup");
  });
});
