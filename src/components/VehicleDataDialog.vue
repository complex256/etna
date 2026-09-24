<script setup lang="ts">
// Vehicle data entry laid out like the car's data sticker. Equipment codes replace others of the
// same family; family dropdowns stay in sync with the codes.
import { computed, nextTick, onMounted, ref, shallowRef } from "vue";
import { modelsForCatalog, paintData, type PaintData } from "../lib/catalogData";
import {
  ModelCodes,
  PR,
  VehicleCodes,
  type CatalogVehicleCodes,
  type ModelCode,
  type PrInfo,
} from "../lib/tables";
import { useFlash } from "../composables/useFlash";
import { codesIn, emptyVehicleData, type CodeSets, type VehicleData } from "../lib/vehicleFilter";
import { appState } from "../router";
import { useGarage } from "../stores/garage";
import { useSession } from "../stores/session";
import { useVehicleData } from "../stores/vehicleData";
import StickerHelp from "./StickerHelp.vue";

const props = defineProps<{ market: string; kat: string }>();
const emit = defineEmits<{ close: [] }>();
const session = useSession();
const vehicleData = useVehicleData();
const garage = useGarage();
const d = session.dump!;
const dlg = ref<HTMLDialogElement>();
const form = ref<HTMLFormElement>();
const codeInput = ref<HTMLInputElement>();
const helpBtn = ref<HTMLButtonElement>();

interface Ctx {
  prInfo: PrInfo;
  vcodes: CatalogVehicleCodes;
  paint: PaintData | null;
  models: ModelCode[];
  sets: CodeSets;
}
const ctx = shallowRef<Ctx | null>(null);
const f = vehicleData.get(props.market, props.kat);
const st = { vin: "", type: "", paint: "", trim: "", ...f.sticker };
const codes = ref<string[]>(f.sticker?.codes ? [...f.sticker.codes] : Object.values(f.pr));
const fields = ref({
  vin: st.vin,
  type: st.type,
  mkb: f.mkb,
  gkb: f.gkb,
  paint: st.paint,
  trim: st.trim,
});
const hide = ref(f.hide);
const pending = ref("");
const replacedNote = ref("");
const help = ref(false);
const famSearch = ref("");

const model = computed(() => d.model(appState.value.market, appState.value.model));
const catEntry = computed(() =>
  model.value?.catalogs.find((c) => String(c.kat) === String(props.kat)),
);
// A code affects the catalog when its family occurs in it: "without roof" rules out the roof
// illustrations even though only "with roof" is written there.
const inCatalog = computed(() => {
  const codes = new Set(ctx.value?.sets.pr ?? []);
  const fams = new Set([...codes].map((c) => famOf(c)).filter(Boolean));
  return { has: (c: string) => codes.has(c) || fams.has(famOf(c)) };
});
const famOf = (c: string) => ctx.value?.prInfo.code.get(c)?.family || null;

onMounted(async () => {
  dlg.value!.showModal();
  codeInput.value?.focus();
  const cat = await d.catalog(props.market, props.kat);
  const [prInfo, vcodes, paint, models] = await Promise.all([
    PR.load(),
    VehicleCodes.forCatalog(props.market, props.kat),
    paintData(props.market).catch(() => null),
    ModelCodes.forCatalog(props.market, props.kat).catch(() => []),
  ]);
  ctx.value = { prInfo, vcodes, paint, models, sets: codesIn(cat) };
});

/* ---------------- equipment codes ---------------- */

function addCodes(text: string) {
  const replaced: string[] = [];
  let next = [...codes.value];
  for (const raw of text.toUpperCase().split(/[^0-9A-Z#]+/)) {
    if (raw.length !== 3 || next.includes(raw)) continue;
    const fam = famOf(raw);
    if (fam) {
      const old = next.filter((c) => famOf(c) === fam);
      if (old.length) replaced.push(`${old.join(", ")} → ${raw}`);
      next = next.filter((c) => famOf(c) !== fam);
    }
    next.push(raw);
  }
  codes.value = next;
  replacedNote.value = replaced.length
    ? ` Replaced ${replaced.join("; ")} (same equipment family).`
    : "";
}
function removeCode(c: string) {
  codes.value = codes.value.filter((x) => x !== c);
  replacedNote.value = "";
}
function onCodeInput() {
  const v = pending.value;
  // Commit on a separator, or as soon as three characters are typed.
  if (/[\s,;]/.test(v) || v.replace(/[^0-9A-Za-z#]/g, "").length >= 3) {
    addCodes(v);
    pending.value = "";
  }
}
function onCodePaste(e: ClipboardEvent) {
  e.preventDefault();
  addCodes(e.clipboardData?.getData("text") || "");
}
function onCodeKey(e: KeyboardEvent) {
  if (e.key === "Backspace" && !pending.value && codes.value.length)
    codes.value = codes.value.slice(0, -1);
  if (e.key === "Enter") e.preventDefault();
}
const codeClass = (c: string) =>
  !ctx.value ? "" : !ctx.value.prInfo.code.has(c) ? "bad" : !inCatalog.value.has(c) ? "unused" : "";
function codeTip(c: string) {
  const p = ctx.value?.prInfo;
  const info = p?.code.get(c);
  if (!info) return `${c}: not a known PR code`;
  const fam = info.family ? ` (${p!.family.get(info.family) || info.family})` : "";
  return `${c}: ${info.text}${fam}${inCatalog.value.has(c) ? "" : " (not used in this catalog)"}`;
}
const equipment = computed(() =>
  codes.value.map((c) => {
    const info = ctx.value?.prInfo.code.get(c);
    return {
      c,
      cls: codeClass(c),
      text: info ? info.text || "(no description)" : "Not a known PR code",
      fam: info?.family ? ctx.value!.prInfo.family.get(info.family) || info.family : "",
      unused: !!info && !inCatalog.value.has(c),
    };
  }),
);
const note = computed(() => {
  const p = ctx.value?.prInfo;
  if (!codes.value.length)
    return "Codes from the sticker’s equipment block, for example 1AS 1BE 9VD. Paste the whole block at once.";
  if (!p) return "";
  const bad = codes.value.filter((c) => !p.code.has(c)).length;
  const unused = codes.value.filter((c) => p.code.has(c) && !inCatalog.value.has(c)).length;
  const used = codes.value.length - bad - unused;
  return (
    [
      `${used} of ${codes.value.length} codes affect this catalog`,
      unused && `${unused} not used in it`,
      bad && `${bad} unknown`,
    ]
      .filter(Boolean)
      .join(", ") +
    "." +
    replacedNote.value
  );
});

/* ---------------- family dropdowns ---------------- */

const families = computed(() => {
  const c = ctx.value;
  if (!c) return [];
  const fams = new Map<string, [string, string][]>();
  for (const code of c.sets.pr) {
    const fam = famOf(code);
    if (!fam) continue;
    if (!fams.has(fam)) fams.set(fam, []);
    fams.get(fam)!.push([code, c.prInfo.code.get(code)!.text]);
  }
  return [...fams.entries()]
    .filter(([, cs]) => cs.length > 1)
    .map(([fam, cs]) => ({
      fam,
      name: c.prInfo.family.get(fam) || fam,
      codes: cs,
      search:
        `${c.prInfo.family.get(fam) || fam} ${fam} ${cs.map((x) => x.join(" ")).join(" ")}`.toLowerCase(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
});
const famValue = (fam: string) => codes.value.find((c) => famOf(c) === fam) || "";
function setFamily(fam: string, value: string) {
  replacedNote.value = "";
  codes.value = [...codes.value.filter((c) => famOf(c) !== fam), ...(value ? [value] : [])];
}
const famVisible = (search: string) => {
  const q = famSearch.value.trim().toLowerCase();
  return !q || search.includes(q);
};

/* ---------------- sticker fields ---------------- */

const upper = (k: keyof typeof fields.value) => (fields.value[k] = fields.value[k].toUpperCase());
// Type: "8WH 5NY" on the sticker = vehicle type + model version; matched against the model codes.
const typeNote = computed(() => {
  const models = ctx.value?.models ?? [];
  const v = fields.value.type.replace(/\s+/g, "").toUpperCase();
  const hit =
    models.find((m) => m.code === v) ||
    (v.length === 3 ? null : models.find((m) => m.code.startsWith(v) && v.length >= 4));
  const typeOk =
    v.length >= 3 && !!catEntry.value && catEntry.value.types.some((t) => v.startsWith(t));
  if (hit)
    return {
      text: `${hit.text}${hit.from ? `, built ${hit.from}–${hit.to || ""}` : ""}`,
      warn: false,
    };
  if (v.length >= 3 && !typeOk && catEntry.value)
    return { text: `Not a type in this catalog (${catEntry.value.types.join(", ")})`, warn: true };
  if (v.length === 3 && typeOk) return { text: model.value ? model.value.name : "", warn: false };
  return { text: v ? "" : model.value ? model.value.name : "", warn: false };
});
const lists = computed(() => {
  const c = ctx.value;
  if (!c) return null;
  const kat = +props.kat;
  const paints = c.paint ? c.paint.vg.filter((r) => r.AA === kat) : [];
  const trims = c.paint ? c.paint.vf.filter((r) => r.AA === kat) : [];
  return {
    mkb: c.sets.mkb.map((x) => [x, c.vcodes.engines.get(x) || ""]),
    gkb: c.sets.gkb.map((x) => [x, c.vcodes.gearboxes.get(x) || ""]),
    paint: paints.map((r) => [`L${(r.AG || "").trim()}`, d.text(r.AC)]),
    type: c.models.map((m) => [
      m.code.length > 3 ? `${m.code.slice(0, 3)} ${m.code.slice(3)}` : m.code,
      `${m.text}${m.from ? ` (${m.from}–${m.to || ""})` : ""}`,
    ]),
    trim: trims.map((r) => [(r.AC || "").trim(), `${d.text(r.AB)} ${d.text(r.AE)}`.trim()]),
  };
});

/* ---------------- dialog ---------------- */

async function toggleHelp(show?: boolean) {
  help.value = show === undefined ? !help.value : show;
  if (form.value) form.value.scrollTop = 0;
  await nextTick();
  if (!help.value) helpBtn.value?.focus({ preventScroll: true });
}
/** The form as vehicle data (codes still being typed included). */
function formData(): VehicleData {
  if (pending.value.trim()) {
    addCodes(pending.value);
    pending.value = "";
  }
  const v = fields.value;
  const pr: Record<string, string> = {};
  for (const c of codes.value) {
    const fam = famOf(c);
    if (fam) pr[fam] = c;
  }
  return {
    mkb: v.mkb.trim(),
    gkb: v.gkb.trim(),
    pr,
    hide: hide.value,
    sticker: {
      vin: v.vin.trim(),
      type: v.type.trim(),
      paint: v.paint.trim(),
      trim: v.trim.trim(),
      codes: [...codes.value],
    },
  };
}

/* ---------------- garage ---------------- */

// Saved under a name: the garage vehicle with this VIN, else the model and year.
const sameVin = garage.vehicles.find((v) => st.vin && v.data.sticker?.vin === st.vin);
const garageName = ref(
  sameVin?.name ||
    [model.value?.name, appState.value.year].filter(Boolean).join(" ") ||
    `Catalog ${props.kat}`,
);
const { label: saveLabel, flash: flashSave } = useFlash("Save to garage");
function saveToGarage() {
  const name = garageName.value.trim();
  if (!name) return flashSave("Enter a name first");
  garage.put({
    name,
    market: props.market,
    model:
      appState.value.model ?? modelsForCatalog(props.market, +props.kat)[0]?.model.code ?? null,
    year: appState.value.year,
    kat: props.kat,
    data: formData(),
  });
  flashSave("Saved to garage");
}
/** Fills the form from a saved vehicle (its codes also work in another catalog of the car). */
function loadFromGarage(id: string) {
  const v = garage.get(id);
  if (!v) return;
  const s = v.data.sticker;
  fields.value = {
    vin: s?.vin || "",
    type: s?.type || "",
    mkb: v.data.mkb,
    gkb: v.data.gkb,
    paint: s?.paint || "",
    trim: s?.trim || "",
  };
  codes.value = s?.codes ? [...s.codes] : Object.values(v.data.pr);
  hide.value = v.data.hide;
  garageName.value = v.name;
  replacedNote.value = "";
}

function onClose() {
  const action = dlg.value!.returnValue;
  if (action === "apply") vehicleData.set(props.market, props.kat, formData());
  else if (action === "clear") vehicleData.set(props.market, props.kat, emptyVehicleData());
  emit("close");
}
</script>

<template>
  <dialog ref="dlg" class="dialog" aria-label="Vehicle data" @close="onClose">
    <form ref="form" method="dialog" class="filter-form">
      <div class="dialog-title">
        <h2>Vehicle data</h2>
        <button
          ref="helpBtn"
          type="button"
          class="help-btn"
          aria-label="Where to find these codes"
          title="Where to find these codes"
          :aria-expanded="help"
          @click="toggleHelp()"
        >
          ?
        </button>
      </div>
      <StickerHelp v-if="help" @back="toggleHelp(false)" />
      <div v-show="!help" class="filter-body">
        <label v-if="garage.count" class="field inline garage-load">
          <span>Load from garage</span>
          <select @change="loadFromGarage(($event.target as HTMLSelectElement).value)">
            <option value="" selected disabled>Choose a saved vehicle…</option>
            <option v-for="v in garage.sorted" :key="v.id" :value="v.id">
              {{ v.name }}{{ v.data.sticker?.vin ? ` (${v.data.sticker.vin})` : "" }}
            </option>
          </select>
        </label>
        <p class="dim">
          Copy the vehicle’s data sticker (in the service book and the spare-wheel well). Parts that
          the codes rule out are dimmed.
        </p>
        <div class="sticker">
          <div class="sticker-head"><b>Fahrzeugdaten</b><span>Vehicle data</span></div>
          <label class="sticker-field">
            <span class="sticker-label">Fahrzeug-Ident.-Nr.<i>Vehicle ident. no.</i></span>
            <input
              v-model="fields.vin"
              name="vin"
              class="mono"
              maxlength="17"
              placeholder="17 characters"
              autocomplete="off"
              spellcheck="false"
              @input="upper('vin')"
            />
          </label>
          <div class="sticker-field">
            <span class="sticker-label">Typ<i>Type</i></span>
            <span class="sticker-type">
              <input
                v-model="fields.type"
                name="type"
                list="dl-type"
                class="mono"
                maxlength="8"
                :placeholder="catEntry ? catEntry.types[0] + ' …' : ''"
                autocomplete="off"
                spellcheck="false"
                aria-label="Type"
                @input="upper('type')"
              />
              <span :class="['sticker-static', 'type-note', { warn: typeNote.warn }]">{{
                typeNote.text
              }}</span>
            </span>
          </div>
          <div class="sticker-row">
            <label class="sticker-field">
              <span class="sticker-label">Motorkennb.<i>Engine code</i></span>
              <input
                v-model="fields.mkb"
                name="mkb"
                list="dl-mkb"
                maxlength="4"
                class="mono short"
                autocomplete="off"
                spellcheck="false"
                @input="upper('mkb')"
              />
            </label>
            <label class="sticker-field">
              <span class="sticker-label">Getriebekennb.<i>Gearbox code</i></span>
              <input
                v-model="fields.gkb"
                name="gkb"
                list="dl-gkb"
                maxlength="15"
                class="mono short"
                autocomplete="off"
                spellcheck="false"
                @input="upper('gkb')"
              />
            </label>
            <label class="sticker-field">
              <span class="sticker-label">Lack-Nr.<i>Paint no.</i></span>
              <input
                v-model="fields.paint"
                name="paint"
                list="dl-paint"
                maxlength="5"
                class="mono short"
                autocomplete="off"
                spellcheck="false"
                @input="upper('paint')"
              />
            </label>
            <label class="sticker-field">
              <span class="sticker-label">Innenausst.<i>Interior</i></span>
              <input
                v-model="fields.trim"
                name="trim"
                list="dl-trim"
                maxlength="4"
                class="mono short"
                autocomplete="off"
                spellcheck="false"
                @input="upper('trim')"
              />
            </label>
          </div>
          <div class="sticker-field">
            <span class="sticker-label">M-Ausstattung<i>Optional equipment</i></span>
            <div class="sticker-codes" role="list" @click.self="codeInput?.focus()">
              <button
                v-for="c in codes"
                :key="c"
                type="button"
                role="listitem"
                :class="['sticker-code', codeClass(c)]"
                :title="`${codeTip(c)}\nClick to remove`"
                @click="(removeCode(c), codeInput?.focus())"
              >
                {{ c }}
              </button>
              <input
                ref="codeInput"
                v-model="pending"
                class="sticker-input"
                aria-label="Add PR codes"
                :placeholder="codes.length ? '' : 'type or paste codes'"
                autocomplete="off"
                spellcheck="false"
                maxlength="400"
                @input="onCodeInput"
                @paste="onCodePaste"
                @keydown="onCodeKey"
              />
            </div>
          </div>
          <template v-if="lists">
            <datalist v-for="(values, id) in lists" :id="`dl-${id}`" :key="id">
              <option v-for="[v, t] in values" :key="v" :value="v">{{ t }}</option>
            </datalist>
          </template>
        </div>
        <div class="sticker-note" aria-live="polite">{{ note }}</div>
        <section v-if="codes.length" class="equip">
          <h3>Installed equipment</h3>
          <ul class="equip-list" aria-label="Installed equipment">
            <li v-for="e in equipment" :key="e.c" :class="e.cls">
              <span class="equip-code">{{ e.c }}</span>
              <span class="equip-text">
                {{ e.text }}
                <span v-if="e.fam" class="equip-fam">{{ e.fam }}</span>
                <span v-if="e.unused" class="equip-fam">not used in this catalog</span>
              </span>
              <button
                type="button"
                class="equip-del"
                :aria-label="`Remove ${e.c}`"
                title="Remove"
                @click="removeCode(e.c)"
              >
                ✕
              </button>
            </li>
          </ul>
        </section>
        <details class="fam-details">
          <summary>Choose by equipment family ({{ families.length }})</summary>
          <input
            v-model="famSearch"
            type="search"
            class="filter"
            placeholder="Find an equipment family"
            aria-label="Find an equipment family"
          />
          <div class="fams">
            <label v-for="x in families" v-show="famVisible(x.search)" :key="x.fam" class="field">
              <span>{{ x.name }} ({{ x.fam }})</span>
              <select
                :value="famValue(x.fam)"
                @change="setFamily(x.fam, ($event.target as HTMLSelectElement).value)"
              >
                <option value="">Any</option>
                <option v-for="[v, t] in x.codes" :key="v" :value="v">{{ v }} {{ t }}</option>
              </select>
            </label>
          </div>
        </details>
        <label class="check"
          ><input v-model="hide" type="checkbox" /> Hide parts that do not fit instead of dimming
          them</label
        >
      </div>
      <div v-show="!help" class="garage-save">
        <span class="garage-save-label">Garage name</span>
        <input
          v-model="garageName"
          class="filter"
          aria-label="Name in the garage"
          placeholder="Name, for example the car’s nickname"
          @keydown.enter.prevent="saveToGarage"
        />
        <button type="button" class="btn" @click="saveToGarage">{{ saveLabel }}</button>
      </div>
      <div v-show="!help" class="dialog-actions">
        <button class="btn" value="clear" type="submit">Clear all</button>
        <span style="flex: 1" />
        <button class="btn" value="cancel" type="submit" formnovalidate>Cancel</button>
        <button class="btn primary" value="apply" type="submit">Apply</button>
      </div>
    </form>
  </dialog>
</template>
