<script setup lang="ts">
// The "+" button that adds a part to the parts list (with a brief ✓).
import { useFlash } from "../composables/useFlash";
import { fmtPart } from "../lib/text";
import { currentSource } from "../composables/currentSource";
import { usePartsList, type PartSource } from "../stores/partsList";

const props = defineProps<{ pn: string; text: string; source?: PartSource | null }>();
const list = usePartsList();
const { label, flash } = useFlash("+");

function add() {
  list.add(props.pn, props.text, props.source === undefined ? currentSource() : props.source);
  flash("✓");
}
</script>

<template>
  <button
    type="button"
    class="add-btn"
    title="Add to parts list"
    :aria-label="`Add ${fmtPart(pn)} to parts list`"
    @click.stop="add"
  >
    {{ label }}
  </button>
</template>
