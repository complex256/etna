<script setup lang="ts">
// Model-data text with each PR code after "PR:" marked up; hovering a code shows its name.
import { computed } from "vue";
import type { Catalog } from "../lib/dump";
import type { PrInfo } from "../lib/tables";
import { lines } from "../lib/text";

const props = defineProps<{ text: string; prInfo: PrInfo | null; cat?: Catalog | null }>();

type Part = { text: string; tip?: string };
const parts = computed<Part[]>(() => {
  const { text, prInfo, cat } = props;
  const at = text.indexOf("PR:");
  if (at < 0 || !prInfo) return [{ text }];
  const out: Part[] = [{ text: text.slice(0, at) }];
  const rest = text.slice(at);
  let last = 0;
  for (const m of rest.matchAll(/\b[0-9A-Z]{3}\b/g)) {
    const g = prInfo.code.get(m[0]),
      p = cat?.pr.get(m[0]);
    const name = g?.text || (p ? lines(p.DA, p.DF).filter(Boolean).join(" ") : "");
    if (!name) continue;
    out.push({ text: rest.slice(last, m.index) }, { text: m[0], tip: `${m[0]}: ${name}` });
    last = m.index! + 3;
  }
  out.push({ text: rest.slice(last) });
  return out;
});
</script>

<template>
  <template v-for="(p, i) in parts" :key="i">
    <span v-if="p.tip" class="pr" :title="p.tip">{{ p.text }}</span>
    <template v-else>{{ p.text }}</template>
  </template>
</template>
