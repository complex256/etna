/// <reference types="vite/client" />

/** Development: name of the dump folder served at /__dump/ (DUMP), or null. */
declare const __DEV_DUMP__: string | null;

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, unknown>;
  export default component;
}
