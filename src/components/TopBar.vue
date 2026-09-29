<script setup lang="ts">
import { copyText, useFlash } from "../composables/useFlash";
import { pref } from "../lib/storage";
import { appState, go } from "../router";
import { useGarage } from "../stores/garage";
import { usePartsList } from "../stores/partsList";
import { useSession } from "../stores/session";
import AppCrumbs from "./AppCrumbs.vue";
import MarketPicker from "./MarketPicker.vue";
import SearchBox from "./SearchBox.vue";

const session = useSession();
const partsList = usePartsList();
const garage = useGarage();
// A hosted dump: the address opens this page on this dump, so it can be shared as is.
const { label: shareLabel, flash: flashShare } = useFlash("Copy link");
const copyLink = () =>
  copyText(location.href, (m) => flashShare(m === "Copied" ? "Link copied" : m));

function toggleTheme() {
  const root = document.documentElement;
  const dark = root.dataset.theme
    ? root.dataset.theme === "dark"
    : matchMedia("(prefers-color-scheme: dark)").matches;
  const t = dark ? "light" : "dark";
  root.dataset.theme = t;
  pref.set("theme", t);
}
</script>

<template>
  <header class="bar">
    <div class="brand">
      Etna<small>{{ session.brandLabel }}</small>
    </div>
    <AppCrumbs v-if="session.dump" />
    <span v-else class="crumbs" />
    <SearchBox v-if="session.dump" />
    <MarketPicker v-if="session.dump && appState.market" />
    <button
      v-if="session.dump && session.dumpLink"
      class="icon-btn"
      type="button"
      title="Copy a link to this page on this dump"
      @click="copyLink"
    >
      {{ shareLabel }}
    </button>
    <button
      v-if="session.dump"
      class="icon-btn"
      type="button"
      title="Saved vehicles"
      @click="go({ garage: '1', list: null, part: null })"
    >
      {{ garage.count ? `Garage (${garage.count})` : "Garage" }}
    </button>
    <button
      v-if="session.dump"
      class="icon-btn"
      type="button"
      @click="go({ list: '1', garage: null, part: null })"
    >
      {{ partsList.count ? `Parts list (${partsList.count})` : "Parts list" }}
    </button>
    <select
      v-if="session.dump"
      aria-label="Language"
      :value="session.dump.lang.code"
      @change="session.setLanguage(($event.target as HTMLSelectElement).value)"
    >
      <option v-for="l in session.dump.languages" :key="l.code" :value="l.code">
        {{ l.label }}
      </option>
    </select>
    <button
      class="icon-btn"
      type="button"
      aria-label="Toggle dark mode"
      title="Toggle dark mode"
      @click="toggleTheme"
    >
      ◐
    </button>
  </header>
</template>
