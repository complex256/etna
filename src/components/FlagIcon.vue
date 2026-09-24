<script setup lang="ts">
import { computed } from "vue";
import { MARKETS } from "../lib/markets";

const props = defineProps<{ code: string }>();
const market = computed(() => MARKETS[props.code]);
</script>

<template>
  <span :class="['flag', { plain: market?.plain }]" aria-hidden="true">
    <!-- Flag artwork is static markup from lib/markets.ts. -->
    <svg v-if="market" viewBox="0 0 30 20" width="24" height="16" v-html="market.flag" />
    <template v-else>{{ code.slice(0, 2) }}</template>
  </span>
</template>
