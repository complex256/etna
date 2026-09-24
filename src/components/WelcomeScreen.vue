<script setup lang="ts">
import { onMounted, ref, shallowRef } from "vue";
import { idb } from "../lib/storage";
import { useSession } from "../stores/session";

const session = useSession();
const canPick = "showDirectoryPicker" in window;
const saved = shallowRef<FileSystemDirectoryHandle | null>(null);
const fileInput = ref<HTMLInputElement>();
let filesLoading = false;
const layout =
  "dump/\n└─ <brand>/       brand folder\n   ├─ Data2/      OVERVIEW.BIN, 06_EN.BIN, R/, U/ …\n   ├─ Bilder/     illustrations (.tif)\n   └─ minis/      thumbnails (.png)";

onMounted(async () => {
  if (canPick) saved.value = await idb.get<FileSystemDirectoryHandle>("root");
});

// The browser enumerates the whole folder before the page hears anything, so say what is happening.
function pickAsFiles() {
  const input = fileInput.value!;
  input.value = "";
  filesLoading = true;
  session.startLoading(
    "Reading the folder",
    "Your browser lists every file in the folder before the viewer can start. For a full dump that can take a minute or two, and Chrome first asks you to confirm. Nothing is uploaded: the files stay on this computer.",
    cancelFiles,
  );
  input.click();
}
function cancelFiles() {
  filesLoading = false;
  session.loading = null;
}
async function onFiles(e: Event) {
  const files = (e.target as HTMLInputElement).files;
  filesLoading = false;
  if (!files || !files.length) return cancelFiles();
  await session.openFileList(files);
}
function onCancel() {
  if (filesLoading) cancelFiles();
}
</script>

<template>
  <div class="scroll" style="flex: 1">
    <div v-if="session.loading" class="welcome loading" aria-live="polite">
      <h1>{{ session.loading.title }}</h1>
      <progress
        :aria-label="session.loading.title"
        :max="session.loading.max || undefined"
        :value="session.loading.max ? session.loading.value : undefined"
      />
      <div class="loading-count num">{{ session.loading.label }}</div>
      <p class="dim">{{ session.loading.detail }}</p>
      <div v-if="session.loading.onCancel" class="actions">
        <button class="btn" @click="session.loading.onCancel()">Cancel</button>
      </div>
    </div>

    <div v-else-if="session.brandChoices" class="welcome">
      <h1>Choose a brand</h1>
      <div class="actions">
        <button
          v-for="b in session.brandChoices"
          :key="b.name"
          class="btn"
          @click="session.loadBrand(b)"
        >
          {{ b.name }}
        </button>
      </div>
    </div>

    <div v-else class="welcome">
      <h1>Browse a parts catalog</h1>
      <p>
        Open the folder of your catalog dump. Everything is read in this browser tab; nothing is
        uploaded.
      </p>
      <div v-if="session.welcomeError" class="msg">{{ session.welcomeError }}</div>
      <!-- Without the folder picker the only other way in is a file-list upload, which makes the
           browser list every file first. Dragging the folder reads it lazily, so it is the only
           option offered. -->
      <template v-if="canPick">
        <div class="actions">
          <button v-if="saved" class="btn primary" @click="session.reopen(saved)">
            Reopen {{ saved.name }}
          </button>
          <button :class="['btn', { primary: !saved }]" @click="session.pickFolder()">
            Open dump folder
          </button>
          <button
            class="btn"
            title="Slower: the browser lists every file before the viewer starts"
            @click="pickAsFiles"
          >
            Load folder as file list
          </button>
        </div>
        <div class="dropzone">
          <b>Or drag the dump folder onto this page.</b>
          <span class="dim"> Works the same as the button.</span>
        </div>
      </template>
      <div v-else class="dropzone big">
        <b>Drag the dump folder here</b>
        <span class="dim"
          >From Finder or your file manager. Folders are read only as the viewer needs them, so even
          a full dump opens right away.</span
        >
      </div>
      <p>
        Use the brand folder (such as AU) or the folder above it. The viewer expects this layout:
      </p>
      <div class="layout">{{ layout }}</div>
    </div>
    <input
      ref="fileInput"
      type="file"
      webkitdirectory
      multiple
      hidden
      @change="onFiles"
      @cancel="onCancel"
    />
  </div>
</template>
