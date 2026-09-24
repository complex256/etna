<script setup lang="ts">
import { computed, ref } from "vue";
import { copyText, useFlash } from "../composables/useFlash";
import { useLoad } from "../composables/useLoad";
import { Parts, type Price } from "../lib/tables";
import { fmtMoney, fmtPart, plateKeyLabel } from "../lib/text";
import { go, router } from "../router";
import { usePartsList, type ListItem } from "../stores/partsList";

const list = usePartsList();
const { label: copyLabel, flash: flashCopy } = useFlash("Copy");
const { label: clearLabel, flash: flashClear } = useFlash("Clear list", 4000);

// Prices are looked up once per part number.
const { data: prices } = useLoad(
  () => list.items.map((i) => i.pn).join("|"),
  async () => {
    const m = new Map<string, Price | null>();
    await Promise.all(
      list.items.map(async (i) => m.set(i.pn, await Parts.price(i.pn).catch(() => null))),
    );
    return m;
  },
);
const price = (it: ListItem) => prices.value?.get(it.pn) ?? null;
const total = computed(() => {
  const t = list.items.reduce((a, it) => a + (price(it) ? price(it)!.amount * it.qty : 0), 0);
  const missing = list.items.some((it) => !price(it));
  return fmtMoney(t) + (missing ? " (some prices missing)" : "");
});

function openSource(it: ListItem) {
  const s = it.src!;
  go({
    market: s.market,
    model: s.model,
    year: s.year,
    kat: s.kat,
    plate: s.plate,
    hg: null,
    q: null,
    list: null,
  });
}
function exportCsv() {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [
    [
      "Part number",
      "Description",
      "Quantity",
      "Unit price",
      "Line total",
      "Catalog",
      "Illustration",
    ],
    ...list.items.map((it) => {
      const p = price(it);
      return [
        fmtPart(it.pn),
        it.text,
        it.qty,
        p ? p.amount.toFixed(2) : "",
        p ? (p.amount * it.qty).toFixed(2) : "",
        it.src?.kat ?? "",
        it.src?.plate ? it.src.plate.trim() : "",
      ];
    }),
  ]
    .map((r) => r.map(esc).join(","))
    .join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
  a.download = "parts-list.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const copyTsv = () =>
  copyText(
    list.items.map((it) => `${fmtPart(it.pn)}\t${it.qty}\t${it.text}`).join("\n"),
    flashCopy,
  );
const print = () => window.print();
// Two-step clear: the first click arms the button instead of opening a blocking dialog.
const armed = ref(0);
function clear() {
  if (Date.now() - armed.value < 4000) {
    list.clear();
    armed.value = 0;
  } else {
    armed.value = Date.now();
    flashClear("Click again to clear");
  }
}
</script>

<template>
  <div v-if="!list.items.length" class="welcome">
    <h1>Your parts list is empty</h1>
    <p>
      Add parts from an illustration with the + button next to each row, or from a part’s details.
    </p>
    <div class="actions"><button class="btn" @click="router.back()">Go back</button></div>
  </div>
  <section v-else class="pane">
    <div class="pane-head">
      <h1>Parts list</h1>
      <div class="meta">
        {{ list.items.length }} part numbers. Prices are list prices from the dump.
      </div>
      <div class="toolbar noprint">
        <button class="btn" @click="exportCsv">Export CSV</button>
        <button class="btn" @click="copyTsv">{{ copyLabel }}</button>
        <button class="btn" @click="print">Print</button>
        <button class="btn danger" @click="clear">{{ clearLabel }}</button>
      </div>
    </div>
    <div class="scroll" style="flex: 1">
      <table class="grid">
        <thead>
          <tr>
            <th>Part number</th>
            <th>Description</th>
            <th>From</th>
            <th>Qty</th>
            <th class="right">Unit price</th>
            <th class="right">Total</th>
            <th class="noprint" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="(it, k) in list.items" :key="it.pn">
            <td>
              <button class="linkish pn" @click="go({ part: it.pn })">{{ fmtPart(it.pn) }}</button>
            </td>
            <td>{{ it.text }}</td>
            <td class="dim">
              <button v-if="it.src?.kat" class="linkish" @click="openSource(it)">
                Catalog {{ it.src.kat }}{{ it.src.plate ? ` ${plateKeyLabel(it.src.plate)}` : "" }}
              </button>
            </td>
            <td class="qtycell">
              <input
                type="number"
                min="0"
                :value="it.qty"
                :aria-label="`Quantity of ${fmtPart(it.pn)}`"
                @input="list.setQty(k, +($event.target as HTMLInputElement).value)"
              />
            </td>
            <td class="num right">
              <template v-if="price(it)">{{ fmtMoney(price(it)!.amount) }}</template>
              <span v-else class="dim">none</span>
            </td>
            <td class="num right">{{ price(it) ? fmtMoney(price(it)!.amount * it.qty) : "" }}</td>
            <td class="noprint">
              <button
                class="icon-btn2"
                :aria-label="`Remove ${fmtPart(it.pn)}`"
                title="Remove"
                @click="list.remove(k)"
              >
                ✕
              </button>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td colspan="4" />
            <td class="right"><b>Total</b></td>
            <td class="num right">{{ total }}</td>
            <td class="noprint" />
          </tr>
        </tfoot>
      </table>
    </div>
  </section>
</template>
