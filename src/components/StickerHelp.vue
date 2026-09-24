<script setup lang="ts">
// Annotated example data sticker (an estate car; VIN and production number are made up) showing where each
// line goes in the form.
import { onMounted, ref } from "vue";

defineEmits<{ back: [] }>();
const el = ref<HTMLElement>();
onMounted(() => el.value?.focus({ preventScroll: true }));

interface Line {
  n: number;
  label: string;
  values: { t: string; right?: boolean }[];
  codes?: string[];
}
const lines: Line[] = [
  { n: 1, label: "", values: [{ t: "0012 34-5-6789 012" }, { t: "BU", right: true }] },
  { n: 2, label: "FAHRZG.-IDENT-NR. / VEHICLE-IDENT-NO.", values: [{ t: "ZZZZZZ F4 1 JA123456" }] },
  { n: 3, label: "TYP / TYPE", values: [{ t: "8WH 5NY" }] },
  { n: 4, label: "", values: [{ t: "Estate AWD 2.0" }, { t: "R4", right: true }] },
  { n: 0, label: "", values: [{ t: "185 KW" }, { t: "A7", right: true }] },
  {
    n: 5,
    label: "MOTORKB./GETR.KB. / ENGINE/TRANS.CODE",
    values: [{ t: "CYMC" }, { t: "SNK SUZ", right: true }],
  },
  {
    n: 6,
    label: "LACKNR./INNENAUSST. / PAINT NO./INTERIOR",
    values: [{ t: "LX7L" }, { t: "N1F / ZK", right: true }],
  },
  { n: 0, label: "", values: [{ t: "LX7L" }] },
  {
    n: 7,
    label: "M.-AUSST. / OPTIONS",
    values: [],
    codes:
      "E0A 4UH 6XL 5SG 5RW 1KJ J1N 1LF 3FU 2MN 7TL 7X2 F0A 9G2 0G7 0YM 0JK T2H 3NT 8IT U5C X9A QZ7 1XP 8Q3 9S8 8Z6 0Q5 7UG U71 7K6 4X3 2K0 3L4 VW6 3Y4 4F6 5D8 1SH 7CE Q1D QI7 4GF".split(
        " ",
      ),
  },
  { n: 8, label: "", values: [{ t: "99.9 99.9 99.9 9999" }] },
];
const legend: { n: number; title: string; where: string | null; text: string }[] = [
  { n: 1, title: "Production number and date code", where: null, text: "Used by the factory." },
  {
    n: 2,
    title: "Vehicle identification number",
    where: "Vehicle ident. no.",
    text: "Type the 17 characters without the gaps. F4 is the VIN type, 1 a check digit, J the model year (2018), A the plant.",
  },
  {
    n: 3,
    title: "Type and model version",
    where: "Type",
    text: "8WH is the vehicle type, 5NY the model version. Enter both (“8WH 5NY”) to see the exact model.",
  },
  {
    n: 4,
    title: "Model, engine power and gearbox kind",
    where: null,
    text: "R4 is a four-cylinder inline engine, A7 a 7-speed automatic.",
  },
  {
    n: 5,
    title: "Engine code, then gearbox codes",
    where: "Engine code, Gearbox code",
    text: "CYMC is the engine. Enter both gearbox codes (“SNK SUZ”); the catalog lists this car’s gearbox as SUZ.",
  },
  {
    n: 6,
    title: "Paint number, then seat covers / interior colour",
    where: "Paint no., Optional equipment, Interior",
    text: "LX7L is the paint. N1F is an equipment code (leather/leatherette seats), so it goes with the equipment codes; ZK is the interior colour. A second paint line is the roof or contrast colour.",
  },
  {
    n: 7,
    title: "Equipment codes (PR numbers)",
    where: "Optional equipment",
    text: "Paste or type them all; the order does not matter. These are what rule parts in or out.",
  },
  { n: 8, title: "Permitted weights", where: null, text: "Gross and axle weights." },
];
</script>

<template>
  <section ref="el" class="sticker-help" tabindex="-1" aria-label="Where to find the codes">
    <p class="dim">
      The sticker is in the service book and on the spare-wheel well or boot floor. This one is from
      an estate car; the numbers show where each line goes.
    </p>
    <div class="sticker example" aria-label="Example data sticker">
      <div v-for="(l, i) in lines" :key="i" class="ex-line">
        <span class="ex-label">{{ l.label }}</span>
        <span class="ex-values">
          <span v-if="l.codes" class="ex-codes"
            ><span v-for="c in l.codes" :key="c">{{ c }}</span></span
          >
          <span v-for="(v, k) in l.values" :key="k" :class="['ex-v', { right: v.right }]">{{
            v.t
          }}</span>
        </span>
        <span v-if="l.n" class="callout" aria-hidden="true">{{ l.n }}</span>
        <span v-else />
      </div>
    </div>
    <ol class="help-legend">
      <li v-for="item in legend" :key="item.n">
        <span class="callout" aria-hidden="true">{{ item.n }}</span>
        <div>
          <b>{{ item.title }}</b>
          <span v-if="item.where" class="goes"> → {{ item.where }}</span>
          <span v-else class="goes none"> (not needed)</span>
          <div class="dim">{{ item.text }}</div>
        </div>
      </li>
    </ol>
    <div class="dialog-actions">
      <span style="flex: 1" />
      <button type="button" class="btn primary" @click="$emit('back')">Back to the form</button>
    </div>
  </section>
</template>
