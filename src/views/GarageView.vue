<script setup lang="ts">
// Saved vehicles. Opening one applies its vehicle data to its catalog and goes there.
import { nextTick, ref } from "vue";
import { useFlash } from "../composables/useFlash";
import { modelsForCatalog } from "../lib/catalogData";
import { go } from "../router";
import { useGarage, type GarageVehicle } from "../stores/garage";
import { useSession } from "../stores/session";
import { useVehicleData } from "../stores/vehicleData";

const garage = useGarage();
const vehicleData = useVehicleData();
const session = useSession();
const d = session.dump!;
const fileInput = ref<HTMLInputElement>();
const message = ref("");
const renaming = ref<string | null>(null);
const newName = ref("");
const renameInput = ref<HTMLInputElement[]>([]);
const armed = ref<{ id: string; at: number } | null>(null);
const { label: exportLabel, flash: flashExport } = useFlash("Export backup");

const vehicleName = (v: GarageVehicle) => {
  const m = d.model(v.market, v.model) ?? modelsForCatalog(v.market, +v.kat)[0]?.model;
  return [m ? m.name : `Catalog ${v.kat}`, v.year].filter(Boolean).join(" ");
};
const saved = (v: GarageVehicle) => new Date(v.savedAt).toLocaleDateString();

function open(v: GarageVehicle) {
  vehicleData.set(v.market, v.kat, v.data);
  go({
    market: v.market,
    model: v.model,
    year: v.year,
    kat: v.kat,
    hg: null,
    plate: null,
    nav: null,
    paint: null,
    equip: null,
    garage: null,
    list: null,
    q: null,
    ts: null,
    codes: null,
    part: null,
  });
}
async function startRename(v: GarageVehicle) {
  renaming.value = v.id;
  newName.value = v.name;
  await nextTick();
  renameInput.value[0]?.select();
}
function finishRename(save: boolean) {
  if (save && renaming.value) garage.rename(renaming.value, newName.value);
  renaming.value = null;
}
// Two-step delete: the first click arms the button instead of opening a blocking dialog.
function remove(v: GarageVehicle) {
  if (armed.value?.id === v.id && Date.now() - armed.value.at < 4000) {
    garage.remove(v.id);
    armed.value = null;
  } else armed.value = { id: v.id, at: Date.now() };
}
const isArmed = (v: GarageVehicle) => armed.value?.id === v.id;

function exportBackup() {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([garage.exportJson()], { type: "application/json" }));
  a.download = "etna-garage.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  flashExport("Downloaded");
}
async function importBackup(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const n = garage.importJson(await file.text());
    message.value = n
      ? `Added ${n} vehicle${n === 1 ? "" : "s"} from ${file.name}.`
      : `${file.name} has no vehicles.`;
  } catch (err) {
    message.value = `Could not read ${file.name}: ${(err as Error).message}`;
  }
  (e.target as HTMLInputElement).value = "";
}
</script>

<template>
  <section class="pane">
    <div class="pane-head">
      <h1>Garage</h1>
      <div class="meta">
        {{
          garage.count
            ? `${garage.count} saved vehicle${garage.count === 1 ? "" : "s"}`
            : "No saved vehicles yet"
        }}. Saved in this browser only; export a backup to keep them or move them to another
        browser.
      </div>
      <div class="toolbar">
        <button class="btn" :disabled="!garage.count" @click="exportBackup">
          {{ exportLabel }}
        </button>
        <button class="btn" @click="fileInput?.click()">Import backup</button>
        <input
          ref="fileInput"
          type="file"
          accept="application/json,.json"
          hidden
          @change="importBackup"
        />
      </div>
      <div v-if="message" class="sticker-note" role="status">{{ message }}</div>
    </div>
    <div v-if="!garage.count" class="welcome">
      <h1>Save a vehicle once, open it any time</h1>
      <p>
        Open the vehicle’s catalog, enter its data sticker under “Vehicle data”, and choose “Save to
        garage”. The vehicle then opens here with its catalog and equipment codes already set, and
        the Vehicle data dialog of any catalog can load it.
      </p>
    </div>
    <div v-else class="scroll" style="flex: 1">
      <table class="grid garage">
        <thead>
          <tr>
            <th>Name</th>
            <th>Vehicle</th>
            <th>VIN</th>
            <th>Type</th>
            <th>Engine / gearbox</th>
            <th>Equipment</th>
            <th>Saved</th>
            <th><span class="sr">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="v in garage.sorted" :key="v.id">
            <td>
              <input
                v-if="renaming === v.id"
                ref="renameInput"
                v-model="newName"
                class="garage-rename"
                :aria-label="`New name for ${v.name}`"
                @keydown.enter.prevent="finishRename(true)"
                @keydown.escape.prevent="finishRename(false)"
                @blur="finishRename(true)"
              />
              <b v-else>{{ v.name }}</b>
            </td>
            <td>
              {{ vehicleName(v) }}
              <div class="dim">{{ v.market }}, catalog {{ v.kat }}</div>
            </td>
            <td class="pn">{{ v.data.sticker?.vin || "" }}</td>
            <td class="pn">{{ v.data.sticker?.type || "" }}</td>
            <td class="pn">{{ [v.data.mkb, v.data.gkb].filter(Boolean).join(" / ") }}</td>
            <td class="dim">{{ v.data.sticker?.codes.length ?? 0 }} equipment codes</td>
            <td class="dim num">{{ saved(v) }}</td>
            <td class="garage-actions">
              <button class="btn primary" @click="open(v)">Open</button>
              <button class="btn" @click="startRename(v)">Rename</button>
              <button class="btn danger" :aria-label="`Delete ${v.name}`" @click="remove(v)">
                {{ isArmed(v) ? "Click again to delete" : "Delete" }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
