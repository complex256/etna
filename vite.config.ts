import vue from "@vitejs/plugin-vue";
import { defineConfig, lazyPlugins } from "vite-plus";
import { viteSingleFile } from "vite-plugin-singlefile";
import { dumpServer } from "./plugins/dump-server.ts";

// `DUMP=/path/to/dump/<brand> vp dev` opens that dump on start (see plugins/dump-server.ts).
export default defineConfig({
  base: "./",
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    testTimeout: 60_000,
  },
  // Transform every module at startup, so dependencies are found before the first page load
  // (otherwise a first visit can reload mid-way while Vite optimizes a late-found dependency).
  server: { warmup: { clientFiles: ["./src/**/*.vue", "./src/**/*.ts"] } },
  // One self-contained HTML file: open it from disk or host it anywhere.
  build: { target: "es2022", assetsInlineLimit: Number.MAX_SAFE_INTEGER, cssCodeSplit: false },
  plugins: lazyPlugins(() => [
    vue(),
    dumpServer(process.env.DUMP),
    viteSingleFile({ removeViteModuleLoader: true }),
  ]),
});
