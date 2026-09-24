<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from "vue";
import { RouterView, type RouteLocationNormalizedLoaded } from "vue-router";
import PartDrawer from "./components/PartDrawer.vue";
import ThumbPreview from "./components/ThumbPreview.vue";
import TopBar from "./components/TopBar.vue";
import VehicleDataDialog from "./components/VehicleDataDialog.vue";
import WelcomeScreen from "./components/WelcomeScreen.vue";
import { EntryDir, HttpDir } from "./lib/fs";
import { pref } from "./lib/storage";
import { appState } from "./router";
import { useSession } from "./stores/session";
import { useVehicleData } from "./stores/vehicleData";

const session = useSession();
const vehicleData = useVehicleData();

// Views re-render when the language or the vehicle data changes. Other route changes (another
// illustration, main group, …) reuse the view, which reloads what it shows.
const viewKey = (route: RouteLocationNormalizedLoaded) =>
  `${String(route.name)}|${session.langVersion}|${vehicleData.version}`;

// Remember whichever market is on screen (picked, linked or reached via back/forward).
watch(
  () => appState.value.market,
  (m) => {
    if (m && session.dump?.markets.includes(m)) pref.set("market", m);
  },
);

const showDrawer = computed(() => !!session.dump && !!appState.value.part);

// Drag and drop a folder anywhere on the page. Chrome/Edge hand over a real folder handle (which can
// be remembered for "Reopen"); other browsers give a FileSystemEntry that is read lazily.
function onDragOver(e: DragEvent) {
  if (!e.dataTransfer || ![...e.dataTransfer.types].includes("Files")) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
  document.body.classList.add("dragging-folder");
}
function onDragLeave(e: DragEvent) {
  if (!e.relatedTarget) document.body.classList.remove("dragging-folder");
}
async function onDrop(e: DragEvent) {
  document.body.classList.remove("dragging-folder");
  const item = [...(e.dataTransfer?.items ?? [])].find((i) => i.kind === "file");
  if (!item) return;
  e.preventDefault();
  // Both must be requested synchronously, before the first await.
  const getHandle = (item as any).getAsFileSystemHandle as
    | (() => Promise<FileSystemHandle | null>)
    | undefined;
  const handleP = getHandle ? getHandle.call(item).catch(() => null) : null;
  const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
  const handle = handleP ? await handleP : null;
  if (handle && handle.kind === "directory")
    await session.openHandle(handle as FileSystemDirectoryHandle);
  else if (entry && entry.isDirectory)
    await session.openRoot(new EntryDir(entry as FileSystemDirectoryEntry));
  else
    session.welcomeError =
      "That was a file, not a folder. Drag the dump’s brand folder onto the page.";
}

onMounted(() => {
  document.addEventListener("dragover", onDragOver);
  document.addEventListener("dragleave", onDragLeave);
  document.addEventListener("drop", onDrop);
  // Development: open the dump served by `DUMP=… vp dev` (add ?nodump to skip).
  if (import.meta.env.DEV && __DEV_DUMP__ && !new URLSearchParams(location.search).has("nodump"))
    session.openRoot(new HttpDir("/__dump/", __DEV_DUMP__));
});
onBeforeUnmount(() => {
  document.removeEventListener("dragover", onDragOver);
  document.removeEventListener("dragleave", onDragLeave);
  document.removeEventListener("drop", onDrop);
});
</script>

<template>
  <TopBar />
  <main>
    <WelcomeScreen v-if="!session.dump" />
    <RouterView v-else v-slot="{ Component, route }">
      <component :is="Component" :key="viewKey(route)" />
    </RouterView>
  </main>
  <PartDrawer v-if="showDrawer" />
  <ThumbPreview />
  <VehicleDataDialog
    v-if="vehicleData.dialogFor"
    :market="vehicleData.dialogFor.market"
    :kat="vehicleData.dialogFor.kat"
    @close="vehicleData.closeDialog()"
  />
</template>
