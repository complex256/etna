<script setup lang="ts">
// "/" with a dump open: go to the remembered market.
import { onMounted } from "vue";
import { pref } from "../lib/storage";
import { go } from "../router";
import { useSession } from "../stores/session";

const session = useSession();
onMounted(() => {
  const d = session.dump;
  if (!d) return;
  const saved = pref.get("market", "RDW");
  go({ market: d.markets.includes(saved) ? saved : d.markets[0] }, true);
});
</script>

<template>
  <div class="status">Opening…</div>
</template>
