<script setup lang="ts">
// Search: a VIN, part numbers and descriptions in the open catalog, the part master, engine and
// gearbox codes, and descriptions across all catalogs.
import CodeTable from "../components/CodeTable.vue";
import VinSection from "../components/VinSection.vue";
import { useLoad } from "../composables/useLoad";
import type { Plate } from "../lib/dump";
import type { Rec } from "../lib/format/records";
import { Codes, CrossRef, Parts, TextIndex, type CrossRefUse } from "../lib/tables";
import { fmtDmy, fmtPart, lines, plateLabel } from "../lib/text";
import { decodeVin, VIN_RE } from "../lib/vin";
import { appState, go } from "../router";
import { useSession } from "../stores/session";

const session = useSession();
const d = session.dump!;

const { data } = useLoad(
  () => [appState.value.q, appState.value.market, appState.value.kat],
  async () => {
    const s = appState.value;
    const q = s.q || "";
    const qn = q.replace(/\s+/g, "").toUpperCase();
    const ql = q.toLowerCase();
    const isVin = VIN_RE.test(qn);
    const vin = isVin ? await decodeVin(qn, s.market!, d.models) : null;

    let inCatalog: { p: Plate; r: Rec }[] | null = null;
    if (s.kat && !isVin) {
      const cat = await d.catalog(s.market!, s.kat);
      inCatalog = [];
      outer: for (const p of cat.plates) {
        for (const r of p.rows) {
          if (!r.AC) continue;
          const pnHit = qn.length >= 3 && r.AC.replace(/\s+/g, "").toUpperCase().includes(qn);
          const txtHit =
            !pnHit && ql.length >= 3 && lines(r.DA, r.DE).some((x) => x.toLowerCase().includes(ql));
          if (pnHit || txtHit) inCatalog.push({ p, r });
          if (inCatalog.length >= 500) break outer;
        }
      }
    }
    const master = isVin ? [] : await Parts.searchMaster(q).catch(() => []);

    // Engine or gearbox code, and descriptions across all catalogs.
    const code = q.trim().toUpperCase();
    let engines = null,
      gearboxes = null;
    if (!isVin && /^[0-9A-Z]{2,4}$/.test(code)) {
      const reg = await Codes.load(s.market!).catch(() => null);
      if (reg) {
        const eng = reg.engines.filter((r) => r.code === code),
          gb = reg.gearboxes.filter((r) => r.code === code);
        if (eng.length) engines = { rows: eng, kats: reg.engineKats };
        if (gb.length) gearboxes = { rows: gb, kats: reg.gearKats };
      }
    }
    let texts: { id: number; text: string; catalogs: number; plates: number }[] = [];
    if (!isVin && q.trim().length >= 3 && !/^\d+$/.test(q.trim())) {
      const [found, xref] = await Promise.all([
        TextIndex.search(q.trim(), 30),
        CrossRef.index(s.market!),
      ]).catch(
        (e) => (
          console.warn(e),
          [[], new Map()] as [{ id: number; text: string }[], Map<number, CrossRefUse[]>]
        ),
      );
      texts = found
        .map((t) => ({ ...t, uses: xref.get(t.id) || [] }))
        .filter((t) => t.uses.length)
        .map((t) => ({
          id: t.id,
          text: t.text,
          catalogs: t.uses.length,
          plates: t.uses.reduce((a, u) => a + u.plates.length, 0),
        }));
    }
    return { q, vin, inCatalog, master, engines, gearboxes, texts };
  },
);
const text = (r: Rec) => lines(r.DA, r.DE).filter(Boolean).join(" ");
const nothing = (v: NonNullable<typeof data.value>) =>
  !v.vin && !v.inCatalog && !v.master.length && !v.engines && !v.gearboxes && !v.texts.length;
</script>

<template>
  <div v-if="!data || data.q !== (appState.q || '')" class="status">
    Searching for “{{ appState.q }}”…
  </div>
  <div v-else class="scroll search-pane" style="flex: 1">
    <VinSection v-if="data.vin" :v="data.vin" />

    <template v-if="data.inCatalog">
      <h2>
        In catalog {{ appState.kat }}: {{ data.inCatalog.length
        }}{{ data.inCatalog.length >= 500 ? "+" : "" }} matching rows
      </h2>
      <table v-if="data.inCatalog.length" class="grid">
        <thead>
          <tr>
            <th>Illustration</th>
            <th>Pos</th>
            <th>Part number</th>
            <th>Description</th>
            <th>Model data</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="({ p, r }, i) in data.inCatalog"
            :key="i"
            class="link"
            tabindex="0"
            @click="go({ plate: p.key, hg: p.hg, q: null })"
            @keydown.enter="go({ plate: p.key, hg: p.hg, q: null })"
          >
            <td class="plno num">{{ plateLabel(p) }}</td>
            <td>{{ r.AE && r.AE !== "-" ? r.AE : "" }}</td>
            <td>
              <span class="pn">{{ fmtPart(r.AC) }}</span>
            </td>
            <td>{{ text(r) }}</td>
            <td class="dim">{{ lines(r.DC, r.DG).filter(Boolean).join(" ") }}</td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">
        No rows in this catalog match. Check the part number, or open a different catalog.
      </div>
    </template>

    <template v-if="data.master.length">
      <h2>Part master ({{ data.master.length }}{{ data.master.length >= 40 ? "+" : "" }})</h2>
      <table class="grid">
        <thead>
          <tr>
            <th>Part number</th>
            <th>Description</th>
            <th>Replaced by</th>
            <th>Last changed</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="m in data.master"
            :key="m.A0"
            class="link"
            tabindex="0"
            @click="go({ part: m.A0.trimEnd() })"
            @keydown.enter="go({ part: m.A0.trimEnd() })"
          >
            <td>
              <span class="pn">{{ fmtPart(m.A0) }}</span>
            </td>
            <td>{{ d.text(m.A1).replace(/\n/g, " ") }}</td>
            <td>
              <div
                v-for="(b, i) in (m.B0 || []).filter((b: Rec) => b.B1 && b.B1.trim())"
                :key="i"
                class="pn"
              >
                {{ fmtPart(b.B1) }}
              </div>
            </td>
            <td class="dim num">{{ fmtDmy(m.A3) }}</td>
          </tr>
        </tbody>
      </table>
    </template>

    <template v-if="data.engines">
      <h2>Engine code {{ data.q.trim().toUpperCase() }}</h2>
      <CodeTable kind="engine" :rows="data.engines.rows" :kats="data.engines.kats" />
    </template>
    <template v-if="data.gearboxes">
      <h2>Gearbox code {{ data.q.trim().toUpperCase() }}</h2>
      <CodeTable kind="gearbox" :rows="data.gearboxes.rows" :kats="data.gearboxes.kats" />
    </template>

    <template v-if="data.texts.length">
      <h2>Descriptions across all catalogs ({{ data.texts.length }})</h2>
      <table class="grid">
        <thead>
          <tr>
            <th>Description</th>
            <th>Catalogs</th>
            <th>Illustrations</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="t in data.texts"
            :key="t.id"
            class="link"
            tabindex="0"
            @click="go({ ts: String(t.id), q: null })"
            @keydown.enter="go({ ts: String(t.id), q: null })"
          >
            <td>{{ t.text }}</td>
            <td class="num">{{ t.catalogs }}</td>
            <td class="num">{{ t.plates }}</td>
          </tr>
        </tbody>
      </table>
    </template>

    <div v-if="nothing(data)" class="empty">
      Nothing matches “{{ data.q }}”. Try a part number, a description, an engine code or a VIN.
    </div>
  </div>
</template>
