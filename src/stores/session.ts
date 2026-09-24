// The open dump and everything around opening one: folder pickers, loading progress, language.
import { defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";
import { Dump, findBrands, setDump, type Brand } from "../lib/dump";
import { HandleDir, ListDir, type Dir } from "../lib/fs";
import { clearThumbnails, Illustrations } from "../lib/illustrations";
import { idb, pref } from "../lib/storage";
import { appState, go, router } from "../router";

export interface LoadingState {
  title: string;
  detail: string;
  /** Progress text, e.g. "12,000 of 90,000 files". */
  label: string;
  value: number;
  /** 0 = indeterminate. */
  max: number;
  onCancel: (() => void) | null;
}

export const useSession = defineStore("session", () => {
  const dump = shallowRef<Dump | null>(null);
  /** Bumped when the language changes: views re-render their texts. */
  const langVersion = ref(0);
  const loading = ref<LoadingState | null>(null);
  const welcomeError = ref("");
  const brandChoices = shallowRef<Brand[] | null>(null);
  const brandLabel = computed(() =>
    dump.value ? `${dump.value.brand} · ${dump.value.data.name}` : "",
  );

  function startLoading(title: string, detail = "", onCancel: (() => void) | null = null) {
    loading.value = { title, detail, label: "", value: 0, max: 0, onCancel };
  }
  function progress(label: string, value: number, max: number) {
    if (loading.value) Object.assign(loading.value, { label, value, max });
  }
  function fail(message: string) {
    loading.value = null;
    brandChoices.value = null;
    welcomeError.value = message;
  }

  async function openRoot(root: Dir) {
    welcomeError.value = "";
    if (!loading.value) startLoading("Opening the dump");
    Object.assign(loading.value!, {
      title: "Looking for catalog data",
      detail: "Finding the brand and data folders.",
    });
    try {
      const brands = await findBrands(root);
      if (!brands.length)
        return fail(
          `No catalog data found in “${root.name}”. Choose the brand folder that contains Data1 or Data2.`,
        );
      if (brands.length > 1) {
        loading.value = null;
        brandChoices.value = brands;
        return;
      }
      await loadBrand(brands[0]);
    } catch (e) {
      console.error(e);
      fail((e as Error).message);
    }
  }

  async function loadBrand(b: Brand) {
    brandChoices.value = null;
    startLoading(`Loading ${b.name}`, `Reading the vehicle index and texts from ${b.data.name}.`);
    try {
      const d = new Dump(b.name, b.brandDir, b.data);
      await d.init();
      await d.setLanguage(pref.get("lang", "EN"));
      Illustrations.clear();
      clearThumbnails();
      setDump(d);
      dump.value = d;
      loading.value = null;
      // Open the remembered market unless the URL names one this dump has.
      const s = appState.value;
      if (!s.market || !d.markets.includes(s.market)) {
        const saved = pref.get("market", "RDW");
        await go({ market: d.markets.includes(saved) ? saved : d.markets[0] }, true);
      }
    } catch (e) {
      console.error(e);
      fail((e as Error).message);
    }
  }

  async function setLanguage(code: string) {
    const d = dump.value;
    if (!d) return;
    pref.set("lang", code);
    await d.setLanguage(code);
    langVersion.value++;
  }

  /** Chrome/Edge folder picker. */
  async function pickFolder() {
    const t0 = performance.now();
    let handle: FileSystemDirectoryHandle;
    try {
      handle = await (window as any).showDirectoryPicker({ mode: "read" });
    } catch (e) {
      const err = e as DOMException;
      console.warn("showDirectoryPicker failed:", err);
      // A cancel after the dialog was on screen is fine; an instant rejection means Chrome never
      // showed it (blocked by policy, framed page, stale remembered folder, ...), so say so.
      if (err.name === "AbortError" && performance.now() - t0 > 700) return;
      welcomeError.value = `The browser did not open its folder picker (${err.name}: ${err.message}). Use “Load folder as file list” instead.`;
      return;
    }
    await openHandle(handle);
  }

  async function openHandle(handle: FileSystemDirectoryHandle) {
    void idb.set("root", handle);
    await openRoot(new HandleDir(handle));
  }

  async function reopen(handle: FileSystemDirectoryHandle) {
    try {
      const h = handle as any;
      if (
        (await h.queryPermission({ mode: "read" })) !== "granted" &&
        (await h.requestPermission({ mode: "read" })) !== "granted"
      ) {
        welcomeError.value = "Permission to read the folder was not granted.";
        return;
      }
      await openRoot(new HandleDir(handle));
    } catch (e) {
      fail((e as Error).message);
    }
  }

  /** The <input webkitdirectory> fallback: the browser lists every file first. */
  async function openFileList(files: FileList) {
    const fmt = new Intl.NumberFormat();
    startLoading("Indexing the folder", "Building a map of the dump’s files.");
    const root = await ListDir.from(files, (i, n) =>
      progress(`${fmt.format(i)} of ${fmt.format(n)} files`, i, n),
    );
    await openRoot(root);
  }

  /** Back to the welcome page (another dump, or after an error). */
  function close() {
    setDump(null);
    dump.value = null;
    void router.replace("/");
  }

  return {
    dump,
    langVersion,
    loading,
    welcomeError,
    brandChoices,
    brandLabel,
    startLoading,
    progress,
    openRoot,
    loadBrand,
    setLanguage,
    pickFolder,
    openHandle,
    reopen,
    openFileList,
    close,
  };
});

// Holds app-wide state: a hot update would create a second copy of it, so reload instead.
import.meta.hot?.accept(() => location.reload());
