// The open dump and everything around opening one: folder pickers, loading progress, language.
import { defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";
import { Dump, findBrands, setDump, type Brand } from "../lib/dump";
import { HandleDir, ListDir, MemoryDir, RemoteDir, type Dir } from "../lib/fs";
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

  async function openRoot(root: Dir, { remote = false } = {}) {
    welcomeError.value = "";
    if (!remote) forgetLink();
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

  /** The dump link of the page (?dump=…), kept in the address so every page can be shared. */
  const dumpLink = ref(new URLSearchParams(location.search).get("dump") || "");

  /**
   * Opens a dump hosted as static files (see lib/manifest.ts). `remember`: put the link in the
   * address (?dump=) and offer it again on the welcome page.
   */
  async function openUrl(link: string, { remember = true } = {}) {
    welcomeError.value = "";
    let host = link;
    try {
      host = new URL(link.replace(/^ipfs:\/\//i, "https://ipfs.io/ipfs/")).host;
    } catch {
      /* shown as typed */
    }
    startLoading(
      `Opening ${host}`,
      "Reading the dump’s file list, then its vehicle index and texts over the network.",
    );
    try {
      const root = await RemoteDir.open(link);
      if (remember) {
        dumpLink.value = link;
        pref.set("dumpLink", link);
        const url = new URL(location.href);
        url.searchParams.set("dump", link);
        history.replaceState(history.state, "", url);
      }
      await openRoot(root, { remote: true });
    } catch (e) {
      console.error(e);
      fail((e as Error).message);
    }
  }
  /** A local folder or the demo is open: the address no longer names a hosted dump. */
  function forgetLink() {
    if (!dumpLink.value) return;
    dumpLink.value = "";
    const url = new URL(location.href);
    url.searchParams.delete("dump");
    history.replaceState(history.state, "", url);
  }

  /** The built-in demo catalog of a toy car (built on demand: the generator loads only now). */
  async function openDemo() {
    welcomeError.value = "";
    startLoading(
      "Building the demo catalog",
      "A made-up ride-on toy car, drawn and written in the dump formats.",
    );
    try {
      const { buildDemoFiles } = await import("../demo");
      await openRoot(MemoryDir.from(await buildDemoFiles()));
    } catch (e) {
      console.error(e);
      fail((e as Error).message);
    }
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
    openDemo,
    openUrl,
    dumpLink,
    close,
  };
});

// Holds app-wide state: a hot update would create a second copy of it, so reload instead.
import.meta.hot?.accept(() => location.reload());
