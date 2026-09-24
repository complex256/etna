import { onBeforeUnmount, ref } from "vue";

/** A button label that briefly shows a confirmation ("Copied", "✓") and then reverts. */
export function useFlash(initial: string, ms = 1200) {
  const label = ref(initial);
  let timer = 0;
  function flash(msg: string) {
    clearTimeout(timer);
    label.value = msg;
    timer = window.setTimeout(() => (label.value = initial), ms);
  }
  onBeforeUnmount(() => clearTimeout(timer));
  return { label, flash };
}

export async function copyText(text: string, flash: (msg: string) => void) {
  try {
    await navigator.clipboard.writeText(text);
    flash("Copied");
  } catch {
    flash("Copy failed");
  }
}
