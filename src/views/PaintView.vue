<script setup lang="ts">
// Paint and trim per catalog: exterior paints (vg), interior colours (vf) and the paint products
// for each paint number (Lacke).
import { computed } from "vue";
import AddToListButton from "../components/AddToListButton.vue";
import { useLoad } from "../composables/useLoad";
import { paintData } from "../lib/catalogData";
import type { Rec } from "../lib/format/records";
import { fmtPart } from "../lib/text";
import { appState, go } from "../router";
import { useSession } from "../stores/session";

const session = useSession();
const d = session.dump!;
const text = (id: number | undefined) => (id ? d.text(id).replace(/\n/g, " ") : "");
const s = (v: string | undefined) => (v || "").trim();
const model = computed(() => d.model(appState.value.market, appState.value.model));

const { data, error } = useLoad(
  () => [appState.value.market, appState.value.kat],
  async () => {
    const data = await paintData(appState.value.market!);
    const kat = +appState.value.kat!;
    const products = new Map<string, Rec[]>();
    for (const r of data.lacke) {
      const k = s(r.AC);
      if (!k) continue;
      if (!products.has(k)) products.set(k, []);
      products.get(k)!.push(r);
    }
    const paints = data.vg
      .filter((r) => r.AA === kat)
      .sort(
        (a, b) => (a.AB || "").localeCompare(b.AB || "") || text(a.AC).localeCompare(text(b.AC)),
      )
      .map((r) => ({ r, num: s(r.AG), products: products.get(s(r.AG)) || [] }));
    const groups = new Map<string, Rec[]>();
    for (const r of data.vf.filter((x) => x.AA === kat)) {
      const g = text(r.AB) || "Interior";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(r);
    }
    return { paints, groups: [...groups] };
  },
);
const productText = (p: Rec) => `${s(p.AE)} ${s(p.AF).toLowerCase()}`.trim();
</script>

<template>
  <div v-if="error" class="welcome">
    <div class="msg">{{ error }}</div>
  </div>
  <div v-else-if="!data" class="status">Loading paint and trim…</div>
  <section v-else class="pane">
    <div class="pane-head split">
      <div>
        <h1>{{ model ? model.name : `Catalog ${appState.kat}` }}</h1>
        <div class="meta">Paint and trim, catalog {{ appState.kat }}</div>
      </div>
      <button class="nav-btn" @click="go({ paint: null })">Main groups</button>
    </div>
    <div class="scroll search-pane" style="flex: 1">
      <h2>Exterior paint ({{ data.paints.length }})</h2>
      <table v-if="data.paints.length" class="grid">
        <thead>
          <tr>
            <th>Code</th>
            <th>Paint number</th>
            <th>Colour</th>
            <th>Remark</th>
            <th>Paint products</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="{ r, num, products } in data.paints" :key="`${r.AF}-${num}-${r.AC}`">
            <td class="pn">{{ s(r.AF) }}</td>
            <td class="pn">{{ num ? `L${num}` : "" }}</td>
            <td>
              {{ text(r.AC) || s(r.AH) }}
              <div v-if="text(r.AD) || text(r.AE)" class="dim">
                {{ [text(r.AD), text(r.AE)].filter(Boolean).join(", ") }}
              </div>
            </td>
            <td class="dim">{{ [text(r.AJ), s(r.AK), s(r.AI)].filter(Boolean).join(" ") }}</td>
            <td>
              <div v-for="(p, i) in products" :key="i" class="prod">
                <button class="linkish pn" @click="go({ part: p.AB.trimEnd() })">
                  {{ fmtPart(p.AB) }}
                </button>
                <span class="dim"> {{ productText(p) }}</span>
                <AddToListButton :pn="p.AB" :text="`${text(r.AC)} ${productText(p)}`.trim()" />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">No paint data for this catalog.</div>
      <template v-for="[g, rows] in data.groups" :key="g">
        <h2>{{ g }} ({{ rows.length }})</h2>
        <table class="grid">
          <thead>
            <tr>
              <th>Code</th>
              <th>Colour</th>
              <th>Version</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in rows" :key="i">
              <td class="pn">{{ s(r.AC) }}</td>
              <td>{{ text(r.AE) || s(r.AD) }}</td>
              <td class="dim">{{ [s(r.AF), s(r.AG)].filter(Boolean).join(" ") }}</td>
            </tr>
          </tbody>
        </table>
      </template>
    </div>
  </section>
</template>
