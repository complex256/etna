<script setup lang="ts">
// Side drawer with everything the dump knows about one part number (state `part`).
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { currentSource } from "../composables/currentSource";
import { copyText, useFlash } from "../composables/useFlash";
import type { Plate } from "../lib/dump";
import type { Rec } from "../lib/format/records";
import { imageUrl } from "../lib/illustrations";
import { CrossRef, Notes, Parts, WhereUsed, type Note, type Price } from "../lib/tables";
import {
  fmtDmy,
  fmtMoney,
  fmtPart,
  lines,
  oneLine,
  plateLabel,
  plateTitle,
  stripQ,
} from "../lib/text";
import { appState, go } from "../router";
import { usePartsList } from "../stores/partsList";
import { useSession } from "../stores/session";

const session = useSession();
const list = usePartsList();
const d = session.dump!;
const el = ref<HTMLElement>();
const pn = computed(() => appState.value.part || "");
const { label: copyLabel, flash: flashCopy } = useFlash("Copy");
const { label: addLabel, flash: flashAdd } = useFlash("Add to parts list");

interface Occurrence {
  plate: Plate;
  pos: string;
  text: string;
  plateTitle: string;
}
interface Info {
  master: Rec | null;
  price: Price | null;
  photos: string[];
  exchange: string[];
  norm: Rec | null;
  contents: Rec[];
  occurrences: Occurrence[];
  desc: string;
}
interface UsedIn {
  label: string;
  detail: string;
  patch: Parameters<typeof go>[0];
}

const info = shallowRef<Info | null>(null);
const note = ref<Note | null>(null);
const xref = ref<{ id: number; catalogs: number; plates: number } | null>(null);
const photoUrls = ref<string[]>([]);
const photoNote = ref("");
const usedIn = ref<UsedIn[]>([]);
const usedStatus = ref("");
let seq = 0;

const safe = <T>(p: Promise<T>, fallback: T) =>
  p.catch((e) => {
    console.warn(e);
    return fallback;
  });

async function findOccurrences(part: string): Promise<Occurrence[]> {
  const s = appState.value;
  if (!s.kat) return [];
  const cat = await d.catalog(s.market!, s.kat);
  const want = part.replace(/\s+/g, "");
  const out: Occurrence[] = [];
  for (const p of cat.plates)
    for (const r of p.rows)
      if (r.AC && r.AC.replace(/\s+/g, "") === want)
        out.push({
          plate: p,
          pos: r.AE && r.AE !== "-" ? r.AE : "",
          text: lines(r.DA, r.DE).filter(Boolean).join(" "),
          plateTitle: plateTitle(p).title,
        });
  return out;
}

async function load(part: string) {
  const my = ++seq;
  const stale = () => my !== seq;
  info.value = null;
  note.value = null;
  xref.value = null;
  photoNote.value = "";
  usedIn.value = [];
  usedStatus.value = "Searching other catalogs…";
  photoUrls.value.forEach((u) => URL.revokeObjectURL(u));
  photoUrls.value = [];
  await nextTick();
  el.value?.focus({ preventScroll: true });
  const market = appState.value.market || "RDW";

  const [master, price, photos, exchange, norm, contents] = await Promise.all([
    safe(Parts.master(part), null),
    safe(Parts.price(part), null),
    safe(Parts.photos(part), []),
    safe(Parts.exchange(part), []),
    safe(Parts.norm(part), null),
    safe(Parts.contents(part), []),
  ]);
  if (stale()) return;
  const occurrences = await safe(findOccurrences(part), []);
  if (stale()) return;
  const desc = master?.A1 ? d.text(master.A1) : occurrences[0]?.text || "";
  info.value = { master, price, photos, exchange, norm, contents, occurrences, desc };

  Notes.part(part, market)
    .then((n) => !stale() && (note.value = n))
    .catch(() => {});
  if (master?.A1)
    CrossRef.uses(master.A1, market)
      .then((uses) => {
        if (stale() || !uses.length) return;
        xref.value = {
          id: master.A1,
          catalogs: uses.length,
          plates: uses.reduce((a, u) => a + u.plates.length, 0),
        };
      })
      .catch(() => {});
  if (photos.length) loadPhotos(photos, stale);
  loadWhereUsed(part, market, stale);
}

async function loadPhotos(names: string[], stale: () => boolean) {
  const dir = d.brandDir && (await d.brandDir.dir("Tnrpics"));
  if (!dir) {
    photoNote.value = "The Tnrpics folder is not in this dump, so pictures cannot be shown.";
    return;
  }
  for (const n of names.slice(0, 8)) {
    const f = await dir.file(n);
    if (stale()) return;
    if (f) photoUrls.value.push(await imageUrl(f));
  }
  if (!photoUrls.value.length)
    photoNote.value = `Picture files (${names.join(", ")}) are missing from Tnrpics.`;
}

// Candidates from the where-used index, each confirmed by reading that illustration's rows.
async function loadWhereUsed(part: string, market: string, stale: () => boolean) {
  const want = part.replace(/\s+/g, "");
  const cands = await safe(WhereUsed.candidates(part, market), []);
  if (stale()) return;
  if (!cands.length) {
    usedStatus.value = "Not listed in any other catalog of this market.";
    return;
  }
  const total = Math.min(cands.length, 60);
  usedStatus.value = `Checking ${cands.length} catalogs…`;
  let checked = 0;
  for (const c of cands.slice(0, 60)) {
    for (const plateKey of c.plates) {
      const rows = await safe(d.plateRows(market, c.kat, plateKey), []);
      if (stale()) return;
      const hits = rows.filter((r) => r.AC && r.AC.replace(/\s+/g, "") === want);
      if (!hits.length) continue;
      const model = d.models.find(
        (m) => m.market === market && m.catalogs.some((k) => k.kat === c.kat),
      );
      const years = model ? model.catalogs.filter((k) => k.kat === c.kat).map((k) => k.year) : [];
      const pos = [
        ...new Set(hits.map((r) => (r.AE && r.AE !== "-" ? r.AE : "")).filter(Boolean)),
      ].join(", ");
      usedIn.value.push({
        label: model ? model.name : `Catalog ${c.kat}`,
        detail: ` ${years.length ? `${Math.min(...years)}–${Math.max(...years)}, ` : ""}catalog ${c.kat}, ${plateKey.slice(0, 3)}-${plateKey.slice(3)}${pos ? ` pos ${pos}` : ""}`,
        patch: {
          market,
          model: model ? model.code : null,
          year: years.length ? String(Math.min(...years)) : null,
          kat: String(c.kat),
          plate: plateKey,
          hg: null,
          q: null,
          list: null,
        },
      });
    }
    checked++;
    usedStatus.value =
      checked < total
        ? `Checking catalogs… ${checked} of ${total}`
        : usedIn.value.length
          ? `${usedIn.value.length} illustrations`
          : "Not listed in any other catalog of this market.";
  }
}

watch(pn, (p) => p && load(p), { immediate: true });

const facts = computed(() => {
  const i = info.value;
  const out: [string, string][] = [];
  if (!i) return out;
  if (i.master?.A3) out.push(["Last changed", fmtDmy(i.master.A3)]);
  const n = i.norm;
  if (n) {
    if (n.BA?.length)
      out.push([
        "Type",
        (n.BA as number[])
          .map((id) => d.text(id))
          .filter(Boolean)
          .join(", "),
      ]);
    if (n.BD?.length) out.push(["Size", (n.BD as string[]).map(stripQ).join(", ")]);
    if (n.AF) out.push(["Standard", n.AF.trim()]);
    if (n.AD) out.push(["Grade / finish", n.AD.trim()]);
  }
  return out;
});
const successors = computed(
  () => (info.value?.master?.B0 || []).filter((b: Rec) => b.B1 && b.B1.trim()) as Rec[],
);
const descLine = computed(() => (info.value?.desc || "").replace(/\n/g, " "));

const close = () => go({ part: null }, true);
function add() {
  list.add(pn.value, descLine.value, currentSource());
  flashAdd("Added");
}
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape" && !document.querySelector("dialog[open]")) close();
}
onMounted(() => {
  document.body.classList.add("has-drawer");
  document.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => {
  seq++;
  document.body.classList.remove("has-drawer");
  document.removeEventListener("keydown", onKey);
  photoUrls.value.forEach((u) => URL.revokeObjectURL(u));
});
</script>

<template>
  <aside ref="el" class="drawer" aria-label="Part details" tabindex="-1">
    <div class="drawer-head">
      <span class="pn big">{{ fmtPart(pn) }}</span>
      <button
        class="icon-btn2"
        title="Copy part number"
        aria-label="Copy part number"
        @click="copyText(pn.replace(/\s+/g, ''), flashCopy)"
      >
        {{ copyLabel }}
      </button>
      <button class="icon-btn2" aria-label="Close part details" title="Close (Esc)" @click="close">
        ✕
      </button>
    </div>
    <div class="drawer-title">
      <b v-if="info">{{ descLine || "No description in the part master" }}</b>
    </div>
    <div class="drawer-body">
      <div v-if="!info" class="dim">Looking up part…</div>
      <template v-else>
        <div class="drawer-actions">
          <button class="btn primary" @click="add">{{ addLabel }}</button>
          <div v-if="info.price" class="price">
            <span class="amount">{{ fmtMoney(info.price.amount) }}</span>
            <span class="dim">
              list price{{ info.price.date ? `, valid from ${info.price.date}` : ""
              }}{{ info.price.group ? `, discount group ${info.price.group}` : "" }}</span
            >
          </div>
          <div v-else class="dim">No price in this dump</div>
        </div>
        <dl v-if="facts.length" class="facts">
          <template v-for="[k, v] in facts" :key="k">
            <dt>{{ k }}</dt>
            <dd>{{ v }}</dd>
          </template>
        </dl>
        <div v-if="note" class="note-bar inline">
          <b>Note</b><span v-if="note.fallback" class="dim"> (German) </span
          ><template v-else> </template>{{ note.text }}
        </div>

        <section v-if="successors.length" class="dsec">
          <h3>Replaced by</h3>
          <ul class="plain">
            <li v-for="(b, i) in successors" :key="i">
              <button class="linkish pn" @click="go({ part: b.B1.trimEnd() })">
                {{ fmtPart(b.B1) }}
              </button>
              <template v-if="(b.B2 || '').trim() && (b.B2 || '').trim() !== '1'">
                × {{ b.B2.trim() }}</template
              >
              <span v-if="b.B3" class="dim"> {{ d.text(b.B3) }}</span>
            </li>
          </ul>
        </section>
        <section v-if="info.exchange.length" class="dsec">
          <h3>Exchange part</h3>
          <ul class="plain">
            <li v-for="x in info.exchange" :key="x">
              <button class="linkish pn" @click="go({ part: x.trimEnd() })">
                {{ fmtPart(x) }}
              </button>
            </li>
          </ul>
        </section>
        <section v-if="info.contents.length" class="dsec">
          <h3>Contents ({{ info.contents.length }})</h3>
          <table class="grid mini">
            <tbody>
              <tr v-for="(c, i) in info.contents" :key="i">
                <td>
                  <button v-if="c.BA" class="linkish pn" @click="go({ part: c.BA.trimEnd() })">
                    {{ fmtPart(c.BA) }}
                  </button>
                </td>
                <td>
                  {{ oneLine(c.CA, c.CE) }}
                  <div v-if="lines(c.CB, c.CF).filter(Boolean).length" class="dim">
                    {{ lines(c.CB, c.CF).filter(Boolean).join(" ") }}
                  </div>
                </td>
                <td class="num">
                  {{ ((c.CD as string[]) || []).map(stripQ).filter(Boolean).join(" ") }}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
        <section v-if="info.occurrences.length" class="dsec">
          <h3>In catalog {{ appState.kat }} ({{ info.occurrences.length }})</h3>
          <ul class="plain">
            <li v-for="(o, i) in info.occurrences.slice(0, 50)" :key="i">
              <button
                class="linkish"
                @click="go({ plate: o.plate.key, hg: o.plate.hg, part: null, q: null })"
              >
                {{ plateLabel(o.plate) }}{{ o.pos ? ` pos ${o.pos}` : "" }}
              </button>
              <span class="dim"> {{ o.plateTitle }}</span>
            </li>
          </ul>
        </section>
        <section v-if="info.photos.length" class="dsec">
          <h3>Pictures</h3>
          <div class="photos">
            <a v-for="u in photoUrls" :key="u" :href="u" target="_blank" rel="noopener">
              <img :src="u" :alt="`Picture of ${fmtPart(pn)}`" loading="lazy" />
            </a>
            <div v-if="photoNote" class="dim">{{ photoNote }}</div>
          </div>
        </section>
        <section v-if="xref" class="dsec">
          <h3>Same description</h3>
          <button class="linkish" @click="go({ ts: String(xref.id), part: null, q: null })">
            “{{ descLine }}” appears on {{ xref.plates }} illustrations in
            {{ xref.catalogs }} catalogs
          </button>
        </section>
        <section class="dsec">
          <h3>Used in other catalogs</h3>
          <div class="dim">{{ usedStatus }}</div>
          <ul class="plain">
            <li v-for="(u, i) in usedIn" :key="i">
              <button class="linkish" @click="go(u.patch)">{{ u.label }}</button>
              <span class="dim">{{ u.detail }}</span>
            </li>
          </ul>
        </section>
      </template>
    </div>
  </aside>
</template>
