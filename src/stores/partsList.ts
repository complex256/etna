// A persistent shopping list of parts.
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { readJson, writeJson } from "../lib/storage";

/** Where a part was added from, to link back to it. */
export interface PartSource {
  market: string | null;
  model: string | null;
  year: string | null;
  kat: string | null;
  plate: string | null;
}
export interface ListItem {
  pn: string;
  text: string;
  qty: number;
  src: PartSource | null;
}

const KEY = "etna.list";

export const usePartsList = defineStore("partsList", () => {
  const items = ref<ListItem[]>(readJson<ListItem[]>(KEY, []));
  const save = () => writeJson(KEY, items.value);
  /** Number of part numbers with a quantity. */
  const count = computed(() => items.value.filter((i) => i.qty > 0).length);

  function add(pn: string, text: string, src: PartSource | null, qty = 1) {
    const key = pn.replace(/\s+/g, "");
    const hit = items.value.find((i) => i.pn.replace(/\s+/g, "") === key);
    if (hit) hit.qty += qty;
    else items.value.push({ pn: pn.trimEnd(), text: text || "", qty, src });
    save();
  }
  function setQty(i: number, qty: number) {
    items.value[i].qty = Math.max(0, qty || 0);
    save();
  }
  function remove(i: number) {
    items.value.splice(i, 1);
    save();
  }
  function clear() {
    items.value = [];
    save();
  }
  return { items, count, add, setQty, remove, clear };
});
