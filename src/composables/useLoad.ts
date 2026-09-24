import { ref, shallowRef, watch, type WatchSource } from "vue";

/**
 * Loads data whenever `source` changes. Results of superseded loads are dropped, and the previous
 * data stays on screen until the new data arrives (no flicker between illustrations).
 */
export function useLoad<T>(source: WatchSource, load: () => Promise<T>) {
  const data = shallowRef<T | null>(null);
  const error = ref("");
  const loading = ref(true);
  let seq = 0;
  async function run() {
    const my = ++seq;
    loading.value = true;
    error.value = "";
    try {
      const v = await load();
      if (my === seq) data.value = v;
    } catch (e) {
      console.error(e);
      if (my === seq) error.value = (e as Error).message;
    } finally {
      if (my === seq) loading.value = false;
    }
  }
  watch(source, run, { immediate: true });
  return { data, error, loading, reload: run };
}
