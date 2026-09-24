<script setup lang="ts">
import { computed } from "vue";
import { plateKeyLabel } from "../lib/text";
import { appState, go, hrefFor, type StatePatch } from "../router";
import { useSession } from "../stores/session";

const session = useSession();

interface Crumb {
  label: string;
  patch: StatePatch;
  current: boolean;
}

const crumbs = computed<Crumb[]>(() => {
  void session.langVersion; // main group names follow the language
  const d = session.dump;
  const s = appState.value;
  if (!d) return [];
  const out: Crumb[] = [];
  const add = (label: string, patch: StatePatch, current: boolean) =>
    out.push({ label, patch, current });
  const m = d.model(s.market, s.model);
  const up: StatePatch = {
    q: null,
    list: null,
    garage: null,
    nav: null,
    navref: null,
    paint: null,
    equip: null,
    ts: null,
    codes: null,
    code: null,
  };
  const here = !s.q && !s.list && !s.garage && !s.ts && !s.codes;
  add(
    "Vehicles",
    { model: null, kat: null, year: null, hg: null, plate: null, ...up },
    !s.model && here,
  );
  if (m)
    add(m.name || m.code, { kat: null, year: null, hg: null, plate: null, ...up }, !s.kat && here);
  if (s.kat)
    add(
      `${s.year || ""} · catalog ${s.kat}`.replace(/^ · /, ""),
      { hg: null, plate: null, ...up },
      !s.hg && !s.plate && here,
    );
  if (s.kat && s.hg)
    add(`${s.hg} ${d.hgNames[s.hg] || ""}`.trim(), { plate: null, ...up }, !s.plate && here);
  if (s.plate) add(plateKeyLabel(s.plate), up, here);
  if (s.q) add(`Search “${s.q}”`, {}, !s.list && !s.ts);
  if (s.ts) add("Description use", {}, true);
  if (s.codes) add(s.codes === "gearbox" ? "Gearbox codes" : "Engine codes", {}, true);
  if (s.list) add("Parts list", {}, true);
  if (s.garage) add("Garage", {}, true);
  return out;
});
</script>

<template>
  <nav class="crumbs" aria-label="Location">
    <template v-for="(c, i) in crumbs" :key="i">
      <span v-if="i" class="sep" aria-hidden="true">›</span>
      <a
        :href="hrefFor(c.patch)"
        :aria-current="c.current ? 'page' : undefined"
        @click.prevent="go(c.patch)"
        >{{ c.label }}</a
      >
    </template>
  </nav>
</template>
