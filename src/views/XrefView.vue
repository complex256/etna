<script setup lang="ts">
// Where one description (text id) is used: every catalog and illustration in the market.
import { useLoad } from "../composables/useLoad";
import { modelsForCatalog, type ModelSpan } from "../lib/catalogData";
import { CrossRef } from "../lib/tables";
import { plateKeyLabel } from "../lib/text";
import { appState, go } from "../router";
import { useSession } from "../stores/session";

const session = useSession();
const d = session.dump!;

const { data } = useLoad(
  () => [appState.value.ts, appState.value.market],
  async () => {
    const id = +appState.value.ts!;
    const market = appState.value.market!;
    const uses = await CrossRef.uses(id, market);
    const name = (g: { models: ModelSpan[] }) => (g.models[0] ? g.models[0].model.name : "");
    const groups = uses
      .map((u) => ({ ...u, models: modelsForCatalog(market, u.kat) }))
      .sort(
        (a, b) =>
          name(a).localeCompare(name(b), undefined, { numeric: true }) ||
          (a.models[0]?.from ?? 0) - (b.models[0]?.from ?? 0) ||
          a.kat - b.kat,
      );
    return {
      id,
      text: d.text(id).replace(/\n/g, " "),
      groups,
      plates: uses.reduce((a, u) => a + u.plates.length, 0),
    };
  },
);

function open(kat: number, models: ModelSpan[], plate: string | null) {
  const m = models[0];
  go({
    market: m ? m.model.market : appState.value.market,
    model: m ? m.model.code : null,
    year: m ? String(m.from) : null,
    kat: String(kat),
    plate,
    hg: null,
    q: null,
    ts: null,
  });
}
const catalogLabel = (kat: number, models: ModelSpan[]) => {
  const m = models[0];
  if (!m) return `Catalog ${kat}`;
  return `${m.model.name} ${m.from}–${m.to}${m.model.market !== appState.value.market ? ` (${m.model.market})` : ""}`;
};
</script>

<template>
  <div v-if="!data" class="status">Looking up where this description is used…</div>
  <section v-else class="pane">
    <div class="pane-head">
      <h1>{{ data.text || `Description ${data.id}` }}</h1>
      <div class="meta">
        {{
          data.groups.length
            ? `Used on ${data.plates} illustrations in ${data.groups.length} catalogs (${appState.market})`
            : `Not used in any ${appState.market} catalog`
        }}
      </div>
    </div>
    <div class="scroll" style="flex: 1">
      <table v-if="data.groups.length" class="grid">
        <thead>
          <tr>
            <th>Vehicle</th>
            <th>Catalog</th>
            <th>Illustrations</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="g in data.groups" :key="g.kat">
            <td>
              <button class="linkish" @click="open(g.kat, g.models, null)">
                {{ catalogLabel(g.kat, g.models) }}
              </button>
            </td>
            <td class="num">{{ g.kat }}</td>
            <td class="plate-links">
              <button v-for="p in g.plates" :key="p" class="chip" @click="open(g.kat, g.models, p)">
                {{ plateKeyLabel(p) }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">No illustrations in this market use this description.</div>
    </div>
  </section>
</template>
